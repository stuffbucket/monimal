#!/usr/bin/env python3
"""Persistent GLiNER2 classifier worker for the Maximal runner."""

from __future__ import annotations

import gc
import hashlib
import importlib.metadata
import json
import os
import sys
from contextlib import redirect_stdout
from pathlib import Path
from typing import Any

EXPECTED_VERSIONS = {
    "gliner2": "2.0.0",
    "torch": "2.7.0",
    "transformers": "4.57.6",
}
PROTOCOL = 1


def emit(event: dict[str, Any]) -> None:
    print(json.dumps(event, separators=(",", ":"), ensure_ascii=False), flush=True)


def fail(reason: str, request_id: str | None = None) -> None:
    event: dict[str, Any] = {"kind": "failed", "reason": reason}
    if request_id is not None:
        event["id"] = request_id
    emit(event)


def require_runtime() -> tuple[Any, Any, Any, Any]:
    if sys.version_info[:2] != (3, 12):
        raise RuntimeError(
            "The GLiNER2 runner requires CPython 3.12; "
            f"received {sys.version_info.major}.{sys.version_info.minor}."
        )
    versions = {
        package: importlib.metadata.version(package) for package in EXPECTED_VERSIONS
    }
    mismatches = [
        f"{package}=={actual} (expected {expected})"
        for package, expected in EXPECTED_VERSIONS.items()
        if (actual := versions[package]) != expected
    ]
    if mismatches:
        raise RuntimeError(
            "The GLiNER2 runtime does not match the pinned environment: "
            + ", ".join(mismatches)
        )

    import torch
    from gliner2.classification import ClassificationConfig
    from gliner2.classification import ClassificationSchema
    from gliner2.classification import Classifier

    return torch, ClassificationConfig, ClassificationSchema, Classifier


TORCH, CLASSIFICATION_CONFIG, CLASSIFICATION_SCHEMA, CLASSIFIER = require_runtime()


def selected_device() -> str:
    requested = os.environ.get("MAXIMAL_GLINER2_DEVICE", "auto")
    if requested not in {"auto", "cpu", "mps"}:
        raise RuntimeError(f"Unsupported GLiNER2 device {requested!r}.")
    if requested == "mps" and not TORCH.backends.mps.is_available():
        raise RuntimeError("The GLiNER2 runner requires MPS, but MPS is unavailable.")
    if requested == "auto":
        return "mps" if TORCH.backends.mps.is_available() else "cpu"
    return requested


DEVICE = selected_device()
LOADED: tuple[str, Any] | None = None


def verify_weight(model: dict[str, Any]) -> None:
    from huggingface_hub import hf_hub_download

    path = Path(
        hf_hub_download(
            repo_id=model["model"],
            filename="model.safetensors",
            revision=model["revision"],
        )
    )
    size = path.stat().st_size
    if size != model["weightBytes"]:
        raise RuntimeError(
            f"Model weight size is {size}; expected {model['weightBytes']}."
        )
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    actual = digest.hexdigest()
    if actual != model["weightSha256"]:
        raise RuntimeError(
            f"Model weight SHA-256 is {actual}; expected {model['weightSha256']}."
        )


def classifier(model: dict[str, Any]) -> Any:
    global LOADED
    identity = f"{model['model']}@{model['revision']}"
    if LOADED is not None and LOADED[0] == identity:
        return LOADED[1]

    if LOADED is not None:
        LOADED = None
        gc.collect()
        if TORCH.backends.mps.is_available():
            TORCH.mps.empty_cache()

    verify_weight(model)
    with redirect_stdout(sys.stderr):
        loaded = CLASSIFIER.from_pretrained(
            model["model"],
            revision=model["revision"],
            map_location=DEVICE,
            quantize=DEVICE != "cpu",
        )
    loaded.eval()
    LOADED = (identity, loaded)
    return loaded


def schema_for(tasks: list[dict[str, Any]]) -> Any:
    schema = CLASSIFICATION_SCHEMA()
    for task in tasks:
        labels = {
            label["value"]: label.get("description") for label in task["labels"]
        }
        options = {"instruction": task.get("prompt")}
        if task.get("ordered", False):
            schema.ordinal(task["name"], labels, **options)
        else:
            schema.single(task["name"], labels, **options)
    return schema


def input_tokens(loaded: Any, text: str, schema: Any) -> int:
    compiled = loaded.compile_schema(schema)
    batch = loaded.model.processor.collate_fn_inference(
        [(text, compiled.build())]
    )
    return int(batch.attention_mask.sum().item())


def classify(request: dict[str, Any]) -> dict[str, Any]:
    loaded = classifier(request["model"])
    schema = schema_for(request["tasks"])
    with redirect_stdout(sys.stderr):
        tokens = input_tokens(loaded, request["text"], schema)
        result = loaded.classify(
            request["text"],
            schema,
            config=CLASSIFICATION_CONFIG(include_confidence=True),
        )
    tasks = [
        {
            "name": task["name"],
            "probabilities": {
                label["value"]: float(
                    result.probabilities(task["name"])[label["value"]]
                )
                for label in task["labels"]
            },
        }
        for task in request["tasks"]
    ]
    return {
        "kind": "classify-labels",
        "model": request["requestedModel"],
        "tasks": tasks,
        "usage": {"inputTokens": tokens, "outputTokens": 0},
    }


def main() -> None:
    emit(
        {
            "kind": "ready",
            "protocol": PROTOCOL,
            "versions": {
                **EXPECTED_VERSIONS,
                "python": ".".join(str(part) for part in sys.version_info[:3]),
                "device": DEVICE,
            },
        }
    )
    for line in sys.stdin:
        if not line.strip():
            continue
        request_id: str | None = None
        try:
            request = json.loads(line)
            request_id = request.get("id")
            if request.get("kind") != "classify-labels":
                raise ValueError(f"Unsupported request kind {request.get('kind')!r}.")
            emit(
                {
                    "kind": "classification",
                    "id": request_id,
                    "result": classify(request),
                }
            )
        except Exception as error:
            fail(f"{type(error).__name__}: {error}", request_id)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        fail(f"{type(error).__name__}: {error}")
        raise

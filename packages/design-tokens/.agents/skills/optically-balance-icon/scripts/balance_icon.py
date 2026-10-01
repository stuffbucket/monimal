#!/usr/bin/env python3
"""Propose optical SVG corrections using raster evidence.

Install the pinned dependencies with install_dependencies.py. That installer
routes requests through the proxy configured in ~/.npmrc.
"""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from datetime import date
import hashlib
from html import escape
from io import BytesIO
import json
import math
from pathlib import Path
import statistics
import sys
from typing import Any, Iterable
import xml.etree.ElementTree as ET

try:
    import cairosvg
    from PIL import Image, ImageFilter
except ImportError as error:
    print(
        "missing Python dependencies; run scripts/install_dependencies.py "
        "to install them through the proxy configured in ~/.npmrc",
        file=sys.stderr,
    )
    raise SystemExit(2) from error


BLUR_LEVELS = ((0.5, 0.5), (1.0, 0.35), (2.0, 0.15))
SHAPE_SCALE_BIAS = {
    "curved": 1.02,
    "pointed": 1.04,
    "diagonal-heavy": 1.015,
    "open": 1.02,
    "dense": 0.98,
}
ALLOWED_HINTS = set(SHAPE_SCALE_BIAS) | {"asymmetric", "brand"}


@dataclass(frozen=True)
class Scenario:
    slot: int
    density: int
    state_name: str
    foreground: str
    background: str

    @property
    def key(self) -> str:
        return f"{self.slot}px@{self.density}x:{self.state_name}"


@dataclass(frozen=True)
class Metrics:
    mass: float
    center_x: float
    center_y: float
    radius: float
    edge_penalty: float


@dataclass(frozen=True)
class Search:
    minimum_scale: float = 0.85
    maximum_scale: float = 1.15
    maximum_translation: float = 1.0
    translation_snap: float = 0.25


def fail(message: str) -> None:
    raise ValueError(message)


def parse_color(value: str) -> tuple[int, int, int, int]:
    if not isinstance(value, str) or not value.startswith("#"):
        fail(f"invalid color {value!r}; expected a CSS hex color")
    digits = value[1:]
    if len(digits) in {3, 4}:
        digits = "".join(character * 2 for character in digits)
    if len(digits) == 6:
        digits += "ff"
    if len(digits) != 8:
        fail(f"invalid color {value!r}; expected #RGB, #RRGGBB, or #RRGGBBAA")
    try:
        return tuple(int(digits[index : index + 2], 16) for index in range(0, 8, 2))  # type: ignore[return-value]
    except ValueError:
        fail(f"invalid color {value!r}; expected hexadecimal digits")


def resolve_path(config_path: Path, raw_path: Any, label: str) -> Path:
    if not isinstance(raw_path, str) or not raw_path:
        fail(f"{label}.path must be a non-empty string")
    path = Path(raw_path).expanduser()
    if not path.is_absolute():
        path = config_path.parent / path
    path = path.resolve()
    if not path.is_file():
        fail(f"{label}.path does not exist: {path}")
    if path.suffix.lower() != ".svg":
        fail(f"{label}.path must identify an SVG file: {path}")
    return path


def load_config(config_path: Path) -> dict[str, Any]:
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"cannot read configuration {config_path}: {error}")
    if not isinstance(config, dict):
        fail("configuration root must be an object")

    required = {
        "role",
        "candidate",
        "references",
        "referenceFamily",
        "slots",
        "densities",
        "states",
    }
    missing = sorted(required - config.keys())
    if missing:
        fail(f"configuration is missing: {', '.join(missing)}")
    if not isinstance(config["role"], str) or not config["role"].strip():
        fail("role must be a non-empty string")
    if config["referenceFamily"] not in {"interface", "brand"}:
        fail("referenceFamily must be interface or brand")

    candidate = config["candidate"]
    if not isinstance(candidate, dict) or not isinstance(candidate.get("name"), str):
        fail("candidate must contain name and path")
    candidate["resolvedPath"] = resolve_path(config_path, candidate.get("path"), "candidate")

    references = config["references"]
    if not isinstance(references, list) or not 5 <= len(references) <= 10:
        fail("references must contain 5–10 approved icons")
    reference_names: set[str] = set()
    for index, reference in enumerate(references):
        if not isinstance(reference, dict) or not isinstance(reference.get("name"), str):
            fail(f"references[{index}] must contain name and path")
        if reference["name"] in reference_names:
            fail(f"duplicate reference name: {reference['name']}")
        reference_names.add(reference["name"])
        reference["resolvedPath"] = resolve_path(
            config_path, reference.get("path"), f"references[{index}]"
        )

    slots = config["slots"]
    if (
        not isinstance(slots, list)
        or not slots
        or any(not isinstance(slot, int) or not 8 <= slot <= 128 for slot in slots)
    ):
        fail("slots must contain CSS-pixel integers from 8 through 128")
    if len(set(slots)) != len(slots):
        fail("slots must be unique")

    densities = config["densities"]
    if (
        not isinstance(densities, list)
        or not densities
        or any(density not in {1, 2, 3} for density in densities)
    ):
        fail("densities must contain unique values from 1, 2, and 3")
    if len(set(densities)) != len(densities):
        fail("densities must be unique")

    states = config["states"]
    if not isinstance(states, list) or not states:
        fail("states must contain at least one rendered state")
    state_names: set[str] = set()
    for index, state in enumerate(states):
        if not isinstance(state, dict) or set(state) != {"name", "foreground", "background"}:
            fail(f"states[{index}] must contain only name, foreground, and background")
        if not isinstance(state["name"], str) or not state["name"]:
            fail(f"states[{index}].name must be a non-empty string")
        if state["name"] in state_names:
            fail(f"duplicate state name: {state['name']}")
        state_names.add(state["name"])
        parse_color(state["foreground"])
        parse_color(state["background"])

    hints = config.get("shapeHints", [])
    if not isinstance(hints, list) or any(hint not in ALLOWED_HINTS for hint in hints):
        fail(f"shapeHints must contain only: {', '.join(sorted(ALLOWED_HINTS))}")
    if len(set(hints)) != len(hints):
        fail("shapeHints must be unique")
    if "brand" in hints and config["referenceFamily"] != "brand":
        fail("brand shape hints require a brand referenceFamily")

    raw_search = config.get("search", {})
    if not isinstance(raw_search, dict):
        fail("search must be an object")
    unknown_search = set(raw_search) - {
        "minimumScale",
        "maximumScale",
        "maximumTranslation",
        "translationSnap",
    }
    if unknown_search:
        fail(f"search contains unsupported keys: {', '.join(sorted(unknown_search))}")
    search = Search(
        minimum_scale=float(raw_search.get("minimumScale", 0.85)),
        maximum_scale=float(raw_search.get("maximumScale", 1.15)),
        maximum_translation=float(raw_search.get("maximumTranslation", 1.0)),
        translation_snap=float(raw_search.get("translationSnap", 0.25)),
    )
    if not 0.5 <= search.minimum_scale <= 1:
        fail("search.minimumScale must be from 0.5 through 1")
    if not 1 <= search.maximum_scale <= 2:
        fail("search.maximumScale must be from 1 through 2")
    if search.minimum_scale >= search.maximum_scale:
        fail("search.minimumScale must be below search.maximumScale")
    if not 0 < search.maximum_translation <= 4:
        fail("search.maximumTranslation must be greater than 0 and at most 4")
    if search.translation_snap not in {0.125, 0.25, 0.5, 1.0}:
        fail("search.translationSnap must be 0.125, 0.25, 0.5, or 1")
    config["validatedSearch"] = search
    return config


def svg_for_state(path: Path, foreground: str) -> bytes:
    try:
        root = ET.fromstring(path.read_bytes())
    except (OSError, ET.ParseError) as error:
        fail(f"cannot parse SVG {path}: {error}")
    if root.tag.split("}")[-1] != "svg":
        fail(f"SVG root element is missing in {path}")
    if "viewBox" not in root.attrib:
        fail(f"SVG must define a viewBox: {path}")
    prior_style = root.attrib.get("style", "")
    separator = "" if not prior_style or prior_style.rstrip().endswith(";") else ";"
    root.attrib["style"] = f"{prior_style}{separator}color:{foreground}"
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def rasterize(path: Path, scenario: Scenario) -> Image.Image:
    size = scenario.slot * scenario.density
    try:
        png = cairosvg.svg2png(
            bytestring=svg_for_state(path, scenario.foreground),
            output_width=size,
            output_height=size,
        )
        image = Image.open(BytesIO(png))
        image.load()
        return image.convert("RGBA")
    except Exception as error:
        fail(f"cannot rasterize {path} for {scenario.key}: {error}")


def linear_channel(channel: int) -> float:
    value = channel / 255
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def luminance(color: tuple[int, int, int, int]) -> float:
    red, green, blue, _ = color
    return (
        0.2126 * linear_channel(red)
        + 0.7152 * linear_channel(green)
        + 0.0722 * linear_channel(blue)
    )


def measure(image: Image.Image, scenario: Scenario) -> Metrics:
    width, height = image.size
    background_luminance = luminance(parse_color(scenario.background))
    contrast: list[float] = []
    for red, green, blue, alpha in image.getdata():
        pixel_luminance = luminance((red, green, blue, alpha))
        contrast.append((alpha / 255) * abs(pixel_luminance - background_luminance))

    contrast_image = Image.new("L", image.size)
    contrast_image.putdata([round(value * 255) for value in contrast])
    perceived = [0.0] * (width * height)
    for sigma, weight in BLUR_LEVELS:
        blurred = contrast_image.filter(
            ImageFilter.GaussianBlur(radius=sigma * scenario.density)
        )
        for index, value in enumerate(blurred.getdata()):
            perceived[index] += weight * ((value / 255) ** 0.8)

    mass = sum(perceived)
    if mass <= 1e-9:
        fail(f"rendered icon has no perceptible contrast in {scenario.key}")
    center_x = sum((index % width + 0.5) * value for index, value in enumerate(perceived)) / mass
    center_y = sum((index // width + 0.5) * value for index, value in enumerate(perceived)) / mass
    variance = sum(
        value
        * (
            (index % width + 0.5 - center_x) ** 2
            + (index // width + 0.5 - center_y) ** 2
        )
        for index, value in enumerate(perceived)
    ) / mass
    edge_width = max(1, scenario.density)
    edge_mass = sum(
        value
        for index, value in enumerate(perceived)
        if index % width < edge_width
        or index % width >= width - edge_width
        or index // width < edge_width
        or index // width >= height - edge_width
    )
    return Metrics(
        mass=mass,
        center_x=center_x,
        center_y=center_y,
        radius=math.sqrt(variance),
        edge_penalty=edge_mass / mass,
    )


def transform_image(
    source: Image.Image, scale: float, offset_x: float, offset_y: float, density: int
) -> Image.Image:
    width, height = source.size
    resized_width = max(1, round(width * scale))
    resized_height = max(1, round(height * scale))
    resized = source.resize((resized_width, resized_height), Image.Resampling.LANCZOS)
    left = round((width - resized_width) / 2 + offset_x * density)
    top = round((height - resized_height) / 2 + offset_y * density)
    canvas = Image.new("RGBA", source.size, (0, 0, 0, 0))

    source_left = max(0, -left)
    source_top = max(0, -top)
    source_right = min(resized_width, width - left)
    source_bottom = min(resized_height, height - top)
    if source_right > source_left and source_bottom > source_top:
        crop = resized.crop((source_left, source_top, source_right, source_bottom))
        canvas.alpha_composite(crop, (max(0, left), max(0, top)))
    return canvas


def median_metrics(metrics: Iterable[Metrics]) -> Metrics:
    values = list(metrics)
    return Metrics(
        mass=statistics.median(value.mass for value in values),
        center_x=statistics.median(value.center_x for value in values),
        center_y=statistics.median(value.center_y for value in values),
        radius=statistics.median(value.radius for value in values),
        edge_penalty=statistics.median(value.edge_penalty for value in values),
    )


def frange(start: float, stop: float, step: float) -> list[float]:
    count = max(0, math.floor((stop - start) / step + 1e-9))
    return [round(start + index * step, 6) for index in range(count + 1)]


def candidate_score(
    images: dict[str, Image.Image],
    targets: dict[str, Metrics],
    scenarios: list[Scenario],
    scale: float,
    offset_x: float,
    offset_y: float,
) -> float:
    scores = []
    for scenario in scenarios:
        metrics = measure(
            transform_image(images[scenario.key], scale, offset_x, offset_y, scenario.density),
            scenario,
        )
        target = targets[scenario.key]
        slot_center = scenario.slot * scenario.density / 2
        center_distance = math.hypot(
            metrics.center_x - slot_center, metrics.center_y - slot_center
        ) / scenario.density
        scores.append(
            1.0 * math.log(metrics.mass / target.mass) ** 2
            + 0.7 * center_distance**2
            + 0.8 * math.log(metrics.radius / target.radius) ** 2
            + 2.0 * metrics.edge_penalty**2
        )
    return statistics.mean(scores)


def find_proposal(
    images: dict[str, Image.Image],
    targets: dict[str, Metrics],
    scenarios: list[Scenario],
    search: Search,
    hints: list[str],
) -> tuple[float, float, float, float]:
    best = (math.inf, 1.0, 0.0, 0.0)

    def consider(scales: Iterable[float], offsets: Iterable[float]) -> None:
        nonlocal best
        offset_values = list(offsets)
        for scale in scales:
            for offset_y in offset_values:
                for offset_x in offset_values:
                    score = candidate_score(
                        images, targets, scenarios, scale, offset_x, offset_y
                    )
                    if (score, abs(offset_x) + abs(offset_y), abs(scale - 1)) < (
                        best[0],
                        abs(best[2]) + abs(best[3]),
                        abs(best[1] - 1),
                    ):
                        best = (score, scale, offset_x, offset_y)

    consider(
        frange(search.minimum_scale, search.maximum_scale, 0.025),
        frange(-search.maximum_translation, search.maximum_translation, 0.5),
    )
    _, scale, offset_x, offset_y = best
    consider(
        (
            value
            for value in frange(scale - 0.02, scale + 0.02, 0.005)
            if search.minimum_scale <= value <= search.maximum_scale
        ),
        (
            value
            for value in frange(
                max(-search.maximum_translation, min(offset_x, offset_y) - 0.5),
                min(search.maximum_translation, max(offset_x, offset_y) + 0.5),
                search.translation_snap,
            )
        ),
    )
    score, scale, offset_x, offset_y = best
    bias = math.prod(SHAPE_SCALE_BIAS[hint] for hint in hints if hint in SHAPE_SCALE_BIAS)
    scale = min(search.maximum_scale, max(search.minimum_scale, scale * bias))
    scale = round(scale / 0.005) * 0.005
    offset_x = round(offset_x / search.translation_snap) * search.translation_snap
    offset_y = round(offset_y / search.translation_snap) * search.translation_snap
    score = candidate_score(images, targets, scenarios, scale, offset_x, offset_y)
    return scale, offset_x, offset_y, score


def fingerprint(paths: Iterable[Path]) -> str:
    digest = hashlib.sha256()
    for path in sorted(paths):
        digest.update(str(path).encode())
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return f"sha256:{digest.hexdigest()}"


def rounded_metrics(metrics: Metrics, density: int) -> dict[str, float]:
    result = asdict(metrics)
    result["center_x"] /= density
    result["center_y"] /= density
    result["radius"] /= density
    return {key: round(value, 6) for key, value in result.items()}


def build_review_cues(
    hints: list[str], boundary: bool, low_contrast_states: list[str]
) -> list[str]:
    cues = []
    if boundary:
        cues.append("The proposal reaches a search limit; inspect the glyph and viewport.")
    if low_contrast_states:
        cues.append(
            "Review low-contrast states in product: " + ", ".join(low_contrast_states) + "."
        )
    if "pointed" in hints:
        cues.append("Confirm pointed-form overshoot against flat-sided references.")
    if "asymmetric" in hints:
        cues.append("Confirm semantic visual gravity rather than geometric symmetry.")
    if "brand" in hints:
        cues.append("Require designer approval against brand-mark references.")
    if "open" in hints:
        cues.append("Confirm the open form does not appear undersized.")
    if "dense" in hints:
        cues.append("Confirm internal detail remains legible at the smallest slot.")
    return cues


def write_preview(
    output_dir: Path,
    config: dict[str, Any],
    scenarios: list[Scenario],
    candidate_images: dict[str, Image.Image],
    reference_images: dict[tuple[str, str], Image.Image],
    proposal: tuple[float, float, float],
) -> None:
    preview_dir = output_dir / "previews"
    preview_dir.mkdir(parents=True, exist_ok=True)
    scale, offset_x, offset_y = proposal
    representative = [
        scenario
        for scenario in scenarios
        if scenario.density == max(config["densities"])
    ]
    rows = []
    for scenario in representative:
        slug = hashlib.sha256(scenario.key.encode()).hexdigest()[:12]
        before_name = f"{slug}-candidate-before.png"
        after_name = f"{slug}-candidate-after.png"
        candidate_images[scenario.key].save(preview_dir / before_name)
        transform_image(
            candidate_images[scenario.key],
            scale,
            offset_x,
            offset_y,
            scenario.density,
        ).save(preview_dir / after_name)
        cells = [
            f'<figure><img src="previews/{before_name}"><figcaption>candidate before</figcaption></figure>',
            f'<figure><img src="previews/{after_name}"><figcaption>candidate proposed</figcaption></figure>',
        ]
        for reference in config["references"]:
            reference_name = f"{slug}-{hashlib.sha256(reference['name'].encode()).hexdigest()[:8]}.png"
            reference_images[(scenario.key, reference["name"])].save(
                preview_dir / reference_name
            )
            cells.append(
                f'<figure><img src="previews/{reference_name}">'
                f"<figcaption>{escape(reference['name'])}</figcaption></figure>"
            )
        rows.append(
            f"<section><h2>{escape(scenario.key)}</h2><div class=\"rail\">"
            + "".join(cells)
            + "</div></section>"
        )
    html = f"""<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<title>Optical balance review: {escape(config["candidate"]["name"])}</title>
<style>
body {{ color: #24292f; background: #fff; font: 14px system-ui; margin: 24px; }}
.rail {{ align-items: center; display: flex; flex-wrap: wrap; gap: 20px; }}
figure {{ margin: 0; text-align: center; }}
img {{ image-rendering: auto; min-height: 48px; min-width: 48px; object-fit: contain; }}
figcaption {{ margin-top: 6px; }}
@media (prefers-color-scheme: dark) {{
  body {{ color: #f0f6fc; background: #0d1117; }}
}}
</style>
<h1>{escape(config["candidate"]["name"])} in {escape(config["role"])}</h1>
<p>Proposed transform: translate({offset_x:g}px, {offset_y:g}px) scale({scale:g})</p>
{"".join(rows)}
</html>
"""
    (output_dir / "preview.html").write_text(html, encoding="utf-8")


def run(config_path: Path, output_dir: Path) -> dict[str, Any]:
    config = load_config(config_path)
    search: Search = config["validatedSearch"]
    scenarios = [
        Scenario(
            slot=slot,
            density=density,
            state_name=state["name"],
            foreground=state["foreground"],
            background=state["background"],
        )
        for slot in config["slots"]
        for density in config["densities"]
        for state in config["states"]
    ]
    candidate_path: Path = config["candidate"]["resolvedPath"]
    candidate_images = {
        scenario.key: rasterize(candidate_path, scenario) for scenario in scenarios
    }
    reference_images: dict[tuple[str, str], Image.Image] = {}
    targets: dict[str, Metrics] = {}
    for scenario in scenarios:
        reference_metrics = []
        for reference in config["references"]:
            image = rasterize(reference["resolvedPath"], scenario)
            reference_images[(scenario.key, reference["name"])] = image
            reference_metrics.append(measure(image, scenario))
        targets[scenario.key] = median_metrics(reference_metrics)

    scale, offset_x, offset_y, score = find_proposal(
        candidate_images,
        targets,
        scenarios,
        search,
        config.get("shapeHints", []),
    )
    boundary = (
        math.isclose(scale, search.minimum_scale, abs_tol=0.005)
        or math.isclose(scale, search.maximum_scale, abs_tol=0.005)
        or math.isclose(abs(offset_x), search.maximum_translation, abs_tol=1e-9)
        or math.isclose(abs(offset_y), search.maximum_translation, abs_tol=1e-9)
    )
    low_contrast_states = sorted(
        {
            scenario.state_name
            for scenario in scenarios
            if abs(
                luminance(parse_color(scenario.foreground))
                - luminance(parse_color(scenario.background))
            )
            < 0.12
        }
    )
    per_scenario = {}
    for scenario in scenarios:
        before = measure(candidate_images[scenario.key], scenario)
        after = measure(
            transform_image(
                candidate_images[scenario.key],
                scale,
                offset_x,
                offset_y,
                scenario.density,
            ),
            scenario,
        )
        per_scenario[scenario.key] = {
            "referenceMedian": rounded_metrics(targets[scenario.key], scenario.density),
            "candidateBefore": rounded_metrics(before, scenario.density),
            "candidateProposed": rounded_metrics(after, scenario.density),
        }

    source_paths = [candidate_path] + [
        reference["resolvedPath"] for reference in config["references"]
    ]
    report = {
        "schemaVersion": 1,
        "generatedOn": date.today().isoformat(),
        "role": config["role"],
        "candidate": config["candidate"]["name"],
        "referenceFamily": config["referenceFamily"],
        "referenceNames": [reference["name"] for reference in config["references"]],
        "sourceFingerprint": fingerprint([candidate_path]),
        "referenceFingerprint": fingerprint(source_paths[1:]),
        "proposal": {
            "scale": scale,
            "translateX": offset_x,
            "translateY": offset_y,
            "cssTransform": f"translate({offset_x:g}px, {offset_y:g}px) scale({scale:g})",
            "objectiveScore": round(score, 8),
            "atSearchBoundary": boundary,
        },
        "tokenMetadata": {
            "extensions": {
                "com.maximal.iconOpticalBalance": {
                    "scale": scale,
                    "translateX": f"{offset_x:g}px",
                    "translateY": f"{offset_y:g}px",
                    "sourceFingerprint": fingerprint([candidate_path]),
                    "referenceFingerprint": fingerprint(source_paths[1:]),
                    "reviewed": False,
                }
            }
        },
        "reviewCues": build_review_cues(
            config.get("shapeHints", []), boundary, low_contrast_states
        ),
        "scenarios": per_scenario,
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "report.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    write_preview(
        output_dir,
        config,
        scenarios,
        candidate_images,
        reference_images,
        (scale, offset_x, offset_y),
    )
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Propose an optical scale and translation for a monochrome SVG icon."
    )
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    arguments = parser.parse_args(argv)
    try:
        report = run(arguments.config.resolve(), arguments.output_dir.resolve())
    except (OSError, ValueError) as error:
        print(f"optical balance failed: {error}", file=sys.stderr)
        return 1
    proposal = report["proposal"]
    print(
        "proposed "
        f"scale={proposal['scale']:g} "
        f"x={proposal['translateX']:g}px "
        f"y={proposal['translateY']:g}px"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

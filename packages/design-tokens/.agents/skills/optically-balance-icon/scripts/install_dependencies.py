#!/usr/bin/env python3
"""Install pinned dependencies through the proxy configured in ~/.npmrc."""

from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlsplit, urlunsplit
import venv


def read_pypi_index(npmrc: Path) -> str:
    if not npmrc.is_file():
        raise RuntimeError(f"npm configuration not found at {npmrc}")

    values: dict[str, str] = {}
    for raw_line in npmrc.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith(("#", ";")) or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip().lower()] = os.path.expandvars(value.strip())

    registry = values.get("registry")
    if not registry:
        raise RuntimeError(
            f"{npmrc} must define the package feed proxy as registry before "
            "Python dependencies can be requested"
        )
    parsed = urlsplit(registry)
    if (
        parsed.scheme != "https"
        or parsed.hostname != "packagefeedproxy.microsoft.io"
        or parsed.path.rstrip("/") != "/npm"
    ):
        raise RuntimeError(f"{npmrc} registry is not the approved package feed proxy")
    return urlunsplit((parsed.scheme, parsed.netloc, "/pypi/simple", "", ""))


def main() -> int:
    script_dir = Path(__file__).resolve().parent
    try:
        index_url = read_pypi_index(Path.home() / ".npmrc")
        virtual_environment = script_dir.parent / ".venv"
        venv.EnvBuilder(with_pip=True).create(virtual_environment)
        if os.name == "nt":
            python = virtual_environment / "Scripts" / "python.exe"
        else:
            python = virtual_environment / "bin" / "python"
        environment = os.environ.copy()
        environment["PIP_INDEX_URL"] = index_url
        environment.pop("PIP_EXTRA_INDEX_URL", None)
        environment.pop("__PYVENV_LAUNCHER__", None)
        subprocess.run(
            [
                str(python),
                "-m",
                "pip",
                "install",
                "--requirement",
                str(script_dir / "requirements.txt"),
                "--disable-pip-version-check",
            ],
            check=True,
            env=environment,
        )
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"dependency installation failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

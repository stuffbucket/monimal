from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).parents[1] / "scripts" / "install_dependencies.py"
SPEC = importlib.util.spec_from_file_location("install_dependencies", SCRIPT)
assert SPEC and SPEC.loader
install_dependencies = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = install_dependencies
SPEC.loader.exec_module(install_dependencies)


class InstallDependenciesTest(unittest.TestCase):
    def test_maps_configured_npm_feed_to_pypi(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            npmrc = Path(directory) / ".npmrc"
            npmrc.write_text(
                "registry=https://packagefeedproxy.microsoft.io/npm/\n",
                encoding="utf-8",
            )

            self.assertEqual(
                install_dependencies.read_pypi_index(npmrc),
                "https://packagefeedproxy.microsoft.io/pypi/simple",
            )

    def test_rejects_unapproved_registry(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            npmrc = Path(directory) / ".npmrc"
            npmrc.write_text("registry=https://registry.npmjs.org/\n", encoding="utf-8")

            with self.assertRaisesRegex(RuntimeError, "approved package feed proxy"):
                install_dependencies.read_pypi_index(npmrc)


if __name__ == "__main__":
    unittest.main()

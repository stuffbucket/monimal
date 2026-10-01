from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).parents[1] / "scripts" / "balance_icon.py"
SPEC = importlib.util.spec_from_file_location("balance_icon", SCRIPT)
assert SPEC and SPEC.loader
balance_icon = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = balance_icon
SPEC.loader.exec_module(balance_icon)


class BalanceIconTest(unittest.TestCase):
    def run_with_icons(self, candidate_svg: str, reference_svg: str) -> dict:
        temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(temporary_directory.cleanup)
        root = Path(temporary_directory.name)
        candidate = root / "candidate.svg"
        candidate.write_text(candidate_svg, encoding="utf-8")
        references = []
        for index in range(5):
            reference = root / f"reference-{index}.svg"
            reference.write_text(reference_svg, encoding="utf-8")
            references.append({"name": f"reference-{index}", "path": str(reference)})
        config = {
            "role": "test",
            "candidate": {"name": "candidate", "path": str(candidate)},
            "references": references,
            "referenceFamily": "interface",
            "slots": [16],
            "densities": [1],
            "states": [
                {
                    "name": "normal",
                    "foreground": "#000000",
                    "background": "#ffffff",
                }
            ],
        }
        config_path = root / "config.json"
        config_path.write_text(json.dumps(config), encoding="utf-8")
        return balance_icon.run(config_path, root / "output")

    def test_centered_equal_icons_produce_neutral_proposal(self) -> None:
        svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
<rect x="6" y="6" width="12" height="12" fill="currentColor"/>
</svg>"""
        report = self.run_with_icons(svg, svg)

        self.assertAlmostEqual(report["proposal"]["scale"], 1.0, delta=0.01)
        self.assertEqual(report["proposal"]["translateX"], 0)
        self.assertEqual(report["proposal"]["translateY"], 0)
        self.assertFalse(report["proposal"]["atSearchBoundary"])

    def test_off_center_candidate_is_translated_toward_slot_center(self) -> None:
        candidate_svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
<rect x="4" y="6" width="12" height="12" fill="currentColor"/>
</svg>"""
        reference_svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
<rect x="6" y="6" width="12" height="12" fill="currentColor"/>
</svg>"""
        report = self.run_with_icons(candidate_svg, reference_svg)

        self.assertGreater(report["proposal"]["translateX"], 0)
        self.assertEqual(report["proposal"]["translateY"], 0)

    def test_brand_hint_requires_brand_references(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            icon = root / "icon.svg"
            icon.write_text(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"/>',
                encoding="utf-8",
            )
            config = {
                "role": "test",
                "candidate": {"name": "candidate", "path": str(icon)},
                "references": [
                    {"name": f"reference-{index}", "path": str(icon)}
                    for index in range(5)
                ],
                "referenceFamily": "interface",
                "slots": [16],
                "densities": [1, 2],
                "states": [
                    {
                        "name": "normal",
                        "foreground": "#000",
                        "background": "#fff",
                    }
                ],
                "shapeHints": ["brand"],
            }
            config_path = root / "config.json"
            config_path.write_text(json.dumps(config), encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "brand referenceFamily"):
                balance_icon.load_config(config_path)


if __name__ == "__main__":
    unittest.main()

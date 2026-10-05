---
name: optically-balance-icon
description: Measures and proposes optical scale and position corrections for monochrome SVG icons against approved family references. Use when adding, replacing, reviewing, or ratcheting an icon in a compact, standard, prominent, rail, toolbar, or brand-mark role.
compatibility: Requires Python 3.11+, the Python dependencies installed by scripts/install_dependencies.py, and SVG inputs with a viewBox.
metadata:
  author: maximal
  version: "1.0.0"
---

# Optically balance an icon

Use this skill to generate a reviewable correction proposal. The report is
evidence for designer approval, not permission to update tokens automatically.

## Gather inputs

1. Identify the icon's product role and actual CSS-pixel slot sizes.
2. Select 5–10 approved SVG references from the same family and role.
3. Use only brand-mark references when the candidate is a brand mark.
4. List the rendered states, including foreground and background colors.
5. Include both 1× and 2× densities.
6. Add only shape hints that visibly apply to the candidate.

Copy `assets/example-config.json` and replace every example path and value.
Read [references/INPUTS.md](references/INPUTS.md) when choosing values.

## Install dependencies

From this skill directory, run:

```sh
python3 scripts/install_dependencies.py
```

The installer MUST obtain Python packages through the proxy configured in
`~/.npmrc`. It creates an ignored `.venv`, fails without the approved package
feed proxy, and never prints proxy credentials.

## Generate a proposal

From this skill directory, run:

```sh
.venv/bin/python scripts/balance_icon.py \
  --config /absolute/path/to/icon-balance.json \
  --output-dir /absolute/path/to/icon-balance-report
```

The command writes:

- `report.json` with the proposed scale, translation, diagnostics, provenance,
  and token metadata;
- `preview.html` with a rail-style visual comparison;
- `previews/` with the raster evidence used by the comparison.

Treat a nonzero exit as a failed analysis. Do not infer corrections from a
partial output directory.

## Review the proposal

1. Open `preview.html` at normal browser zoom.
2. Review each slot in a rail or grid rather than in isolation.
3. Check light, dark, normal, muted, and selected states in the product when
   those states exist.
4. Reject a result that clips, sits on a search boundary, conflicts with the
   symbol's semantic direction, or makes the family less coherent.
5. Give asymmetric and pointed symbols extra visual review.
6. Have a designer approve any brand-mark correction.

## Record an accepted correction

1. Copy `tokenMetadata` from `report.json` into the icon token's metadata.
2. Set `reviewed` to `true` and add the reviewer and review date.
3. Preserve the source and reference fingerprints.
4. Apply the transform at the icon wrapper, not by rewriting source path data.
5. Add or update the owning package's ratchet so a glyph or reference change
   requires another review.
6. Re-run the owning package's visual checks at every configured slot and
   density.

Do not update checked-in token metadata when the proposal remains unapproved.

## Common failures

- Replace references that do not share the candidate's role.
- Use SVGs with a `viewBox`; width and height alone are insufficient evidence.
- Convert multicolor or stateful artwork to an approved monochrome source
  before using this skill.
- If the proposed value reaches a configured limit, inspect the glyph,
  viewport, and reference set before widening that limit.
- If the report flags low contrast, add a real product state rather than
  substituting a more convenient color.

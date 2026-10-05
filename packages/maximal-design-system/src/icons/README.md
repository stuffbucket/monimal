# Icons

- `compact/icons.sheet.svg` MUST own the `icon.16.*` compact icon set.
- `prominent/icons.sheet.svg` MUST own the `icon.24.*` prominent sheet and MUST
  preserve its embedded `icon.16.*` product-mode and auto-layout IDs.
- `stroke-endpoints/icons.sheet.svg` MUST own the `icon.16.stroke.*` endpoint set.
- Dotted source IDs MUST preserve semantic hierarchy inside each size role.
- `catalog.ts` MUST record each set's canvas, namespaces, source, and icon count.
- Icon source sheets MUST remain valid SVG and MUST preserve their canonical IDs.
- Icon source sheets MUST use the `.sheet.svg` suffix so per-glyph canvas checks
  remain scoped to individual icon assets.

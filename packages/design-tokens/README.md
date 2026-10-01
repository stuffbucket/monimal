# Design token inventory

This package MUST inventory CSS custom properties across tracked `apps/**` and
`packages/**` JavaScript, TypeScript, HTML, and CSS sources.

`pnpm tokens:inventory` MUST write the Style Dictionary inventory to
`packages/design-tokens/dist/inventory.json`.

`pnpm check:tokens` MUST enforce the checked-in, down-only warning baseline.
New issues and stale baseline entries MUST fail the check. Existing issues MUST
remain warnings until their source is corrected. The baseline MAY be lowered
with:

```sh
pnpm --filter @maximal/design-tokens run token:check --update
```

The ratchet tracks:

- literal Lucide sizes outside the typed 12px, 16px, and 24px icon roles;
- icon SVG and PNG source canvases outside typed glyph, tray, and application
  asset dimensions;
- CSS icon properties whose values drift from their explicitly owned DTCG
  dimensions;
- provisional string types that MUST become explicitly owned DTCG types;
- names with multiple observed source values that MUST be modeled as deliberate
  contexts or aliases;
- references with no declaration in tracked workspace sources;
- known gaps between the pinned Style Dictionary release and DTCG 2025.10.

Style Dictionary MUST remain pinned to the full upstream commit SHA in
`package.json` and the matching `pnpm-workspace.yaml` build allowlist.

Production CSS MUST NOT be generated from this package until generated output
has exact value and name parity with the existing token owners.

`pnpm --filter @maximal/design-tokens build` MUST enforce the same ratchet as
`pnpm check:tokens`. The root Turbo build MUST therefore reject new icon and
token outliers without requiring a separate validation command. Both Turbo
tasks MUST hash tracked `apps/**` and `packages/**` sources because the inventory
is workspace-wide rather than package-local.

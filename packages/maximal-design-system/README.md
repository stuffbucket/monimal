# Maximal design system

This package MUST own reusable design-system algorithms and token data,
including the color ramps, OKLab utilities, icon metrics, and inventory rules.
Product theme presets and application-level theme selection MUST remain with
their consuming application.

Consumers MUST import shared color-system APIs from
`@maximal/maximal-design-system` or its `./color` export.

The package MUST own theme calculation and browser application through
`@maximal/maximal-design-system/theme`. Consumers MAY select, persist, and
identify themes, but MUST pass the selected `DesignSystemTheme` to
`createThemeManager().setTheme()` rather than calculating palette tokens,
resolving system appearance, or writing `data-theme` themselves.

The package MUST inventory CSS custom properties across tracked `apps/**` and
`packages/**` JavaScript, TypeScript, HTML, and CSS sources.

`pnpm tokens:inventory` MUST write the Style Dictionary inventory to
`packages/maximal-design-system/dist/inventory.json`.

`pnpm check:tokens` MUST enforce the checked-in, down-only warning baseline.
New issues and stale baseline entries MUST fail the check. Existing issues MUST
remain warnings until their source is corrected. The baseline MAY be lowered
with:

```sh
pnpm --filter @maximal/maximal-design-system run token:check --update
```

The ratchet tracks:

- literal Lucide sizes outside the typed 12px, 16px, and 24px icon roles;
- icon SVG and PNG source canvases outside typed glyph, tray, and application
  asset dimensions;
- CSS icon and spatial grid properties whose values drift from their explicitly
  owned DTCG dimensions, numbers, or opaque sRGB colors;
- provisional string types that MUST become explicitly owned DTCG types;
- names with multiple observed source values that MUST be modeled as deliberate
  contexts or aliases;
- references with no declaration in tracked workspace sources;
- known gaps between the pinned Style Dictionary release and DTCG 2025.10.

Style Dictionary MUST remain pinned to the full upstream commit SHA in
`package.json` and the matching `pnpm-workspace.yaml` build allowlist.

[tokens/icon-metrics.json](./tokens/icon-metrics.json) MUST own the spatial
grid dot geometry and reference palette.

[src/icons](./src/icons) MUST own the canonical compact, prominent, and stroke
endpoint icon sets. Each set MUST preserve its source ID namespace and MUST be
registered in the typed icon catalog.

[tokens/grid.json](./tokens/grid.json) MUST own the spacing, dense control and
row heights, and nested radius scales. Stories and consumers MUST use its
generated CSS custom properties rather than restating those dimensions.

[tokens/elevation.json](./tokens/elevation.json) MUST own the five elevation
levels and their light, dark, standard-resolution, and low-resolution shadow
stacks. Consumers MUST use the semantic `--elevation-100` through
`--elevation-500` properties so theme and resolution changes remain automatic.

[tokens/typography.json](./tokens/typography.json) MUST own heading and body
typography shorthands. Token path separators MUST generate hyphenated CSS
custom properties; slash-delimited token names MUST NOT be introduced. Generated
typography names MUST use one hierarchy prefix, such as `--heading-large` and
`--body-medium`. The generated CSS MUST embed Lil Grotesk for display typography.

Production CSS MUST NOT be generated from the Style Dictionary inventory until
generated output has exact value and name parity with the existing token
owners. Runtime CSS produced by the shared color-system API is separate from
that inventory.

`pnpm --filter @maximal/maximal-design-system build` MUST enforce the same ratchet as
`pnpm check:tokens`. The root Turbo build MUST therefore reject new icon and
token outliers without requiring a separate validation command. Both Turbo
tasks MUST hash tracked `apps/**` and `packages/**` sources because the inventory
is workspace-wide rather than package-local.

`style-dictionary.config.mjs` MUST generate typed source tokens as CSS custom
properties and nested JSON under `dist/tokens/`. `pnpm tokens:build` MUST be
the single generation command.

This package MUST own the workspace Storybook catalog, preview decorators,
browser checks, and developer commands. Shared story authoring, test APIs, and
the multi-catalog server launcher MUST come from `@maximal/maximal-storybook`.

## Icon optical balance skill

The
[optically-balance-icon skill](./.agents/skills/optically-balance-icon/SKILL.md)
MUST be used to produce reviewable optical scale and translation proposals for
SVG icons. Generated proposals MUST NOT update token metadata without designer
approval.

# Maximal Electron

Embeddable Electron host utilities, renderer components, terminal integration,
and artifact-verification contracts for the Maximal desktop application.

This private workspace package MUST NOT contain a standalone application.
`apps/desktop` owns product composition, preload APIs, packaging, signing, and
release.

## Exports

| Entry | Peers |
| --- | --- |
| `@maximal/maximal-electron/main` | `electron` |
| `@maximal/maximal-electron/host` | `electron` |
| `@maximal/maximal-electron/electron-terminal` | `electron`, `@maximal/maximal-terminal` |
| `@maximal/maximal-electron/electron-panel` | `electron` |
| `@maximal/maximal-electron/renderer` | `react`, `react-dom`, `@maximal/maximal-terminal`, `lucide-react`, `react-resizable-panels`, `@radix-ui/react-collapsible`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-radio-group`, `@radix-ui/react-slider`, `@radix-ui/react-tabs`, `@radix-ui/react-tooltip`, `@radix-ui/react-visually-hidden` |
| `@maximal/maximal-electron/verify` | none |
| `@maximal/maximal-electron/verify/shell-variables` | none |
| `@maximal/maximal-electron/verify/peers` | none |

Every runtime package reached by an export MUST remain an optional peer.

`npm run verify:exports` MUST compare this table with the built entry-point
graph and package contents.

## Renderer

The renderer export provides reusable shell layout, navigation, controls,
settings surfaces, terminal tabs, and renderer-safe helpers.
`TypefaceControls` composes compact family, style, weight, and metric fields;
`UnitValueInput` keeps presentation units in the UI while committing normalized
canonical values and restoring an automatic value when cleared.

Consumers MUST import
`@maximal/maximal-electron/renderer/styles.css` and define their own
`--maximal-color-*` palette and `--shell-*` tokens. Colour names follow
`--maximal-color-{type}-{element}-{role}-{prominence}-{interaction}`, where a
slot left at `default` is omitted and a name with nothing after its type and
element ends in `default`.

The following variables are required:

| Variable | Contract |
| --- | --- |
| `--maximal-color-bg-default` | Window chrome, side panels and fields. |
| `--maximal-color-bg-brand` | Solid brand fill: primary actions and busy markers. |
| `--maximal-color-bg-hover` | Hovered controls. |
| `--maximal-color-bg-pressed` | Pressed or nested hover controls. |
| `--maximal-color-bg-secondary` | Canvas: documents, terminals and the active tab. |
| `--maximal-color-bg-selected` | Selected-control background. |
| `--maximal-color-bg-tertiary` | Tooltip and other floating surfaces. |
| `--maximal-color-border-default` | Dividers and quiet outlines. |
| `--maximal-color-border-brand` | Selection and resize outlines. |
| `--maximal-color-icon-secondary` | Secondary icons and inactive glyphs. |
| `--maximal-color-icon-tertiary` | Tertiary icons. |
| `--maximal-color-text-default` | Primary foreground. |
| `--maximal-color-text-brand` | Brand text and markers. |
| `--maximal-color-text-onselected` | Text on a selected-control background. |
| `--maximal-color-text-secondary` | Secondary foreground and inactive controls. |
| `--maximal-color-text-tertiary` | Tertiary labels and counts. |
| `--shell-candy-background` | Optional candy-coated surface paint. |
| `--shell-candy-border` | Optional candy-coated surface outline. |
| `--shell-candy-icon-shadow` | Icon shadow on a candy-coated surface. |
| `--shell-candy-shadow` | Optional candy-coated surface elevation. |
| `--shell-candy-sheen` | Optional candy-coated surface highlight. |
| `--shell-candy-text` | Foreground drawn directly on candy-coated paint. |
| `--shell-duration-fast` | Short control and scrollbar transitions. |
| `--shell-ease-out` | Easing for short control and scrollbar transitions. |

The package stylesheet MUST remain structural and MUST NOT provide product
branding or a product palette.

See [embedding](./docs/embedding.md) and
[shell variables](./docs/shell-variables.md).

## Electron host

The host exports provide lifecycle sequencing, hardened BrowserWindow
construction, system notification support and macOS notification-settings
launching, secondary-panel mechanics, and terminal ownership adapters.

Consumers MUST provide their own preload, renderer loader, product IPC,
application state, and packaging configuration.

See [architecture](./docs/architecture.md) and
[consuming](./docs/consuming.md).

## Development

Run commands from the repository root with pnpm.

| Task | Command |
| --- | --- |
| Build | `pnpm --filter @maximal/maximal-electron build` |
| Typecheck | `pnpm --filter @maximal/maximal-electron typecheck` |
| Lint | `pnpm --filter @maximal/maximal-electron lint` |
| Unit tests | `pnpm --filter @maximal/maximal-electron test` |
| Export verification | `pnpm --filter @maximal/maximal-electron verify:exports` |
| Neutrality verification | `pnpm --filter @maximal/maximal-electron verify:neutral` |
| Documentation verification | `pnpm --filter @maximal/maximal-electron verify:docs` |
| Storybook | `pnpm storybook` |
| Storybook browser checks | `pnpm storybook:check` |

Application-level Electron behavior MUST be validated in `apps/desktop/e2e`.

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

Consumers MUST import
`@maximal/maximal-electron/renderer/styles.css` and define their own
`--shell-*` palette.

The following variables are required:

| Variable | Contract |
| --- | --- |
| `--shell-accent` | Selection, focus, and resize feedback. |
| `--shell-accent-muted` | Selected-control background. |
| `--shell-active` | Pressed or nested hover controls. |
| `--shell-background` | Window chrome and side-panel surface. |
| `--shell-border` | Dividers and quiet outlines. |
| `--shell-canvas` | Main document surface and active tab. |
| `--shell-duration-fast` | Short control and scrollbar transitions. |
| `--shell-ease-out` | Easing for short control and scrollbar transitions. |
| `--shell-hover` | Hovered controls. |
| `--shell-raised` | Tooltip and other floating surfaces. |
| `--shell-text` | Primary foreground. |
| `--shell-text-muted` | Secondary foreground and inactive controls. |
| `--shell-text-subtle` | Tertiary labels and counts. |

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

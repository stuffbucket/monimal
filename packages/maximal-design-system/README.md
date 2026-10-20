# Maximal design system

This package MUST own reusable design-system algorithms and token data,
including the color ramps, OKLab utilities, icon metrics, and inventory rules.
Product theme presets and application-level theme selection MUST remain with
their consuming application.

[docs/quality.md](./docs/quality.md) MUST own the package quality and release
standard. [docs/storybook.md](./docs/storybook.md) MUST own Storybook-specific
requirements.

Headless component behavior MAY use Base UI. Component appearance MUST come
from this package's generated tokens and CSS; components MUST NOT import shell
tokens or styles from `maximal-electron`. The Base UI shell, tab, terminal,
sidebar, generic edge-resizer, project navigation, and surface-canvas control
spike is available from the package root with its explicit
`@maximal/maximal-design-system/styles.css` stylesheet. Parent compositions
MUST own canvas zoom, page background, sidebar size, scroll, and compact-state
transitions so those values survive navigation and visibility changes.
`WorkspaceShell` is the product-agnostic composition: consumers supply tabs,
panels, navigation, sidebars, and overlays, and `fill` sizes it to its host.
`WorkspaceShellSpike` composes it with fixture content for Storybook and the
desktop `spike` renderer.
`Tab` wraps Base UI's tab trigger with Maximal styling, optional icon and close
behavior, and MUST be rendered within a Base UI `Tabs.Root` and `Tabs.List`.
`TabBar` composes that trigger into the workspace tab-and-panel pattern.
`Dialog` wraps Base UI's controlled modal behavior with Maximal surface,
backdrop, radius, elevation, spacing, and stacking tokens. Consumers MAY supply a
portal container and MUST own the open state and action controls.
`AlertDialog` shares that surface through Base UI's alert-dialog root. It MUST
remain modal with a visible title and description and MUST ignore outside
presses. A confirmation places Cancel first, any `tertiaryActions` next, and
its primary `action` last, starts focus on Cancel, and closes itself only on
cancel. The primary action MUST use the `primary` or `danger` `Button` variant;
tertiary actions MUST use an existing lower-emphasis variant such as
`secondary-danger` or `ghost`. Each action MUST close the dialog when its
response completes. An acknowledgement omits `action`, offers only OK, and
starts focus there. Escape takes the dismiss response unless `pending`
is set.
The package root also exports Base UI-backed `Select`, `Checkbox`,
`RadioGroup`/`Radio`, `Switch`, `Slider` (`Slide` is an alias), `NumberInput`,
`ScrollArea`, `Avatar`, `Toast`, `Collapsible`, `Accordion`, `Menu`,
`ContextMenu`, `Menubar`, `Tabs`, `Toolbar`, `ToggleGroup`, `Fieldset`,
`Separator`, `Tooltip`, `Popover`, `Autocomplete`, and textarea `Field`
components. `UnitValueInput` composes the numeric and select controls while
consumers own canonical conversion. `Card` and `Callout` are selectable
`role="option"` surfaces and MUST be rendered within a consumer-owned listbox.
`Scrollbar` MUST own scrollbar presentation on both axes: a transparent track
inset half a spacer from the scroller's edge, a translucent
`bg-scrollbar` thumb whose length is clamped between the compact control
height and the heading row height, and a hovered or dragged thumb that grows
to the full track and takes `bg-scrollbar-hover`. An `auto` scrollbar eases
out when its scroller is hovered, scrolled, or dragged and eases in after the
`duration-dwell`; reduced motion removes the transitions. Scroll containers
MUST hide native scrollbars and render `Scrollbar` in a positioned element
that shares the scroller's box; `ScrollArea` and menus do this, and
`scrollbars="hidden"` omits it.
`StatusChip` MUST own neutral status presentation. `InspectorPanel` MUST own
inspector chrome. `PropertyList`/`Property` MUST own read-only description-list
presentation.
`Icon` presents canonical Maximal glyphs at the existing compact, standard, or
prominent icon size roles; Base UI does not provide an icon primitive.
These components MUST use the existing Maximal token roles; their component
styles MUST NOT introduce new design tokens.
Every styled wrapper under `src/components` MUST have its own matching
`stories/components` Storybook entry. Its stories MUST expose each meaningful
state supported by the wrapper API rather than combining unrelated wrappers
into a showcase. Story files MUST remain outside `src`.
Every runtime `index.ts` MUST be a barrel and MUST NOT contain component
implementations. `src/components/index.ts` MUST remain the package's single
component barrel, and the package root MUST re-export the component,
composition, primitive, and utility barrels.
Consumers MAY import the same component API from the package root or the
`@maximal/maximal-design-system/components` subpath.
`api-surface.json` MUST record the reviewed public TypeScript API. Package
builds MUST fail when an export or public signature changes until the baseline
is deliberately updated with `pnpm api:check --update`.
Component APIs MUST use native React element attributes for their primary
element and typed element-slot props for composite internals. They MUST NOT
invent camel-cased aliases for `aria-*` or `data-*` attributes.
Application renderers MUST load `@maximal/maximal-design-system/tokens.css`,
`styles.css`, and `app.css`; `app.css` owns the document reset and application
frame, and MUST NOT be imported by stories.
`styles/patterns.css` owns interaction and surface declarations shared across
component stylesheets; a component stylesheet MUST NOT repeat them.
Storybook MAY import `maximal-electron` components and styles only to render
that package's catalog stories; every new use MUST be identified as
catalog-only and MUST NOT become a runtime dependency of design-system
components.
`maximal-electron` catalog stories MUST be titled `Deprecated/<Component>` so
the remaining legacy surface is visible; a story leaves `Deprecated` only by
being retired with its component.
The workspace shell spike MUST expose distinct expanded and compact canvas
states. Expanded state includes navigation and both sidebars; compact state
removes those layout columns and presents floating project, collaboration,
zoom, presentation, toolbar, notification, and help controls over the canvas.
Floating project, surface, and FigJam toolbox controls MUST compose the shared
`CompactControlCluster` chrome while retaining variant-owned actions and state.
Specialized buttons inside those controls MUST compose `ControlButton`,
`ToggleButton`, `Button`, or `IconButton` rather than restyling raw button
elements.
The navigation header MUST use the Fraunces `m` outline derived from the
workspace-owned splash font at its canonical splash variation settings.
The workspace shell MUST remain at least 900px wide. Its expanded left sidebar
MUST default to 346px and remain at least 300px wide. Its expanded right sidebar
MUST default to 246px and remain at least 240px wide.
The workspace shell MUST remain at least 600px tall. Primary and secondary
canvas toolbars MUST share the same floating elevation and remain shell-level
overlays that can cross navigation and sidebar regions. The zoom split control
MUST use the token-owned 32px standard row height. The notification prompt
MUST use the next elevation and local stacking level above the canvas toolbars,
and both of its actions MUST dismiss the prompt.
The workspace Storybook MUST include a notification-free shell state. Its
isolated stories MUST render inside a token-bounded, two-axis resizable frame
so window behavior can be inspected down to the 900px by 600px minimum.
The workspace Storybook MUST include a state without the secondary color
toolbar while retaining the primary FigJam toolbar.
Sidebar content regions MUST use the shared `SidebarSection` container.
Resizable section breaks MUST use `SidebarSectionSplit`, remain independent of
the outer `EdgeResizer`, and clamp to useful section and content heights.
Horizontally overflowing section content MUST use the section scroll area so
its proportional translucent thumb fades with the shared motion token.

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

`pnpm quality:source` MUST reject invented DOM-like prop aliases, literal
colors, literal spatial dimensions other than the one-pixel visually-hidden
technique, literal stacking levels, literal motion durations, and `!important`
declarations in runtime design-system source.

`pnpm storybook:check` MUST be a required CI gate. It MUST run every
design-system-owned story in both light and dark themes, fail render and play
errors, require generated token styles, fail browser console and page errors, require
Axe to run, and enforce zero Axe violations and zero unresolved incomplete
results. Passing the automated gate MUST NOT be described as complete WCAG
conformance.

Style Dictionary MUST remain pinned to the full upstream commit SHA in
`package.json` and the matching `pnpm-workspace.yaml` build allowlist.

[tokens/icon-metrics.json](./tokens/icon-metrics.json) MUST own the spatial
grid dot geometry and reference palette.

[src/icons](./src/icons) MUST own the canonical compact, prominent, and stroke
endpoint icon sets. Each set MUST preserve its source ID namespace and MUST be
registered in the typed icon catalog.

[tokens/grid.json](./tokens/grid.json) MUST own the spacing, dense control and
row heights, preferred and minimum shell dimensions, bounded overlay sizes,
and nested radius scales. Stories and consumers MUST use its generated CSS
custom properties rather than restating those dimensions.

Hosts MUST set `data-platform="macos"` on the document root when rendering on
macOS. Window and dialog surfaces under that selector MUST use
`--radius-platform-macos-outer` (16px) for outside corners and
`--radius-platform-macos-inner` (12px) for nested inside corners. Generic
control radii MUST remain platform-neutral. Without a platform contract,
surfaces MUST use the generated semantic window and dialog radius roles.

[tokens/motion.json](./tokens/motion.json) MUST own transition durations,
easing curves, and semantic interface opacity states.

[tokens/z-index.json](./tokens/z-index.json) MUST own semantic stacking roles
within an isolated interface surface. Component CSS MUST NOT use raw z-index
integers.

[src/color/palette.ts](./src/color/palette.ts) MUST own named quiet-selection
states and literal toolbar swatches. Component CSS MUST NOT derive those colors
with local color mixing.

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
quality configuration, reviewed baselines, and developer commands. Reusable
source, API, React-state, and browser-quality engines MUST come from
`@maximal/maximal-design-system-tools`. Shared story authoring, test APIs, and
the multi-catalog server launcher MUST come from `@maximal/maximal-storybook`.

## Icon optical balance skill

The
[optically-balance-icon skill](./.agents/skills/optically-balance-icon/SKILL.md)
MUST be used to produce reviewable optical scale and translation proposals for
SVG icons. Generated proposals MUST NOT update token metadata without designer
approval.

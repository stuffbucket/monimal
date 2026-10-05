# Design Context

Front door for design decisions on maximal's UI surfaces. Consulted by the
design-* skills and by any agent or human building UI here.

**Intentionally short.** It locks the non-negotiables, flags what keeps
regressing, and points at the detail.

## Which UI you are working on

There are two, and they do not share a design system. Settle this before
writing anything.

| Surface | Location | Design system |
| --- | --- | --- |
| **Electron desktop client** — the go-forward app | `packages/maximal-client`, `apps/desktop` | The `--shell-*` CSS custom-property contract published by the `@maximal/maximal-electron` package |
| Proxy-served HTML pages | served from the proxy | Plain CSS, no shared token pipeline |

The retired Tauri shell in `shell/` is no longer documented. Its design docs
were removed deliberately (see git history) because two conflicting design
systems in one tree was actively misleading readers. **If you find guidance
naming `shell/src/ui/styles/theme.ts`, a three-site token pipeline, or
menu-bar/tray affordances, it is stale — do not follow it.**

## The Electron client's design system

Compose primitives from `@maximal/maximal-electron/renderer` rather than
hand-rolling equivalents: `ShellLayout`, `NavRail`, `Canvas`, `TabBar`,
`TerminalView`, `TitleBar`, `IconButton`, and the tab-adornment vocabulary.

Styling goes through that package's `--shell-*` custom properties, imported via
`@maximal/maximal-electron/renderer/styles.css`. **The package ships no palette by
design** — this client supplies one. Surfaces MUST NOT hardcode colours.

### Colour palette

- `@maximal/maximal-design-system/color` MUST own every generated
  theme-dependent colour value.
  It writes one `<style id="maximal-palette">` with a `:root` (dark) block and
  a `[data-theme='light']` block; `applyAppearance` replaces it on a theme
  change.
- The client MUST select and persist themes, then pass the selected theme to
  `@maximal/maximal-design-system/theme`. It MUST NOT calculate palette tokens,
  resolve system appearance, or write `data-theme` directly.
- Atomic colours are `--maximal-color-{ramp}-{step}`, steps 100 to 1000 from
  lightest to darkest in both modes. Ramps: `grey`, `blue`, `purple`, `pink`,
  `red`, `orange`, `yellow`, `green`, `violet`, `teal`, `persimmon`,
  `crimson` (the Maximal brand colour), `pale-{hue}`, `white`, `black` and `cream` (alpha), `neutral` (theme background to
  theme text) and `brand` (anchored on the theme accent at 500).
- Hue ramps MUST be calculated in OKLCH from the profiles in
  `packages/maximal-design-system/src/color/ramps.ts`, which reproduce the
  reference ramps in `packages/maximal-design-system/src/color/reference.ts`
  within ΔE_OK 0.005. Step 500 is the anchor.
- `crimson` 500 in light mode MUST be the published brand colour `#B8404D`
  at the same OKLCH lightness and hue, with chroma raised to 90% of the sRGB
  maximum (`#C82543`, `oklch(0.543 0.196 17.6)`).
- `cream` 1000 MUST be the published brand cream `#F2EAD6` at the same OKLCH
  lightness and hue, with chroma multiplied by the factor `crimson` applies
  to `#B8404D` (`#F4EAD0`, `oklch(0.938 0.035 88.8)`); lower steps MUST fade
  it with the `white` alphas.
- Every `brand` step MUST stay at least ΔE_OK 0.02 from the reference panel
  for its mode (white in light mode, dark `grey-800` in dark mode), whatever
  the theme accent.
- Semantic colours MUST be `var()` aliases of atomic steps, or of seed
  values; the browser resolves them, and no script runs per element.
- Palette values MUST be hex or `rgb()`, because `Terminal.tsx` and the e2e
  visual invariants parse computed values.
- Colour roles MUST be `brand`, `selected`, `disabled`, `component`,
  `assistive`, `danger`, `measure`, `warning`, `success`, `info` and
  `inverse`, and every role MUST define `bg-`, `text-`, `icon-` and `border-`.
  The Storybook sheet is `Foundations/Color ramps/Roles`.
- `brand`, `component`, `assistive`, `danger`, `measure`, `warning` and
  `success` MUST fill `bg-{role}` with step 500 of their ramp in both modes.
- `selected` MUST fill `bg-{role}` with `brand` 200 and `info` with `blue`
  200, in both modes (300 hover, 400 pressed). Content on those fills MUST
  use `text-on{role}`, the first dark step of the same ramp that reads at
  4.5:1 on all three.
- `bg-{element}-default` MUST be the element's surface (`bg-default` for
  `toolbar`, `bg-tertiary` for `menu` and `tooltip`), `bg-{element}-hover`
  one neutral step further from the background, and `bg-{element}-selected`
  `bg-brand`, with `text-onbrand` and `icon-onbrand` on it.
- `bg-disabled` MUST be neutral in light mode and `white` 500 in dark mode.
- `text-on{role}-secondary` and `text-on{role}-tertiary` MUST be the role's
  on colour at alpha step 600 and 400.
- `text-onlightcanvas` and `text-ondarkcanvas`, with their `-secondary`
  variants, MUST be the same in every theme and mode; text over user content
  MUST use them, chosen by whether the content is lighter than 50% lightness.
- Text colour applications MUST be shown in Storybook under
  `Foundations/Text colors`.
- `icon-default`, `icon-secondary` and `icon-tertiary` MUST alias the text
  colour of the same prominence; `icon-onlightcanvas` and `icon-ondarkcanvas`
  MUST equal their text counterparts.
- Background colour applications MUST be shown in Storybook under
  `Foundations/Background colors`.
- Border colour applications MUST be shown in Storybook under
  `Foundations/Border colors`.
- `border-selected` MUST use the theme's brand ramp and reach 3:1 on the
  theme's normal surfaces.
- `border-selected-strong` MUST alias `text-onselected` to remain readable
  on the selected fill and its hover and pressed states in both modes.
- `border-{toolbar|menu}-default` MUST be a subtle neutral divider on the
  element's surface.
- `border-{toolbar|menu}-strong` MUST reach 3:1 on the element's surface.
- Icon colour applications MUST be shown in Storybook under
  `Foundations/Icon colors`.
- Lucide glyphs SHOULD take their size and stroke from `lucideStroke`
  (`@maximal/maximal-design-system/color/tools`): a 1px stroke, and 2px at
  48px and larger.
- `inverse` MUST use the opposite end of `neutral`.
- `bg-on{role}`, `text-on{role}` and `icon-on{role}` MUST be white or black,
  whichever contrasts more with `bg-{role}`, except that `brand` MUST use
  `cream` where `cream` 1000 reaches 4.5:1 on `bg-brand`, and
  `icon-onbrand` MUST be the theme's `accentIcon` when it sets one. The
  Maximal theme MUST set `accentIcon` to `cream` 1000 (`#F4EAD0`) in both
  modes.
- Role and data-visualization colours MUST be chosen by contrast against the
  theme's surfaces: 4.5:1 for `text-{role}`, 3:1 for `icon-{role}`,
  `border-{role}` and chart series. The design-system palette tests check the
  algorithm, and `src/renderer/theme.test.ts` checks every built-in theme in
  both modes.
- The Maximal theme accent MUST be crimson: `#C82543` in light mode and
  `#F65467` (`oklch(0.670 0.197 17.5)`) in dark mode, which keeps 4.5:1
  against the dark background.
- `src/renderer/theme.ts` MUST hold only aliases that are the same in every
  theme and mode.

Worked composition to follow: `../maximal-client/src/renderer/workspace/`, `dashboard/`,
`settings/`, `first-run/`.

## Who maximal is for

A local proxy between developer tooling (Claude Code, Anthropic SDK, OpenAI
SDK, opencode, custom scripts) and the GitHub Copilot API. Two access modes
converge on the same files and behaviour:

- **CLI users** — comfortable in the terminal, prefer keyboard, expect
  machine-readable output. `maximal auth`, `maximal start`, `maximal debug
  --json` are their primary surface.
- **Desktop app users** — same audience, different moment. The GUI is for when
  typing is the wrong tool: first-run auth, an occasional usage check, a
  settings tweak.

Neither audience needs the other's affordances; both should feel like the tool
was built for them.

**Write user-facing copy format-neutral.** Say "desktop app" — never "menu
bar", "tray", "Tauri", or "Electron". The delivery format has changed once
already; the copy should survive the next change.

## Brand in one paragraph

**Warm + crafted + considered.** Made by a person, not a corporation. Friendly
without being playful-cute; confident without being terminal-stark. Restraint
over decoration: layout, type and spacing carry the feeling. Colour is one
surface, not the only surface.

## The five principles (binding)

These override other guidance when they conflict.

1. **Speak to the person, not the file.**
2. **Power lives in depth, not density.**
3. **Colour is the user's, contrast is ours** — warn at sub-AA, never block.
4. **One humanist accent per view.**
5. **Reduced motion is a contract, not a hint** — literal, not "with reduced
   intensity".

## Non-negotiables

- **One primary heading per view.** No competing `h1`s.
- **Status is never colour alone.** The badge carries text; colour reinforces.
- **Keyboard reach with visible focus.** A `div` with an `onClick` is a defect
  — use a real interactive element, and `:focus-visible`, not `:focus`.
- **Live regions: polite for progress, assertive only for blocking errors.**
- **Honour `prefers-reduced-motion`** on any transition you add.
- **Never present placeholder data as real.** Where a source reports itself as
  placeholder, the surface must say so unmissably and non-dismissibly.
  Fabricated numbers read as live is the worst failure these UIs can have.
- **Card nesting is forbidden.** Collapse the inner to a row, or make the outer
  a typographic section.
- **`Cmd-K` is reserved.** Do not bind it in v1.

## What keeps regressing

- **ARIA roles conflicting across a component boundary.** A parent's container
  role constrains what its children may be. This has bitten twice — check the
  parent's role before choosing a child's.
- **Duplicate type declarations for one global.** Declare once, import it.
- **Reaching past the seam.** Renderer components must not import
  `ControlClient` or touch `window.maximal` directly. Go through the
  capabilities interface for the surface you are in.
- **A page reading as a grid of similar rectangles** — cards used as sectioning
  chrome rather than as objects.

## Topic detail

- [`design/failure-modes.md`](design/failure-modes.md) — read before
  any non-trivial UI change.

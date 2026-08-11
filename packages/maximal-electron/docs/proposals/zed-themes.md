# Zed themes as a theme source

Status: proposal. Nothing here is built. See "Phasing" for what would ship
first.

## Problem

This shell defines one design contract: `REQUIRED_TOKENS` in
`src/renderer/lib/contrast.ts`, checked by `checkPalette` and by
`tests/contrast.test.ts`. `tokens.css` is a reference palette; a consumer
supplies their own. Today "supplies their own" means hand-writing hex values
against that list.

Zed ships thousands of themes as JSON, in a schema built for the same kind of
problem: a fixed set of named roles (background, border, muted text, an
accent, a few status colours) that a theme author fills in. The proposal is to
let a designer point this shell at a Zed theme file and get a legal palette
out, edited live in a dialog built from this shell's own controls.

The audience is stated explicitly in the brief: talented visual designers who
will push this. That means the mapping has to be honest about where it
invents a colour Zed never specified, the editor has to make a failing pair
impossible to miss, and the whole thing has to feel considered rather than
mechanical — a good default is not a checkbox, it is most of the deliverable.

## Zed's theme schema (verified)

Fetched directly: the published schema at
`https://zed.dev/schema/themes/v0.2.0.json`, the bundled `One` theme at
`github.com/zed-industries/zed/blob/main/assets/themes/one/one.json`, and a
live download from zed-themes.com (below). All three agree.

A theme file is one JSON object, not an array at the root:

```json
{
  "$schema": "https://zed.dev/schema/themes/v0.2.0.json",
  "name": "Tokyo Night",
  "author": "…",
  "themes": [
    { "name": "Tokyo Night Storm", "appearance": "dark", "style": { "…": "…" } },
    { "name": "Tokyo Night Light", "appearance": "light", "style": { "…": "…" } }
  ]
}
```

`name` and `author` describe the family; `themes` holds one or more concrete
variants, each with its own `appearance` (`"light"` or `"dark"`) and `style`
object. Every key in `style` is optional and nullable — a theme author can
omit anything, and it is legal for a real, shipped theme to leave a key unset.

The keys this shell can use (there are many more, for the code editor and
terminal, that this shell has no surface for):

- Base: `background`, `border`, `border.variant`, `border.focused`,
  `border.selected`, `border.disabled`
- Surfaces: `elevated_surface.background`, `surface.background`
- Elements: `element.background`, `element.hover`, `element.active`,
  `element.selected`, `element.disabled`
- Text: `text`, `text.muted`, `text.placeholder`, `text.disabled`,
  `text.accent`
- Chrome: `title_bar.background`, `title_bar.inactive_background`,
  `tab_bar.background`, `tab.active_background`, `tab.inactive_background`,
  `status_bar.background`, `panel.background`, `toolbar.background`
- Editor: `editor.background`, `editor.foreground` (this shell has no code
  editor pane; kept only as a fallback source for `--bg-canvas`, see below)
- Status, each with a base colour plus `.background` and `.border` variants:
  `error`, `warning`, `success`, `info`, and others this shell does not use
  (`hint`, `modified`, `conflict`, `created`, `deleted`, `renamed`, `ignored`,
  `unreachable`, `predictive`)

Not used by this proposal at all: `syntax` (a map of ~45 token-highlighting
roles), `players` (up to 8 collaborator cursor colours), and the `terminal.*`
ANSI palette. Zed's schema is built for a code editor with multiplayer
cursors; this shell is a document shell with one embedded terminal
(`ghostty-web`), and neither has a surface for syntax highlighting or
collaborator colours today. Feeding `terminal.ansi.*` into `ghostty-web`'s own
colour scheme is a plausible later idea — untested, because it is a separate
rendering pipeline (a canvas, not CSS custom properties) and whether
`ghostty-web` exposes a runtime palette API was not checked for this proposal.

**A real-world wrinkle, confirmed by fetching a live download** (see below):
Zed colours are written as `#rrggbb` or `#rrggbbaa` — eight hex digits,
alpha last — never the `#rgb` short form. `parseHex` in `lib/contrast.ts`
today accepts only `#rgb` and `#rrggbb`; it will reject an eight-digit value
outright, which is correct behaviour for that function but means the Zed
importer must strip the alpha byte itself before a colour reaches
`checkPalette` or a `REQUIRED_TOKENS` slot (alpha is meaningless there — see
"Only opaque colours" in that module's own docstring). The same fetch also
turned up a malformed entry in a real, currently-listed theme
(`text.accent` with no leading `#`, while the sibling `icon.accent` in the
same file had one) — a live import has to tolerate that rather than throw.

## zed-themes.com (verified, and its limits)

Fetched directly. It is a gallery: theme cards with a name, an author, a
light/dark toggle, and a preview generated from an SVG endpoint
(`/themes/preview.svg?id=…&name=…`). Individual themes live at
`/themes/{id}`; a download link on each card fetches
`/download/themes/{id}` and its tooltip literally says "Download theme to
`~/.config/zed/themes`" — useful independent confirmation that Zed itself
uses `~/.config/zed` on Linux, i.e. it already follows XDG there (see below).
There is a `/themes/new` route implying an in-browser theme editor, and a
sign-in link.

Fetching `/download/themes/tokyo-night` directly returned a real,
schema-conformant theme file — confirmed by content, not guessed. So the
download route is real and usable as a one-off "paste this URL" import path.

What the site does **not** have: a documented public API. Guessing
`/api/themes` returned a plain HTTP 404. There is no discoverable JSON index,
search endpoint, or listing API — nothing to poll or page through
programmatically. Concretely, this rules out building an in-app browsable
catalogue of "all zed-themes.com themes" against a registry; the only
integration point verified to work is: a designer copies a theme's download
URL (or the raw JSON) from the site and pastes or drops it into this shell.
Whether the site would tolerate or object to a browser-side fetch of that
same URL from inside an Electron renderer (CORS, rate limiting) was not
tested — that would need to be tried before phase 2 (below) is built, not
assumed from this research.

## Where the file lives (verified)

Electron's `app.getPath('userData')` resolves from `appData`, which the
official docs give per platform as:

- Linux: `$XDG_CONFIG_HOME` or `~/.config`, then `/<app name>`
- macOS: `~/Library/Application Support/<app name>`
- Windows: `%APPDATA%\<app name>`

This is already the reconciliation the brief asks for: on Linux,
`userData` *is* XDG-compliant out of the box, honouring `XDG_CONFIG_HOME` if
it is set. On macOS and Windows, XDG does not apply — those platforms have
their own per-user data conventions, and `userData` already follows them.
Reimplementing XDG path logic by hand in this shell would mean fighting
Electron on macOS and Windows for no gain, and duplicating what it already
does correctly on Linux. `preferences.ts` already writes
`path.join(app.getPath('userData'), 'preferences.json')`; theme storage should
sit next to it, not invent a second convention.

(Direct confirmation: fetching the XDG Base Directory Specification itself
timed out with an empty response after a redirect, so the defaults above are
stated from the Electron documentation's own platform table plus the
well-established, unchanged-for-over-a-decade XDG defaults
(`XDG_CONFIG_HOME` = `~/.config`), not from a successful fetch of the spec
text in this session.)

## Mapping table

One row per colour token in `REQUIRED_TOKENS` (28 of the 65 required tokens
are colours; the rest are sizes, durations, and font metrics with no Zed
analogue and no need for one).

| Shell token | Source | Kind | Note |
| --- | --- | --- | --- |
| `--accent` | `text.accent` | direct | |
| `--text-primary` | `text` | direct | |
| `--text-secondary` | `text.muted` | direct | |
| `--text-muted` | `text.placeholder` | direct | Zed's softest text tier reads as this shell's hint/label tier |
| `--text-invalid` | `error` | direct | same source as `--danger`, matching that they are equal in today's reference palette |
| `--danger` | `error` | direct | |
| `--success` | `success` | direct | |
| `--warning` | `warning` | direct | |
| `--danger-soft` | `error.background`, else derived | direct with fallback | Zed's `.background` variants are already soft tints; used as-is if present and opaque |
| `--success-soft` | `success.background`, else derived | direct with fallback | |
| `--warning-soft` | `warning.background`, else derived | direct with fallback | |
| `--border-invalid` | `error.border`, else `error` | direct with fallback | |
| `--border-subtle` | `border` | direct | |
| `--border-strong` | `border.variant` | direct | |
| `--border-input` | `border.variant` | direct | today's reference palette sets `--border-input` equal to `--border-strong`; sourcing both from the same key preserves that |
| `--bg-active` | `element.active` | direct | |
| `--bg-hover` | `element.hover` | direct | |
| `--bg-panel` | `elevated_surface.background` | direct | this shell's dialog and menu chrome; Zed's own use (context menus, palettes) is the same role |
| `--bg-canvas` | `editor.background` | approximate | the closest Zed surface to "main content", though this shell has no code editor |
| `--bg-raised` | `surface.background` | approximate | Zed's docked-panel surface; used here for cards, tooltip, and the segmented control |
| `--bg-input` | `element.background` | approximate | Zed has no form-field concept; this is the nearest generic interactive surface |
| `--bg-app` | first of `title_bar.background`, `tab_bar.background`, `panel.background`, `status_bar.background` | approximate, with fallback chain | `--bg-app` is one token doing the job Zed splits four ways; in practice these four are equal or near-equal in most real themes (they are all "chrome, not content"), so take whichever is defined first |
| `--focus-ring-color` | *(alias)* | derived | always equals the resolved `--accent`; `tokens.css` already defines it this way, so there is nothing to source separately |
| `--accent-soft` | *(alias)* | derived | resolved `--accent` re-emitted as `rgb(r g b / 0.16)` (dark) or `/ 0.10` (light), matching the ratios already in `tokens.css` |
| `--border-input-hover` | *(derived)* | derived | resolved `--border-input`, mixed 25% toward resolved `--text-primary` in RGB space: `result = border + 0.25 × (text − border)` per channel. Moves lighter in a dark theme and darker in a light theme automatically, because `text` always sits at the far end of the range from `border` |
| `--accent-contrast` | *(derived)* | derived | `#ffffff` or `#000000`, whichever clears a higher ratio against resolved `--accent`, using `contrastRatio`/`luminance` already in `lib/contrast.ts` |
| `--danger-fill` | *(derived from `error`)* | derived | resolved `error`, darkened toward black in fixed 8% steps (`channel *= 0.92`, per channel, clamped) until white text clears 4.5:1 against it, or after 12 steps. Contrast against white increases monotonically as a colour darkens, so this always converges — see "Contrast safety" for why it is derived rather than sourced from `error.background` |
| `--text-on-solid` | *(derived)* | derived | `#ffffff` or `#000000`, whichever wins against the *derived* `--danger-fill` (see above) — resolved after `--danger-fill`, not before |

Coverage: **18 of 28** colour tokens map cleanly to one unambiguous Zed key
(`--accent`, `--text-primary/secondary/muted/invalid`, `--danger`,
`--success`, `--warning`, the three `-soft` tokens, `--border-invalid`,
`--border-subtle/strong/input`, `--bg-active/hover/panel`). **4 more**
(`--bg-canvas`, `--bg-raised`, `--bg-input`, `--bg-app`) take a real Zed
value but through a semantic stretch — Zed's schema draws more surface
distinctions than this shell's stylesheet does, or fewer, depending on which
way you look at it. **6** have no Zed source at all and are computed:
`--focus-ring-color`, `--accent-soft`, `--border-input-hover`,
`--accent-contrast`, `--danger-fill`, `--text-on-solid`. None of the six are
guesses; each has a stated, reproducible algorithm, and three of them
(`--focus-ring-color`, `--accent-soft`, `--danger-fill`) exist in the
reference palette today for exactly the reason `tokens.css`'s own comments
give — one colour cannot serve two roles that pull in opposite directions
(the `--danger` / `--danger-fill` split is `tokens.css`'s own words, quoted
in that file).

Not covered by anything above: `--elevation-card/popover/dialog` are shadow
definitions (`rgb(0 0 0 / α)` with blur and offset), not simple colours, and
Zed's schema has no shadow model to source them from. They stay keyed to
`appearance` alone, exactly as `tokens.css` already does — the light
palette's `--elevation-dialog` is deliberately softer than the dark one's, a
distinction the file's own comment says was "obvious" only once seen
side-by-side in Storybook. A Zed theme's `appearance` field selects which of
the two existing values applies; nothing about the imported theme changes
them further in phase 1.

## Contrast safety

A Zed theme mapped by the table above will sometimes fail `CONTRAST_PAIRS`.
The sharpest case: `--accent` is required to pass as *foreground* text on
`--bg-app` (`accent` pair) and to host `--accent-contrast` as *background*
under a button label (`accent-contrast` pair) — two different roles, one
colour, no `--accent-fill` token to split them the way danger does. A pastel
accent picked by a Zed theme author for cursor visibility can easily fail
both: too light to read as text, and unable to hold either white or black at
4.5:1 as a fill. No algorithm resolves that silently and correctly; it is a
real design decision.

`checkPalette` already returns `{ checked, skipped, missing }`, not a single
pass/fail. The proposal is to treat those three differently, at three
different moments:

1. **While editing, in the dialog.** Never refuse, never silently rewrite the
   designer's colours. Run `checkPalette` on every change, and render a red
   `StatusChip` next to each failing pair from `report.checked`, using the
   pair's own `where` string ("primary button label", "nav heading") so the
   failure names something findable rather than a bare ratio number.
   Alongside each failing chip, a "Nudge into range" button performs the one
   correction that pair's own foreground token supports — lift or drop its
   lightness in fixed steps toward (or away from) its paired background,
   re-checking after each step, stopping at the first pass. This is a
   deliberate action the designer takes, not something that happens to their
   file. A theme can be saved and applied while a pair still fails: not every
   token pairing here is body text, and it is not this shell's place to
   block someone who has judged a decorative failure acceptable. Skipped
   pairs (`report.skipped`, from a token this shell's importer failed to
   resolve to an opaque colour) render the same way, worded as "could not be
   checked" rather than as a false pass.

2. **On save, for `missing` tokens specifically.** `missingTokens` is a
   different problem from a failing contrast ratio — the module's own
   docstring is explicit that an absent token "renders as a transparent
   background or an inherited colour rather than an error," which
   `checkPalette` cannot see. So: any token in `report.missing` when a theme
   is saved is filled from the shipped default palette (`tokens.css`'s own
   values for the matching appearance) before the file is written. A theme
   is never allowed to leave a token undefined; a designer only ever sees a
   *populated but perhaps ugly* value for a role Zed did not specify, never a
   silently broken one.

3. **On load, at startup.** If the active theme file is missing, corrupt, or
   fails to parse as JSON, fall back to the built-in default palette
   entirely — exactly the precedent `preferences.ts`'s `coerce` already sets
   for a corrupt `preferences.json` (catch, log, use `DEFAULT_PREFERENCES`).
   The application must never fail to boot over a bad theme file.

This lands on **apply with a warning, correction is one click but never
automatic**, because the audience is designers who will deliberately push
past what a checker considers safe, and a tool that overwrites their choice
without being asked would not be trusted twice.

## Applying a theme at runtime

`tokens.css` already selects between its two built-in palettes with
`:root` (dark, the default) and `:root[data-theme='light']`, flipped by
`useThemePreference` setting or clearing `data-theme` on
`document.documentElement`. A custom theme is a third thing, layered on top
rather than replacing that mechanism:

1. `data-theme` still gets set to `'light'` or `'dark'` from the *custom
   theme's own* `appearance` field, so any token the importer did not
   override (today, none — every colour token is populated per "Contrast
   safety" above; tomorrow, perhaps spacing or radii if a theme ever carries
   opinions about those) falls back to the matching built-in scheme rather
   than mixing a light default with dark overrides.
2. Every resolved colour token is then written with
   `document.documentElement.style.setProperty('--token', value)` — an
   inline style on the root element, which beats any rule in `tokens.css`
   on specificity without needing `!important` or a second stylesheet.
   Clearing a custom theme calls `removeProperty` for each token, which
   drops back to whatever `:root` or `:root[data-theme='light']` already
   supplies. This is a few dozen imperative calls in a `useEffect`, the same
   shape `useThemePreference` already uses for the single `data-theme`
   attribute — a natural sibling hook, not a new pattern.
3. **On reload.** Nothing here is written into `tokens.css` or any built
   asset; it is applied from JavaScript after the document loads. That
   means each fresh load (a `BrowserWindow` reload, or app relaunch) starts
   from the plain default palette and re-applies the custom one from an
   effect that runs after `prefs:get` resolves. This is not a new problem
   this proposal introduces: `useThemePreference` already has the same
   characteristic today for the light/dark toggle — there is no inline
   pre-paint script in `index.html`, so the "wrong" scheme already paints
   for one frame on every load before the effect corrects it. A custom
   theme inherits that same one-frame flash; fixing it (a preload-time read
   of the active theme file, injected before first paint) is a real,
   separable improvement and is called out under "Phasing" rather than
   bundled in here.
4. **Scope.** This applies to the main window only. The overlay
   (`overlay.tsx`) and splash screen are separate renderer documents with
   their own stylesheets and their own reasons to look the way they do
   (`controls.css`'s own comment describes the overlay as a document that
   forgot a focus ring once already); folding a custom theme into either is
   not attempted in phase 1 and is flagged as speculative.

## The theme editor dialog

Built entirely from what already exists in
`src/renderer/components/controls/`: `Dialog`, `FormField`, `TextInput`,
`Select`, `Switch`, `RadioGroup`, `Card`/`Row` (the `Tile` primitives),
`Menu`, `StatusChip`, `Banner`. Nothing new gets invented at the primitive
level; there is no existing settings dialog in the shipped application to
extend, so this is the first screen built this way, not a variation on one.

Contents, top to bottom:

- **A theme gallery**, a grid of `Card` tiles (`role="option"` inside a
  listbox, exactly as the canvas already renders items) — one per saved
  theme, each showing its name and a tiny swatch strip of `--bg-app`,
  `--accent`, `--danger`, `--success` rendered as flat colour blocks. The
  active theme carries `aria-selected`, using the same styling
  `.card[aria-selected='true']` already gives a selected library item.
- **An import row**: a drop target for a `.json` file (or a `TextInput` to
  paste a zed-themes.com download URL, or the raw JSON — either way it ends
  at the same `theme:import-zed` call). A theme family with more than one
  `appearance` variant surfaces as a `RadioGroup` of variant names once
  parsed, defaulting to whichever variant matches the shell's current
  `data-theme`.
- **A live editor**, one `FormField` per colour token, grouped under
  `Select`-driven `RadioGroup`... in practice grouped visually the way
  `tokens.css`'s own comments already group the palette (backgrounds,
  borders, text, accent, status), each field a `TextInput` holding a hex
  value with a small colour swatch beside it. Editing a field re-runs
  `checkPalette` immediately — this is where "delightful" earns its keep:
  because the injection mechanism above is a handful of
  `style.setProperty` calls on the live document, every keystroke repaints
  the *entire real application* behind the dialog, not a mock preview pane.
  A designer sees the actual title bar, the actual nav rail, the actual
  primary button, changing as they type.
- **Failing pairs**, rendered as a `Banner` at the top of the editor body
  when any exist (`status="blocked"`, matching the warning colour already
  wired through `[data-status='blocked']`), listing each failing pair's
  `where` and its ratio, each with the "Nudge into range" action from
  "Contrast safety" above. A pair moves out of the banner the moment it
  passes; the banner itself disappears when none remain, so a designer
  gets a countdown rather than a static warning they learn to ignore.
- **Actions**: `Switch` for "match system appearance" (ties the theme's
  declared variant selection to `prefs.theme === 'system'`), and `Button`
  pair for Cancel / Save & Apply, following the same primary/default
  convention every other button in this shell already uses.

## Persistence and the IPC surface

One JSON file per saved theme, under
`path.join(app.getPath('userData'), 'themes', `${id}.json`)` — a directory
of files, not one blob, because the editor needs to list, delete, and
overwrite individual themes independently, the same reason Zed and
zed-themes.com both keep themes as separate files rather than one registry.
`preferences.json` stays a single file for exactly the opposite reason: it
has always been one small, whole-document write.

Shape of a saved theme (`ThemeFile`, proposed, in `src/shared/ipc.ts`
alongside the other request/response types):

```ts
interface ThemeFile {
  id: string;
  name: string;
  appearance: 'light' | 'dark';
  /** Present only if imported from a Zed file; absent for a theme built by hand. */
  source?: { family: string; variant: string };
  /** Every REQUIRED_TOKENS colour key, fully resolved — never partial. */
  tokens: Record<string, string>;
  /** Keys the designer edited after import, so a later "re-derive" leaves them alone. */
  manual: string[];
}
```

Following `AGENTS.md`'s IPC contract rules exactly — declare in
`src/shared/ipc.ts` first, add to `IPC_CHANNELS`, then handle in
`src/main/ipc.ts`, where a missing handler is a compile error:

| Channel | Request | Response |
| --- | --- | --- |
| `theme:list` | `void` | `{ id: string; name: string; appearance: 'light' \| 'dark' }[]` |
| `theme:get` | `{ id: string }` | `ThemeFile \| undefined` |
| `theme:import-zed` | `{ raw: string }` (file text, read client-side; no new file-system channel needed) | `{ ok: true; theme: ThemeFile } \| { ok: false; error: string }` |
| `theme:save` | `ThemeFile` | `void` |
| `theme:delete` | `{ id: string }` | `void` |

Activation deliberately needs **no new channel**. `Preferences` gains one
field, `customThemeId: string | null` (default `null`), validated in
`coerce` the same way `theme` already is (an allow-list check against
"is this id one `theme:list` currently returns", falling back to `null`
rather than trusting a hand-edited file). Setting it goes through the
existing `prefs:set` / `prefs:changed` pair, which already broadcasts to
every window — so "make this theme active" reuses the exact plumbing
"switch to light mode" uses today, rather than inventing a parallel one.

## Phasing

**Ships first:**
- The mapping and derivation algorithm above, as a pure function from a
  parsed Zed theme to a `Record<string, string>` covering all 28 colour
  tokens — testable in isolation, no Electron, no UI, following this
  repository's own preference for pure logic that `npm run mutate` can
  reach.
- `theme:import-zed`, `theme:save`, `theme:list`, `theme:get`,
  `theme:delete`, and the `customThemeId` preference field.
- The runtime injection mechanism (`setProperty` on `documentElement`, on
  top of `data-theme`), scoped to the main window only.
- The editor dialog itself, including live contrast feedback and the
  "Nudge into range" action, but **not** the gallery of previously-imported
  themes beyond a simple list — no thumbnail generation, no drag-to-reorder.

**Can wait, and is more speculative the further down this list:**
- Any pre-paint / no-FOUC startup path (a preload-time synchronous read of
  the active theme, injected before first paint). Real, but separable from
  everything above, and this shell does not currently solve the equivalent
  problem for light/dark either.
- Browsing zed-themes.com from inside the dialog. There is no public API to
  build a catalogue against (confirmed: `/api/themes` is a 404), so this
  would mean either scraping the gallery's HTML — fragile, and not
  something this proposal recommends building against — or asking a
  designer to keep pasting URLs, which the import row already supports and
  may simply be enough.
- Feeding `terminal.ansi.*` from an imported Zed theme into `ghostty-web`'s
  own colour scheme. Untested whether `ghostty-web` exposes a runtime
  palette API at all; would need its own investigation before any design
  work starts.
- Applying a custom theme to the overlay or splash windows. Both are
  separate documents with their own stylesheets and their own reasons to
  look the way they do; extending this to them is a second proposal, not an
  afterthought bolted onto this one.

## Risks

- **The accent double-duty problem** (above, under "Contrast safety") has
  no clean algorithmic resolution for an adversarial theme — a background
  near 50% luminance combined with a mid-tone accent can leave both the
  `accent` and `accent-contrast` pairs failing simultaneously with no
  single lightness value that fixes both. This is rare in practice (real
  themes pick clearly light or clearly dark backgrounds) but is a real
  edge, and the honest mitigation is the same one this proposal already
  recommends: surface both failing pills and let a person decide, rather
  than pretend an algorithm always has an answer.
- **Malformed source data.** One live-fetched, currently-listed
  zed-themes.com theme had a colour value missing its leading `#`. The
  importer has to treat every value defensively — normalise, and if a value
  still will not parse, treat that key as absent (falls through to
  "Contrast safety" step 2, filled from the default palette) rather than
  throwing partway through an import.
- **Zed schema drift.** The schema is versioned (`v0.2.0` in its own URL);
  Zed has changed theme keys before (older docs describe a flatter
  `element.background` style with fewer states than the current schema
  has). A future schema bump could rename or restructure a key this mapping
  depends on. Pinning to `v0.2.0` and re-checking the mapping when Zed ships
  a new schema version is a maintenance cost this proposal is taking on
  deliberately, not one it is hiding.
- **zed-themes.com's terms and stability were not checked.** Whether the
  site permits being fetched from inside an Electron app's renderer (CORS)
  or from the main process (no such restriction, but then it is Node
  fetching a third party's site on the designer's behalf) was not tested.
  Treat the current "paste a URL or drop a file" design as safe by
  construction — it never talks to zed-themes.com on the shell's own
  initiative — and treat anything more automated as needing that question
  answered first.

Sources: [Zed theme schema v0.2.0](https://zed.dev/schema/themes/v0.2.0.json), [Zed theme extensions docs](https://zed.dev/docs/extensions/themes), [`one.json` (Zed's own bundled theme)](https://github.com/zed-industries/zed/blob/main/assets/themes/one/one.json), [zed-themes.com](https://zed-themes.com/), [Electron `app.getPath`](https://www.electronjs.org/docs/latest/api/app), and this repository's own `src/renderer/lib/contrast.ts`, `src/renderer/styles/tokens.css`, `src/shared/ipc.ts`, `src/main/native/preferences.ts`, and `src/renderer/components/controls/`.

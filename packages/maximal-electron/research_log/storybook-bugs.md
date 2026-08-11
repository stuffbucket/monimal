# Storybook: high priority bugs

Drafted from the Storybook gap analysis. Every claim below was re-verified
against the working tree after the export and stylesheet work landed. Milestone
`v0.0.8` unless noted.

Existing issues already cover two findings and are not repeated here: #180
(four exported components have no story) and #179 (the demo composes primitives
a consumer cannot import).

## Status

| # | Bug | State |
| --- | --- | --- |
| 1 | Portals escape `.sb-shell` | **fixed in tree**, reproduced first |
| 2 | Storybook renders `shell.css` | open |
| 3 | Stories promise a status colour the package cannot draw | open |
| 4 | `storybook:check` cites a closed issue | **fixed in tree** |
| 5 | `Tile` offers a control that does nothing | open |

Bugs 1 and 4 are worth filing anyway, with the fix referenced: both are shipped
defects and this repository keeps the account rather than only the remedy. Bugs
2, 3 and 5 are unfixed and 2 is the one that hid the other two.

---

## 1. `Dialog`, `Menu` and `IconButton` portal outside `.sb-shell`, so their package styles never match

**Labels:** bug, renderer, package · **Milestone:** v0.0.8 · **Priority:** highest
· **State:** fixed in tree

### Evidence

Reproduced on a throwaway consumer page — `structural.css` plus a stylesheet
defining the eleven required `--shell-*` variables, mounting the real
`ShellLayout` with a real `Dialog`, `Menu` and `IconButton`. Computed styles
before the fix:

| Node | `closest('.sb-shell')` | Computed |
| --- | --- | --- |
| `.dialog` | `null` | `position: static`, transparent, `radius 0`, `width 1280px` |
| `.dialog__scrim` | `null` | `position: static`, transparent |
| `.menu` | `null` | `min-width 0`, transparent, `radius 0` |
| `.menu__item` | `null` | `display: block`, `color rgb(0,0,0)` |
| `.tooltip` | `null` | transparent, `radius 0`, `font-size 16px` |

The control that isolates ancestry as the cause: a **clone of the same
`.dialog` node**, same stylesheet, same classes, appended under `.sb-shell`,
resolved to `position: fixed`, `rgb(22,28,36)`, `radius 14px`, `width 520px`.
Only the ancestor differs. So the dialog a consumer sees is a 1280px static
block with no background over no scrim.

### Cause

`structural.css` is the only stylesheet the package ships and every selector in
it is scoped under `.sb-shell`. `tests/package-exports.test.ts` enforces that
scoping. `ShellLayout.tsx:174` is the only place that renders the class.

Three exported components render through a Radix portal and none passes a
`container`:

| Component | Site |
| --- | --- |
| `Dialog` | `src/renderer/components/controls/Overlays.tsx:50` |
| `Menu` | `src/renderer/components/controls/Overlays.tsx:109` |
| `IconButton` tooltip | `src/renderer/components/controls/Button.tsx:96` |

`node_modules/@radix-ui/react-portal/dist/index.mjs:16` resolves
`container = containerProp || document.body`. The portalled subtree therefore
lands on `document.body`, outside the `.sb-shell` div, and these rule blocks in
`structural.css` cannot match for a consumer: `.dialog`, `.dialog__scrim`,
`.menu`, `.menu__item`, `.menu__header`, `.tooltip`.

A consumer following the documented composition gets an unstyled modal over an
unstyled scrim.

**Why no check caught it.** `tests/package-styles.test.ts` asks whether a
rendered class has a rule in `structural.css`; `.menu` has one.
`tests/package-exports.test.ts` asks whether every selector is scoped; every one
is. Both pass. The rule exists and cannot match — one layer further out than
either check looks, and the same shape as the third tripwire that test's own
comment describes in #118.

**Why this application never saw it.** `shell.css` and `controls.css` are
unscoped, so they match a portalled element happily. The defect is only visible
under the stylesheet a consumer installs, which nothing in this repository
renders — see issue 2 below, which is why this went unnoticed until `Dialog` and
`Menu` became public.

**Fix as applied.** `Overlays.tsx` owns a `ShellRoot` context, `ShellLayout`
publishes its root element through `ShellPortalRoot`, and the three portals pass
`container`. `useShellPortalContainer()` returns `?? undefined`, which is exactly
what Radix reads as "use `document.body`", so `Dialog`, `Menu` and `IconButton`
still work standalone with no provider. Neither barrel changed, so no new public
API. The alternative of moving `.sb-shell` to `body` loses because it makes every
rule in a deliberately scoped file match the consumer's whole document, and
because nothing here can assert what a consumer puts on their `body`.

**Covered by.** `tests/portal-container.test.ts` (in CI) asserts each portal
names a container resolved from the shell root, not merely that it names one —
`container={document.body}` fails it. `ShellLayout.stories.tsx` carries a
`Portalled` story whose `play` asserts each portalled node's
`closest('.sb-shell')` is the shell root, which is the half that needs a DOM.
That half is local-only, since `storybook:check` is not in CI.

**Acceptance.** A consumer composing `Dialog` under `.sb-shell` with only
`dist/renderer/styles.css` gets a styled dialog and scrim, and a check fails when
a portalled subtree escapes the root. No unscoped selector enters
`structural.css`.

---

## 2. Storybook renders `shell.css`, so no surface in this repository draws the stylesheet a consumer installs

**Labels:** bug, storybook, package · **Milestone:** v0.0.8 · **Priority:** high

`.storybook/preview.ts:7` imports `../src/renderer/styles/shell.css`, which
`@import`s `controls.css`, which reads `tokens.css`. That is this application's
stylesheet, with this application's palette, unscoped.

The package ships `structural.css`: no palette, every rule under `.sb-shell`.
Nothing imports it at run time anywhere in the repository.

So every story draws a component the way this application draws it, not the way
a consumer receives it. Two differences a consumer meets immediately:

- **No rule matches at all** until the consumer applies `.sb-shell` themselves.
  Only `ShellLayout` renders that class and no story renders `ShellLayout`, so a
  consumer composing `Button` or `Card` directly — which the README shows —
  sees unstyled markup and no story warned them.
- **Every colour is this application's.** The stories cannot show what an unset
  `--shell-*` variable draws, which is the failure mode `docs/shell-variables.md`
  exists to prevent and the one that cost `stuffbucket/maximal` seven variables
  of drift in #93.

This is the root cause of bug 1 and bug 3: both are invisible in Storybook by
construction.

**Fix.** A toolbar switch or decorator that renders `structural.css` under a
`.sb-shell` root as an alternative to `shell.css`, on the pattern of the existing
theme switch in `preview.ts`. One toggle, and every story shows both what this
application draws and what the package ships.

**Acceptance.** A story can be viewed under the shipped stylesheet, and doing so
on `Dialog` reproduces bug 1 on sight.

---

## 3. The stories promise a status colour the package cannot draw

**Labels:** bug, storybook, package · **Milestone:** v0.0.8 · **Priority:** high

`structural.css` contains **zero** `data-status` selectors. Verified:

```
grep -c "data-status" src/renderer/styles/structural.css   # 0
grep -c "data-status" src/renderer/styles/controls.css     # 16
```

`controls.css` maps `data-status` onto a colour pair for `.dot`, `.chip`,
`.nav__item` and `.banner`. The package instead reads
`var(--shell-status, var(--shell-text-subtle))` and
`var(--shell-status-muted, var(--shell-active))`, and
`docs/shell-variables.md` says the host maps its own vocabulary onto that pair.

That design is defensible. The stories contradict it. `Chips` shows five
differently coloured pills and `Banner` shows `Warning` and `Failed` in distinct
colours. A consumer who copies either gets identical grey. The stories are not
wrong about the component; they are wrong about the package.

**Fix.** Depends on bug 2. Under the shipped stylesheet these stories should
render grey, and the story or its docs should state that the host supplies the
mapping and show the two lines that do it.

**Acceptance.** No story shows a visual distinction a consumer cannot reproduce
from the documented contract alone.

---

## 4. `storybook:check` reports a violation against a closed issue, so its accessibility pass is a signal nobody can act on

**Labels:** bug, storybook, tooling · **Milestone:** v0.0.8 · **Priority:** high
· **State:** fixed in tree

The run prints:

```
77 stories. All rendered and played. 1 accessibility violations (not fatal, see issue #28).
```

Three things are wrong.

- **The issue is closed and was about something else.** #28 is `--text-muted`
  failing WCAG AA contrast. `npm run check:contrast` now passes 3 assertions over
  44 things with zero failures. The message sends a reader to a closed issue
  about a different rule.
- **The violation is a story artifact.** It is `aria-hidden-focus x1 (serious)`
  on `controls-dialog--menu-keyboard`. That story opens the menu with arrow keys
  and never closes it, so axe sees the trigger still focusable behind an
  `aria-hidden` popup. The sibling `MenuHeader` closes with `{Escape}` and
  carries a comment saying why. `MenuKeyboard` is missing that line.
- **The count is therefore permanently one and permanently non-fatal.** The
  stated reason for tolerating violations was that the palette could not reach
  zero. It reaches zero now. A real regression arrives as
  `2 accessibility violations (not fatal)` and nobody notices — on `Menu` and
  `Dialog`, which are public API as of this train.

**Fix.** Close the story's menu so the run reaches zero, then make axe failures
fatal, or at minimum name the actual rule and story rather than a stale issue
number. If any violation stays tolerated, it belongs in the script as a named
constant with its reason beside it, not in prose.

**Acceptance.** The run reports zero violations, and introducing one fails or is
unmistakable in the output.

---

## 5. `Tile` offers a `status` control that changes nothing and hides `modifier`, the seam that does

**Labels:** bug, storybook · **Milestone:** v0.0.8 · **Priority:** medium-high

`Tile.stories.tsx:35` exposes `status` as an inline-radio with four options.
No `.card[data-status]` rule exists in `structural.css`, `shell.css` or
`controls.css` — verified, zero matches in all three. Changing the control does
nothing at all.

`Tile.stories.tsx:40` sets `modifier: { table: { disable: true } }`, hiding it
from the docs page. `modifier` is the actual extension seam: the capture fixture
passes `modifier="run-card"` and `modifier="run-row"` on every tile and supplies
its own `.run-card[data-status]` rules in `demo.css`. That is exactly the
pattern a consumer needs and the story hides it.

So the story teaches a control that does nothing and conceals the one that does.

**Fix.** Drop the `status` control or give `.card[data-status]` a rule. Un-hide
`modifier` and add a story showing a caller-supplied modifier class, which is how
the fixture builds a run card.

**Acceptance.** Every control on the `Tile` docs page changes something visible,
and the modifier seam has a worked example.

---

## Minor, worth filing but not high priority

`IconButton` requires a `Tooltip.Provider`. Its own docstring says so, the
`Icons` story says so, and `preview.ts` says so — the README's renderer section
does not. `Banner` renders an `IconButton` whenever `onDismiss` is passed, so a
consumer using `Banner` outside `ShellLayout` loses the dismiss button with no
error. The docstring does reach a consumer through the `.d.ts` and autodocs, so
this is a gap rather than a silent failure.

---

## Separate: `.app` collides between the window root and a settings card

**Labels:** bug, renderer · **Milestone:** v0.0.8 · **Priority:** medium
· **State:** open, and it is in the application rather than the package

Found while triaging the CSS mirror. Two unrelated rules share the selector
`.app`:

| File | Rule | Rendered by |
| --- | --- | --- |
| `shell.css:27` | `display: grid`, `grid-template-rows`, `height: 100%` | `ShellLayout.tsx:179`, `<div className="sb-shell app">` — the window root |
| `controls.css:759` | `display: grid`, `gap`, `padding`, `border`, `border-radius` | `AppTogglesDialog.tsx:63`, `<li className="app">` — a settings list item |

`shell.css` opens with `@import './controls.css'`, so the card rule loads first
and the two have equal specificity. The window root rule overrides `display`
only. So the application window inherits `gap: var(--space-2)`,
`padding: var(--space-3)`, `border: 1px solid var(--border-subtle)` and
`border-radius: var(--radius-card)` from a settings card, with
`box-sizing: border-box` in force.

The package is not affected: `structural.css` carries the three window-root
properties and none of the card's, which is what surfaced the difference.

**Verified** by reading both stylesheets, the import order, the two call sites,
and the `box-sizing` reset. **Not verified** by rendering — confirm the inset
and the border on screen before fixing, since the fix depends on whether anyone
has since compensated for it elsewhere.

**Fix.** Rename the settings card's class. `.app` is too generic for a
component-scoped rule, and `.app-toggle` or similar matches the naming the rest
of `controls.css` uses.

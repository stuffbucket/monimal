# Storybook

`npm run storybook`. Stories sit beside their components as `*.stories.tsx`.

It is a developer tool: CI does not build it, for the same reason CI does not
capture stills. The cost is that a story broken by a refactor rots until
somebody opens it.

Two things it is good for that nothing else here was. A component in every state
at once, without driving the application into each one. And the light palette,
which previously only appeared by launching the shell and toggling a preference
— the toolbar switch sets `data-theme` exactly as `useThemePreference` does. It
earned itself immediately: `--elevation-dialog` was a single half-black shadow
for both schemes, which reads as depth in the dark palette and as a grey smudge
on a white page.

## Two stylesheets, as a second toolbar switch

`shell.css` is what this application draws with. `structural.css`, which
`scripts/copy-renderer-css.mjs` publishes as
`@stuffbucket/maximal-electron/renderer/styles.css`, is the only CSS a consumer
installs. They are not the same file: the shipped one declares no palette and
scopes every rule under `.sb-shell`. Storybook used to load the first and
nothing loaded the second, so every story showed what this application draws
rather than what the package ships. Issue #181.

The **Stylesheet** switch is the answer, built like the theme switch beside it:
a toolbar global and a decorator that reads it.

| Position | Loads | Root class |
| --- | --- | --- |
| Application | `shell.css`, which imports `controls.css` and `tokens.css` | none |
| Package | `tokens.css`, `.storybook/consumer.css`, `structural.css` | `.sb-shell` on the story root |

Three decisions are worth the words.

**The class goes on the story's own root, not on a wrapper and not on `body`.**
A story that renders `ShellLayout` gets `.sb-shell` from the component. A story
that composes `Button` or `Card` directly — which README.md shows — has it from
nowhere, and every shipped rule misses. Marking `body` instead would style a
Radix portal for free, because a portal defaults to the body, and that would
retire the check that caught issue #185 on the day it was built.

**The palette comes from `.storybook/consumer.css`, which is a consumer.** The
shipped stylesheet declares none, so a host must. That file aliases the eleven
`required` names to the tokens `tokens.css` already defines, rather than
copying values, so the two modes cannot drift apart and the theme switch keeps
working in both. It sets a `fallback` name only where this design system
differs from the value the shipped rule already carries, and it deliberately
does not map `--shell-status` or `--shell-status-muted`: those are a vocabulary
rather than a value, `StatusChip` passes the state straight through, and
inventing a mapping in Storybook would draw colours the contract cannot
promise. `docs/shell-variables.md` is the list; the file names what it leaves
out and why.

**Switched, not side by side.** `shell.css` matches `.chip` anywhere in the
document, including inside a `.sb-shell`, so a package pane sharing a document
with an application pane would be drawn by both files. Storybook puts a global
in the URL, so two documents is two windows on the same story with
`&globals=shell:app` and `&globals=shell:package`.

`npm run storybook:check` drives the preview by URL and knows nothing about a
global, so the environment selects the mode for a whole run:

```
npm run storybook:check                          # application
STORYBOOK_SHELL_MODE=package npm run storybook:check
```

The package run is at zero, and it took one repair to get there. With
`--shell-status` and `--shell-status-muted` unmapped, `Banner`, `StatusChip`
and `Callout` drew the pair's own fallback, which was `--shell-text-subtle` on
`--shell-active`: 4.17:1 in the dark palette, against a requirement of 4.5.
`docs/shell-variables.md` promises that a host mapping neither "gets a legible
chip in a neutral fill", and for this palette the promise was false. The
fallback is `--shell-text-muted` now, at 5.07:1. Nothing measured that pair
before, because `CONTRAST_PAIRS` covers this application's tokens and not the
`--shell-*` namespace; issue #65 is the hole.

What the mode is for is the rest of it. A difference on an export of
`src/renderer/index.ts` is either a variable a host chose not to set, which the
fallback table explains, or a rule the shipped stylesheet does not have. The
second kind is the one to open an issue about.

## Conventions

These are the ones in Storybook's own documentation.

- One story per state, not one page listing everything. `Primary`, `Disabled`,
  `Sizes` — not `All`.
- `component` on the meta points at the real component, and `args` drive it, so
  the Controls panel and the generated docs page have something to work with.
  Reach for `render` only when the output is not the component with args
  applied.
- `play` for behaviour a screenshot cannot show. The dialog's focus trap and the
  menu's arrow keys are asserted there rather than in a script that lives for
  one run.
- `tags: ['autodocs']` is global, so every component gets a docs page from its
  args and its docstring.
- `@storybook/addon-a11y` runs axe per story. It found the contrast failures in
  issue #28 within a minute of being installed.
- `npm run storybook:check` drives every story headlessly: render errors, `play`
  failures, and axe. Also a developer tool, also not in CI — but a `play`
  function nobody runs is the same problem as an end-to-end test that needs a
  model, so there is one command for it.
- **An axe violation fails that run.** It did not until the story set reached
  zero. A tolerated count of one is a number nobody reads, and the regression
  after it arrives as a two. The exit code reaches only the developer who typed
  the command, because nothing in CI builds Storybook.
- A violation is as often the story's fault as the product's. Leaving a menu or
  a dialog open at the end of a `play` function leaves the trigger focusable
  behind an `aria-hidden` popup, which axe reports as `aria-hidden-focus`. Close
  what you opened.
- Page-level axe rules are off for stories (`landmark-one-main`,
  `page-has-heading-one`, `region`). A story is a component, not a page, and a
  panel that is never green is a panel nobody reads.
- Render a component inside the context it requires. A `Card` outside a listbox
  reports `aria-required-parent`, which is the story's fault and not the
  product's.

## Every exported component has a story

`tests/component-stories.test.ts` walks the relative imports out of
`src/renderer/index.ts` and requires each component module to have a sibling
`*.stories.tsx` that imports it. The public surface went from about nineteen
names to forty-three without Storybook changing, and nothing said so.

`PENDING` there names any component that crossed over without one, with the
issue that will close it. That list may only shrink, and it is empty: every
exported component has a story. An entry returning is a component that reached
the public surface undocumented, which is the state the check exists to end.

## Two files that look like configuration and are not

`.storybook/preview-head.html` stubs `window.stuffbucket` as a classic script,
because `src/renderer/lib/bridge.ts` reads it at module scope. A stub inside
`preview.ts` would be a race against import hoisting.

`.storybook/preview.css` undoes the part of `shell.css` that assumes an
application window: the full-height, overflow-hidden rule on `html` and `body`
clips a long story at the fold. It has to win, and its `body` rule and
`shell.css`'s reset have the same specificity, so `shell-mode.ts` puts the mode
stylesheet first in `head` rather than relying on which of a dev server's
injected `<style>` and a build's `<link>` lands where.

## A story that is not in the package

The mode says nothing about whether a component ships. `SettingsPage`,
`ModelCards`, `Usage`, `Diagnostics`, `ApiKeysDialog` and `Profile` are this
application's, not the package's, and 61 class names they draw with exist in
`shell.css` and `controls.css` and in no shipped rule. Under the package mode
they render as unstyled markup, which is correct: nothing installs them either.
Read a difference there as "this is the application", and a difference on an
export of `src/renderer/index.ts` as something to explain.

## Stories stay out of the package

Nothing imports a story, so Vite never reaches one from an entry point.
`npm run verify:package` asserts that rather than assuming it.

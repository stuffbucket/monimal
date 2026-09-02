# The `--shell-*` contract

`@stuffbucket/maximal-electron/renderer/styles.css` ships no palette. Every colour,
space, radius, and height in it comes from a custom property the host defines,
and this document is the list of them.

The list is derived, not written. `scripts/shell-variables.mjs` parses
`var(--shell-…)` out of the stylesheets `packageStylesheets` names, and
`tests/shell-variables.test.ts` compares the result against the tables below in
both directions. A variable added to a rule and left out of a table fails, and
so does a row nothing reads.

## Why this exists

A hand-maintained list drifts. `stuffbucket/maximal` maintains 57 lines of
`client/src/renderer/styles/shell-adapter.css` by reading our source. Measured
against `release/0.0.4`, it sets 49 names, of which 27 are ones nothing here
reads, and it leaves 7 of ours unset: `--shell-danger`,
`--shell-danger-contrast`, `--shell-nav-heading-height`, `--shell-status`,
`--shell-terminal-background`, `--shell-terminal-cursor`, and
`--shell-terminal-foreground`. Six of the seven arrived after their pin. Every
one of the eleven `required` variables is set, so the drift renders a plausible
shell rather than a broken one, which is why nothing on either side said so.
Issue #93.

## The four kinds

| Kind | Read as | Unset renders |
| --- | --- | --- |
| `required` | `var(--shell-x)` in at least one rule | nothing: a transparent surface or an inherited colour |
| `fallback` | only ever `var(--shell-x, …)` | the fallback in the table |
| `runtime` | resolved by JavaScript, in no rule | the emulator's own default |
| `structural` | declared by `structure.css`, read by any rule | never unset; this package ships the value |

The kind is a property of the CSS, not a judgement. A `fallback` variable that
gains a rule with no fallback becomes `required`, and the check fails until the
table says so.

## Structural

`structure.css` declares these with values, so a consumer never has to supply
one and never has to know they exist. They are not a knob set: reaching for a
spacing token means writing layout CSS, which is what the components exist to
make unnecessary. What they are for is that no rule — ours or a consumer's —
writes `font-size: 13px` again.

| Variable | Value | What it sets |
| --- | --- | --- |
| `--shell-control-lg` | `28px` | The tallest control height. |
| `--shell-input-border` | `var(--shell-border-strong, var(--shell-border, #2a2a2a))` | The outline of a field. |
| `--shell-leading-base` | `1.5` | Line height for a paragraph. |
| `--shell-radius` | `6px` | A control corner. |
| `--shell-radius-large` | `8px` | A card corner. |
| `--shell-radius-pill` | `9999px` | A fully rounded control. |
| `--shell-space-1` | `4px` | The tightest gap. |
| `--shell-space-2` | `8px` | A gap inside a control. |
| `--shell-space-3` | `12px` | A gap between controls. |
| `--shell-space-4` | `16px` | Padding around a surface. |
| `--shell-space-5` | `24px` | A gap between sections. |
| `--shell-text-base` | `0.875rem` | Body text. |
| `--shell-text-md` | `0.9375rem` | A surface title. |
| `--shell-text-sm` | `0.8125rem` | Secondary text. |
| `--shell-text-xs` | `0.6875rem` | All-caps section labels and counts. |
| `--shell-tracking-caps` | `0.04em` | Tracking for an all-caps label. |
| `--shell-weight-lg` | `600` | A heading. |
| `--shell-weight-md` | `500` | A label that carries emphasis. |

Two groups. The first nine the published stylesheet already read, but only as
an inline fallback on each use — `var(--shell-radius, 6px)`. That works for a
rule that spells the fallback out and fails for one that does not, and the
rules a component carries do not: a bare `var(--shell-radius-large)` is not a
smaller radius, it is a square corner. Declaring them once is what makes a bare
read safe, and `tests/structure-tokens.test.ts` holds each value to the
fallback the stylesheet still spells out.

The rest the published stylesheet has no name for at all. The rules a component
carries set type, and `--shell-font` is one shorthand: one size, one weight,
one leading. A settings surface draws four sizes and three weights.

The first version of this file declared thirty-eight, built by prefixing the
short names `tokens.css` authors. Twenty were a second name for something
already published — `--shell-radius-card` beside `--shell-radius-large` — and
nothing read either. The tests now fail on a declared name nothing reads, and
on a value that disagrees with the stylesheet's own fallback.

## Required

Define all eleven. `ShellLayout` applies the `.sb-shell` root class; define them
on that container or an ancestor. README.md carries the same table with the
description of what each one draws.

| Variable |
| --- |
| `--shell-accent` |
| `--shell-accent-muted` |
| `--shell-active` |
| `--shell-background` |
| `--shell-border` |
| `--shell-canvas` |
| `--shell-hover` |
| `--shell-raised` |
| `--shell-text` |
| `--shell-text-muted` |
| `--shell-text-subtle` |

## Fallback

Each of these has a value in the CSS. Set one when the design system differs
from it. Fourteen fall back to another `--shell-*` rather than to a literal,
which is where legibility survives an unset value but meaning does not:
`--shell-danger` resolving to `--shell-hover` draws a destructive control that
looks exactly like an ordinary hovered one.

| Variable | Fallback | Drawn by |
| --- | --- | --- |
| `--shell-accent-contrast` | `--shell-text` | the `Switch` thumb, and the label on a primary `Button` |
| `--shell-border-hover` | `--shell-accent` | the outline of a hovered button or field |
| `--shell-border-strong` | `--shell-border` | tooltip, dialog and menu outlines, hovered card border, scrollbar thumb |
| `--shell-control-height` | `28px` | icon button box, field height |
| `--shell-danger` | `--shell-hover` | destructive icon button, destructive `Button` fill, highlighted destructive menu item |
| `--shell-danger-contrast` | `--shell-text` | the glyph or label on any of those |
| `--shell-disabled-opacity` | `0.5` | a disabled button, field, switch or choice |
| `--shell-elevation` | `none` | the shadow under a tooltip, a dialog and a menu popup |
| `--shell-focus` | `--shell-accent` | focus ring on every control |
| `--shell-font` | `400 14px/1.5 system-ui, sans-serif` | the shell's whole type |
| `--shell-font-mono` | `ui-monospace, SFMono-Regular, Menlo, monospace` | the value half of a `Field` |
| `--shell-icon-stroke` | `1.5` | the stroke weight of every Lucide glyph inside the shell |
| `--shell-input-background` | `--shell-canvas` | the surface of a text field, textarea, select and radio |
| `--shell-invalid` | `--shell-danger` | the outline and the message of a field that failed validation |
| `--shell-nav-heading-height` | `24px` | the space a collapsed `NavRail` keeps for a section heading |
| `--shell-position` | `fixed` | how the `ShellLayout` root meets the window; `static` lays it out inside the consumer's own container instead |
| `--shell-radius-dialog` | `14px` | the modal card, which is a panel rather than a control |
| `--shell-radius-small` | `4px` | tab close affordance, tooltip, segmented control, menu item |
| `--shell-scrim` | `rgb(0 0 0 / 0.34)` | the layer a modal dims the window with |
| `--shell-status` | `--shell-text-muted` | the status dot, the `StatusChip` label, the `Banner` text, the `Callout` outline; the `Callout` heading reads it too and falls back to `--shell-text`, which is the legible one on a raised fill |
| `--shell-status-muted` | `--shell-active` | the `StatusChip`, `Banner` and `Callout` fills |
| `--shell-statusbar-height` | `24px` | the compact register `.statusbar` keeps as a minimum, not a fixed height |
| `--shell-tab-active` | `--shell-canvas` | the fill behind the selected tab |
| `--shell-terminal-background` | `--shell-canvas` | the terminal's own surface |
| `--shell-titlebar-height` | `40px` | the height of the title bar strip |
| `--shell-warning` | `--shell-accent` | the attention marker on a tab |

`--shell-status` and `--shell-status-muted` are the pair a host maps its own
states onto. Nothing here maps them: a `[data-status]` vocabulary is the
application's, and `StatusChip` passes the raw state straight through to the
attribute. A host that sets neither gets a legible chip in a neutral fill:
`--shell-text-muted` on `--shell-active` measures 5.14:1 in this repository's
dark palette and 5.39:1 in the light one, both above the 4.5:1 AA text
minimum. `--shell-text-subtle` carried this fallback before and measured
4.17:1 and 4.18:1: below the minimum in both, which is how three consumers
passed a status, got the neutral fill by leaving both unmapped, and shipped it
unread. `STORYBOOK_SHELL_MODE=package npm run storybook:check` is what found
it, over the shipped stylesheet under a consumer's own palette; `npm run
check:contrast` checks this application's tokens and never reads `--shell-*`
at all.

## Runtime

`ghostty-web` draws to a canvas, inherits nothing from CSS, and takes literal
colours at construction. `readTerminalTheme` resolves these through
`SHELL_TERMINAL_PROPERTIES`, so no rule mentions them and grep over the CSS
alone would miss them. A property that does not resolve is left out rather than
passed through empty, because the emulator parses an unrecognised colour to
black.

| Variable | Drawn by |
| --- | --- |
| `--shell-terminal-cursor` | terminal cursor |
| `--shell-terminal-foreground` | terminal text |

`--shell-terminal-background` is read both ways and is listed above, under its
CSS kind.

## Rules a component carries

The shipped stylesheet is not the only CSS a consumer receives. A component may
carry its own rules in its own source and inject them the first time it renders
— `src/renderer/lib/component-styles.ts` is the mechanism, and the settings
surfaces are the components that use it.

That exists because `structural.css` is a hand-maintained copy of rules
authored in `controls.css`, and a copy drifts. `tests/package-styles.test.ts`
was written to catch that drift and its header records twenty selectors that
had already gone, including a primary button that stopped changing colour on
hover. A component that carries its own rules has no copy to drift: exporting
it and shipping its styles are one act.

Nothing about the contract changes. Those rules read `--shell-*` like every
other, they are scoped under `.sb-shell` like every other, and
`tests/component-styles.test.ts` holds them to both — plus one rule the
stylesheet never needed, that they may write no value a token should hold. A
colour or a size spelled out in a TypeScript file is a design decision in a
place no theme can reach.

Where a component needs geometry the ramp has no name for — the height of a
usage bar, the width of a legend swatch — it declares a token for it in its own
sheet, with a value, overridable at the root. That is the third tier of the
usual primitive, semantic and component split, and it is the only way a literal
gets into one of these files.

## What the variables do not cover

Every rule in the shipped stylesheet is scoped under `.sb-shell`, so the
document around it stays the consumer's. The package asks nothing of it.
`.sb-shell.app` is fixed to the viewport, so a shell drawn by `ShellLayout`
fills the window with no `html, body, #root { height: 100% }` and no
`body { margin: 0 }` underneath it. That reset used to be the price of a
correct shell, and the symptom of leaving it out — a correct palette on a shell
an inch tall — read as a defect in the package. The capture fixture hit it while
consuming the package the way this document prescribes, and dropped the reset
again once `--shell-position` landed.

Two things stay outside the contract.

**A layout composed without `ShellLayout`.** `TitleBar`, `NavRail` and `Canvas`
style themselves and not the element that holds them, because that element is
the consumer's. A consumer arranging the parts owns the frame around them, and
no variable can reach a container the package does not render.

**Artwork that is not a Lucide glyph.** `--shell-icon-stroke` applies through
`svg.lucide`, which is the class Lucide writes on the element. A blanket
`.sb-shell svg` would restyle a consumer's logo and any other icon set they put
inside the shell. That is their drawing rather than the shell's furniture, so
the weight the package sets stops at the glyphs the package draws.

## Assert against it from a consuming application

`@stuffbucket/maximal-electron/verify/shell-variables` is pure and imports no
`electron`, so it runs under plain `node`. Point it at the stylesheet the
package ships and at whatever your application defines. Nothing is
hand-transcribed on either side, so the two cannot drift.

```js
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import {
  failedShellVariableChecks,
  shellVariableContract,
} from '@stuffbucket/maximal-electron/verify/shell-variables';

const require = createRequire(import.meta.url);
const css = readFileSync(require.resolve('@stuffbucket/maximal-electron/renderer/styles.css'), 'utf8');

const contract = shellVariableContract({
  stylesheets: [{ name: 'styles.css', css }],
  runtimeProperties: [
    '--shell-terminal-background',
    '--shell-terminal-foreground',
    '--shell-terminal-cursor',
  ],
});

const adapter = readFileSync('src/renderer/styles/shell-adapter.css', 'utf8');
const defined = new Set(
  [...adapter.matchAll(/^\s*(--shell-[a-z0-9-]+)\s*:/gm)].map((match) => match[1]),
);

const missing = contract.required.filter((name) => !defined.has(name));
if (missing.length > 0) throw new Error(`unset: ${missing.join(', ')}`);
```

`shellVariableChecks` is the stricter form, and returns a `{ name, ok }` list in
the shape `@stuffbucket/maximal-electron/verify` uses. `failedShellVariableChecks` names
the ones that did not hold.

Both start with floors: an empty stylesheet list, an empty derived contract, or
a contract with no required variable fails. A parser that stops matching would
otherwise report a complete contract over nothing.

## Why there is no defaults layer

A `:root { --shell-text: … }` block would make an unset variable degrade
legibly. It was rejected, for three reasons.

**It would hide the drift this contract exists to surface.** An unpublished
variable that resolves to a default renders a plausible shell, which is the
failure mode of the last two years of this seam: never an error, only a slightly
wrong picture. Defaults and a drift check pull in opposite directions, and the
check is the thing a consumer cannot write for themselves.

**The variables where a default would help already have one.** All thirty
`fallback` entries above carry their value in the rule that reads them, next to
the property it sets, where it is visible to anyone reading that rule. A
separate layer would restate them, and the two would drift. The eleven
`required` variables are the ones with no default — and they are a palette. A
default palette is what `structural.css` deliberately does not ship;
`tests/package-styles.test.ts` asserts the file declares no token of its own for
exactly that reason.

**A default palette has to pass contrast, and this repository cannot yet check
that it does.** `CONTRAST_PAIRS` in `src/renderer/lib/contrast.ts` covers the
shell's own tokens, not the `--shell-*` namespace, and it skips any pair whose
colours it cannot parse — so a defaulted `--shell-text` on a defaulted
`--shell-background` would be checked by nothing that runs today. Issue #65 is
the known hole: a pair written as `rgb(r g b / a)` composites against a surface
`checkPalette` cannot see, so the tints are outside the contract entirely.
Shipping a palette before that closes would be shipping colours nothing has
measured.

The consumer keeps the choice and the check keeps the list honest. That is a
better trade than a palette nobody chose.

## Adding a variable

1. Write the rule.
2. Add the row to the table above, and to README.md if it is `required`.
3. `npm test`. The check names any variable that is read and not published, or
   published and not read.

Neither step is optional and neither is a comment. The table is compared to the
CSS on every run.

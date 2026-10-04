# The `--shell-*` and `--maximal-color-*` contract

`@maximal/maximal-electron/renderer/styles.css` ships no palette. Every colour,
space, radius, and height in it comes from a custom property the host defines,
and this document is the list of them.

The list is derived, not written. `scripts/shell-variables.mjs` parses
`var(--shell-…)` and `var(--maximal-color-…)` out of the stylesheets `packageStylesheets` names, and
`tests/shell-variables.test.ts` compares the result against the tables below in
both directions. A variable added to a rule and left out of a table fails, and
so does a row nothing reads.

## Colour names

Every colour is a `--maximal-color-*` token named
`--maximal-color-{type}-{element}-{role}-{prominence}-{interaction}`: the
Figma plugin theme grammar with an element slot.

| Slot | Values |
| --- | --- |
| type | `bg`, `text`, `icon`, `border`; always written |
| element | omitted for a global colour, or `toolbar`, `menu`, `tooltip` |
| role | `default`, `brand`, `selected`, `disabled`, `component`, `slot`, `assistive`, `danger`, `measure`, `warning`, `success`, `info`, `inverse`, or `on` before a role, as in `onbrand`, or `onlightcanvas` and `ondarkcanvas` for text over user content |
| prominence | `default`, `secondary`, `tertiary`, `strong` |
| interaction | `default`, `hover`, `pressed` |

A slot left at `default` is omitted. A name whose role, prominence and
interaction are all `default` ends in the single word `default`, so every
colour has one name: `bg-default`, `bg-menu-default`, `bg-menu-hover`,
`bg-brand`, never `bg`, `bg-menu` or `bg-brand-default`.

`bg-default`, `bg-secondary` and `bg-tertiary` are successive layers: the
window chrome, the canvas behind documents and terminals, and floating
surfaces. No shipped rule reads an element colour yet; one that does falls
back to the global colour of the same type, role, prominence and interaction,
so a host defines it only where that surface differs. `isColorToken` in `scripts/shell-variables.mjs` is the grammar, the
contract check fails a derived colour name it rejects, and the
`shell/design-tokens` and `shell-contract/namespace` lint rules report one in
source.

A host MAY define atomic colours such as `--maximal-color-blue-500` that its
semantic colours alias. Package rules MUST NOT read them; they read only
semantic names.

Component tokens with no colour role, such as `--shell-status`,
`--shell-tab-active` and `--shell-terminal-background`, stay in `--shell-*`
and point at colour tokens.

## Why this exists

A hand-maintained list drifts. `stuffbucket/maximal` maintains 57 lines of
`maximal-client/src/renderer/styles/shell-adapter.css` by reading our source. Measured
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
| `structural` | declared by `shell-structural-tokens.css`, read by any rule | never unset; this package ships the value |

The kind is a property of the CSS, not a judgement. A `fallback` variable that
gains a rule with no fallback becomes `required`, and the check fails until the
table says so.

## Structural

`shell-structural-tokens.css` declares these with values, so a consumer never
has to supply one or know it exists. They are not a knob set: reaching for a
spacing token means writing layout CSS, which is what the components exist to
make unnecessary. What they are for is that no rule — ours or a consumer's —
writes `font-size: 13px` again.

Spacing, control heights, and row heights use a 4px layout grid. Borders,
focus rings, type, and optical details are not spacing increments.

| Variable | Value | What it sets |
| --- | --- | --- |
| `--shell-border-width-thin` | `1px` | A standard control or surface stroke. |
| `--shell-control-sm` | `24px` | A compact control height. |
| `--shell-control-md` | `28px` | The default control height. |
| `--shell-control-lg` | `32px` | The tallest control height. |
| `--shell-field-background` | `var(--maximal-color-bg-default, var(--maximal-color-bg-secondary))` | The resolved surface behind an editable field. |
| `--shell-focus-ring-offset` | `2px` | Space between a control and its keyboard focus ring. |
| `--shell-focus-ring-width` | `2px` | Keyboard focus ring width. |
| `--shell-icon-prominent` | `24px` | A prominent navigation or feature glyph. |
| `--shell-spatial-grid-radius` | `1px` | The spatial grid dot radius at 100% zoom. |
| `--shell-spatial-grid-edge` | `0.25px` | The spatial grid dot's antialiased edge. |
| `--shell-icon-size` | `16px` | The default Lucide glyph size. |
| `--shell-icon-stroke` | `1.5` | The stroke weight of every Lucide glyph inside the shell. |
| `--shell-icon-optical-folder-offset-y` | `0.5px` | Centers the Folder glyph's painted bounds in its slot. |
| `--shell-icon-optical-map-scale` | `1.111111` | Expands the Map glyph to the prominent painted extent. |
| `--shell-icon-optical-terminal-scale` | `1.111111` | Expands the Terminal glyph to the prominent painted extent. |
| `--shell-input-border` | `var(--maximal-color-border-strong, var(--maximal-color-border-default))` | The outline of a field. |
| `--shell-leading-base` | `1.5` | Line height for a paragraph. |
| `--shell-provider-anthropic-card-background` | `var(--maximal-color-bg-tertiary)` | The Anthropic model-card surface. |
| `--shell-provider-anthropic-card-border` | `var(--maximal-color-border-default)` | The Anthropic model-card outline. |
| `--shell-provider-deepseek-card-background` | `var(--maximal-color-bg-tertiary)` | The DeepSeek model-card surface. |
| `--shell-provider-deepseek-card-border` | `var(--maximal-color-border-default)` | The DeepSeek model-card outline. |
| `--shell-provider-github-card-background` | `var(--maximal-color-bg-tertiary)` | The GitHub model-card surface. |
| `--shell-provider-github-card-border` | `var(--maximal-color-border-default)` | The GitHub model-card outline. |
| `--shell-provider-google-card-background` | `var(--maximal-color-bg-tertiary)` | The Google model-card surface. |
| `--shell-provider-google-card-border` | `var(--maximal-color-border-default)` | The Google model-card outline. |
| `--shell-provider-grok-card-background` | `var(--maximal-color-bg-tertiary)` | The Grok model-card surface. |
| `--shell-provider-grok-card-border` | `var(--maximal-color-border-default)` | The Grok model-card outline. |
| `--shell-provider-meta-card-background` | `var(--maximal-color-bg-tertiary)` | The Meta model-card surface. |
| `--shell-provider-meta-card-border` | `var(--maximal-color-border-default)` | The Meta model-card outline. |
| `--shell-provider-mistral-card-background` | `var(--maximal-color-bg-tertiary)` | The Mistral model-card surface. |
| `--shell-provider-mistral-card-border` | `var(--maximal-color-border-default)` | The Mistral model-card outline. |
| `--shell-provider-openai-card-background` | `var(--maximal-color-bg-tertiary)` | The OpenAI model-card surface. |
| `--shell-provider-openai-card-border` | `var(--maximal-color-border-default)` | The OpenAI model-card outline. |
| `--shell-radius` | `4px` | A control corner. |
| `--shell-radius-dialog` | `4px` | A dialog corner. |
| `--shell-radius-large` | `4px` | A card corner. |
| `--shell-radius-pill` | `9999px` | A fully rounded control. |
| `--shell-row-height` | `32px` | A compact navigation, menu, or list row. |
| `--shell-tab-fade` | `12px` | The fade at the clipped edge of a crowded document tab. |
| `--shell-tab-max` | `384px` | The maximum document-tab width before a title is truncated. |
| `--shell-tab-min` | `72px` | The minimum document-tab width. |
| `--shell-space-1` | `4px` | The tightest gap. |
| `--shell-space-2` | `8px` | A gap inside a control. |
| `--shell-space-3` | `12px` | A gap between controls. |
| `--shell-space-4` | `16px` | Padding around a surface. |
| `--shell-space-5` | `24px` | A gap between sections. |
| `--shell-text-base` | `0.875rem` | Body text. |
| `--shell-text-lg` | `1.0625rem` | A section title. |
| `--shell-text-md` | `0.9375rem` | An emphasized label. |
| `--shell-text-sm` | `0.8125rem` | Secondary text. |
| `--shell-text-xl` | `1.375rem` | A surface title. |
| `--shell-text-xs` | `0.6875rem` | All-caps section labels and counts. |
| `--shell-tracking-caps` | `0.04em` | Tracking for an all-caps label. |
| `--shell-weight-lg` | `600` | A heading. |
| `--shell-weight-md` | `500` | A label that carries emphasis. |

Package rules and carried component rules inherit these names without inline
fallback values. `tests/shell-structural-tokens.test.ts` holds concrete values
to their reference token lineage, rejects a second value in package rules, and
rejects a structural token that nothing reads.

## Required

Define all twenty-three. `ShellLayout` applies the `.sb-shell` root class; define them
on that container or an ancestor. README.md carries the same table with the
description of what each one draws.

| Variable |
| --- |
| `--maximal-color-bg-default` |
| `--maximal-color-bg-brand` |
| `--maximal-color-bg-hover` |
| `--maximal-color-bg-pressed` |
| `--maximal-color-bg-secondary` |
| `--maximal-color-bg-selected` |
| `--maximal-color-bg-tertiary` |
| `--maximal-color-border-default` |
| `--maximal-color-border-brand` |
| `--maximal-color-icon-secondary` |
| `--maximal-color-icon-tertiary` |
| `--maximal-color-text-default` |
| `--maximal-color-text-brand` |
| `--maximal-color-text-onselected` |
| `--maximal-color-text-secondary` |
| `--maximal-color-text-tertiary` |
| `--shell-candy-background` |
| `--shell-candy-border` |
| `--shell-candy-icon-shadow` |
| `--shell-candy-shadow` |
| `--shell-candy-sheen` |
| `--shell-candy-text` |
| `--shell-duration-fast` |
| `--shell-ease-out` |

## Fallback

Each of these has a value in the CSS. Set one when the design system differs
from it. Twenty-two fall back to another variable rather than to a literal,
which is where legibility survives an unset value but meaning does not:
`--maximal-color-bg-danger` resolving to `--maximal-color-bg-hover` draws a destructive control that
looks exactly like an ordinary hovered one.

| Variable | Fallback | Drawn by |
| --- | --- | --- |
| `--maximal-color-bg-danger` | `--maximal-color-bg-hover` | destructive icon button, destructive `Button` fill, highlighted destructive menu item |
| `--maximal-color-bg-success` | `--maximal-color-bg-brand` | the marker on a green tab or tab group |
| `--maximal-color-bg-warning` | `--maximal-color-bg-brand` | the attention marker on a tab |
| `--maximal-color-border-danger` | `--maximal-color-border-brand` | the outline of a destructive control or of a field that failed validation |
| `--maximal-color-border-selected` | `--maximal-color-border-brand` | focus ring on every control |
| `--maximal-color-border-strong-hover` | `--maximal-color-border-brand` | the outline of a hovered button or field |
| `--maximal-color-border-strong` | `--maximal-color-border-default` | tooltip, dialog and menu outlines, hovered card border, scrollbar thumb |
| `--maximal-color-border-success` | `--maximal-color-border-brand` | the edge of a green tab marker |
| `--maximal-color-border-warning` | `--maximal-color-border-brand` | the edge of an attention tab marker |
| `--maximal-color-text-danger` | `--maximal-color-text-brand` | the message under a field that failed validation, destructive labels |
| `--maximal-color-text-onbrand` | `--maximal-color-text-default` | the `Switch` thumb, and the label on a primary `Button` |
| `--maximal-color-text-ondanger` | `--maximal-color-text-default` | the glyph or label on a destructive fill |
| `--maximal-color-text-success` | `--maximal-color-text-brand` | success text and markers |
| `--maximal-color-text-warning` | `--maximal-color-text-brand` | attention text and markers |
| `--shell-control-height` | `28px` | icon button box, field height |
| `--shell-disabled-opacity` | `0.5` | a disabled button, field, switch or choice |
| `--shell-elevation` | `none` | the shadow under a tooltip, a dialog and a menu popup |
| `--shell-font-mono` | `ui-monospace, SFMono-Regular, Menlo, monospace` | the value half of a `Field` |
| `--shell-font` | `400 14px/1.5 system-ui, sans-serif` | the shell's whole type |
| `--shell-nav-heading-height` | `24px` | the space a collapsed `NavRail` keeps for a section heading |
| `--shell-position` | `fixed` | how the `ShellLayout` root meets the window; `static` lays it out inside the consumer's own container instead |
| `--shell-radius-small` | `4px` | tab close affordance, tooltip, segmented control, menu item |
| `--shell-scrim` | `rgb(0 0 0 / 0.34)` | the layer a modal dims the window with |
| `--shell-spatial-canvas-background` | `--maximal-color-bg-secondary` | spatial canvas and project-browser surfaces |
| `--shell-spatial-grid-background-light` | `--maximal-color-bg-secondary` | the spatial canvas surface in light mode |
| `--shell-spatial-grid-dot-dark` | `--maximal-color-text-tertiary` | spatial grid dots in dark mode |
| `--shell-spatial-grid-dot-light` | `--maximal-color-text-tertiary` | spatial grid dots in light mode |
| `--shell-status-muted` | `--maximal-color-bg-pressed` | the `StatusChip`, `Banner` and `Callout` fills |
| `--shell-status` | `--maximal-color-text-secondary` | the status dot, the `StatusChip` label, the `Banner` text, the `Callout` outline; the `Callout` heading reads it too and falls back to `--maximal-color-text-default`, which is the legible one on a raised fill |
| `--shell-statusbar-height` | `24px` | the compact register `.statusbar` keeps as a minimum, not a fixed height |
| `--shell-tab-active` | `--maximal-color-bg-secondary` | the fill behind the selected tab |
| `--shell-terminal-background` | `--maximal-color-bg-secondary` | the terminal's own surface |
| `--shell-titlebar-height` | `40px` | the height of the title bar strip |

`--shell-status` and `--shell-status-muted` are the pair a host maps its own
states onto. Nothing here maps them: a `[data-status]` vocabulary is the
application's, and `StatusChip` passes the raw state straight through to the
attribute. A host that sets neither gets a legible chip in a neutral fill:
`--maximal-color-text-secondary` on `--maximal-color-bg-pressed` measures 5.14:1 in this repository's
dark palette and 5.39:1 in the light one, both above the 4.5:1 AA text
minimum. `--maximal-color-text-tertiary` carried this fallback before and measured
4.17:1 and 4.18:1: below the minimum in both, which is how three consumers
passed a status, got the neutral fill by leaving both unmapped, and shipped it
unread. `STORYBOOK_SHELL_MODE=package pnpm storybook:check` is what found
it, over the shipped stylesheet under a consumer's own palette; `npm run
check:contrast` checks this application's palette and never reads `--shell-*`
at all.

## Runtime

xterm.js takes literal colours at construction. wterm receives the same values
through its `--term-*` custom properties. `readTerminalTheme` resolves both
paths through `SHELL_TERMINAL_PROPERTIES`. A property that does not resolve is
left out rather than passed through empty, because terminal cores may parse an
unrecognised colour to black.

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

That exists because `shell-package-rules.css` is a hand-maintained copy of rules
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

Where a component needs geometry the ramp has no name for, it declares a token
for it in its own sheet, with a value, overridable at the root. That is the
third tier of the usual primitive, semantic and component split, and it is the
only way a literal gets into one of these files.

## The words a surface says

Not a variable, and named here because it is the other half of the same
question. Colour, spacing and radius come from the token contract above; copy
for reusable package-owned surfaces comes from `SHELL_CONTENT`, supplied
through `ShellContentProvider`. `LOREM_CONTENT` is the stub half, and
`tests/content-seam.test.ts` verifies that the live model-card surface reads
copy through that seam instead of fixing a product voice in the package.

## Overriding what the package draws

That paragraph said "overridable at the root" for some time before it was true.
Every rule this package ships is `.sb-shell .thing`. A consumer writing
`.sb-shell .thing` matches at the same specificity, so source order decides —
and a carried rule arrives by `document.head.append` during the first render,
after any stylesheet the consumer linked. Theirs lost every time, including the
declaration of a component's own geometry token, and a losing rule is not an
error.

So the package ships inside a cascade layer. An unlayered rule beats a layered
one whatever its specificity, which means a consumer's plain rule wins with no
`!important` and without this package having to police how many classes its
own selectors chain. Two layers, in this order:

| Layer | What is in it |
| --- | --- |
| `sb-shell.base` | `./renderer/styles.css` — the structural ramp and every shipped rule |
| `sb-shell.components` | the rules a component carries and injects when it first renders |

`@layer sb-shell.base, sb-shell.components;` is stated rather than left to
first appearance, because a carried stylesheet appears when its component first
renders and the order would otherwise depend on which surface a consumer
happened to open first. The statement is at the top of the shipped file and is
also injected ahead of the first carried sheet.

Anything a consumer writes outside a layer wins over both. To place the package
against layers of their own, name it in their own statement:
`@layer reset, sb-shell, app;`.

This is the mechanical end of a class of bug rather than a convenience.
`packages/maximal-client/src/renderer` declared `.inspector__title` against this package's
`.sb-shell .inspector__title`; ours is (0,2,0) and theirs is (0,1,0), so theirs
had never applied and their inspector rendered two eyebrows and no title. Atom
shipped the same failure in issue #13019 — a mechanical selector rewrite that
stayed syntactically faithful and silently lowered specificity. With layers the
colliding rule simply wins, which is what the consumer meant.

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

`@maximal/maximal-electron/verify/shell-variables` is pure and imports no
`electron`, so it runs under plain `node`. Point it at the stylesheet the
package ships and at whatever your application defines. Nothing is
hand-transcribed on either side, so the two cannot drift.

```js
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import {
  failedShellVariableChecks,
  shellVariableContract,
} from '@maximal/maximal-electron/verify/shell-variables';

const require = createRequire(import.meta.url);
const css = readFileSync(require.resolve('@maximal/maximal-electron/renderer/styles.css'), 'utf8');

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
the shape `@maximal/maximal-electron/verify` uses. `failedShellVariableChecks` names
the ones that did not hold.

Both start with floors: an empty stylesheet list, an empty derived contract, or
a contract with no required variable fails. A parser that stops matching would
otherwise report a complete contract over nothing.

## Why there is no defaults layer

A `:root { --maximal-color-text-default: … }` block would make an unset variable degrade
legibly. It was rejected, for three reasons.

**It would hide the drift this contract exists to surface.** An unpublished
variable that resolves to a default renders a plausible shell, which is the
failure mode of the last two years of this seam: never an error, only a slightly
wrong picture. Defaults and a drift check pull in opposite directions, and the
check is the thing a consumer cannot write for themselves.

**The variables where a default would help already have one.** All thirty-three
`fallback` entries above carry their value in the rule that reads them, next to
the property it sets, where it is visible to anyone reading that rule. A
separate layer would restate them, and the two would drift. The `required`
variables are the ones with no default — and most of them are a palette. A
default palette is what `shell-package-rules.css` deliberately does not ship;
`tests/package-styles.test.ts` asserts the file declares no token of its own for
exactly that reason.

**A default palette has to pass contrast, and this repository cannot yet check
that it does.** `CONTRAST_PAIRS` in `src/renderer/lib/contrast.ts` covers the
local fixture palette, not a consumer's, and it skips any pair whose
colours it cannot parse — so a defaulted `--maximal-color-text-default` on a defaulted
`--maximal-color-bg-default` would be checked by nothing that runs today. Issue #65 is
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

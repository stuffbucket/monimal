---
title: Publish the whole design contract, not a projection of it
status: proposal
date: 2026-09-01
---

# Publish the whole design contract, not a projection of it

## Problem

This package owns a complete design system and publishes 22% of it.

`REQUIRED_TOKENS` in `src/renderer/lib/contrast.ts` is the real contract: 68
tokens, checked by `checkPalette` and `tests/contrast.test.ts`. It covers
colour, spacing, radii, a type ramp, weights, control heights, elevation,
motion, focus-ring geometry, icon stroke, leading and tracking. It is coherent,
it is tested, and `docs/proposals/zed-themes.md` already assumes it as the
surface a designer would drive.

Fifteen of those 68 have a `--shell-*` counterpart in the stylesheet this
package ships. Fifty-three do not.

Everything downstream follows from that gap.

`controls.css` — 1,058 lines, the rules for every finished control — reads the
internal namespace, so it cannot ship: `tests/package-styles.test.ts` enforces
that a stylesheet reads one namespace or the other, never both. Five finished
settings components (`ApiKeysDialog`, `AppTogglesDialog`, `Diagnostics`,
`ModelCards`, `Usage`, plus `SettingsPage` and `CopyButton`) therefore cannot be
exported: exporting them makes that same test report 60 classes with no rule.

The consumer re-invents the difference. Measured in `packages/maximal/client`:

| | |
| --- | --- |
| hand-written CSS | 1,106 lines across 9 injected `<style>` blocks |
| classes it declares | 121 |
| classes that collide with ones this package ships | 6, including `.sb-shell` and `.nav` |
| `var(--shell-*, literal)` sites whose literal disagrees with the value actually in force | 29 |

The collisions are not theoretical. Both sides declare `.inspector__title`.
This package's rule is `.sb-shell .inspector__title` at specificity (0,2,0) and
means an 11px uppercase eyebrow; the client's is `.inspector__title` at (0,1,0)
and means a 16px heading. Probed on a live element in the running application,
that class computes to `11px`, `uppercase`, `rgb(106, 106, 106)`. The client's
rule has never applied. Its inspector renders two eyebrows and no title, and
nothing reports an error, because a losing rule is not an error.

This is the failure mode `docs/shell-variables.md` already names for the token
list — "never an error, only a slightly wrong picture" — reappearing one level
up, in the rules rather than the values.

## What the industry does

**VS Code publishes two registries, not one.** `colorRegistry.ts` holds colour
and is what a theme file may set. `sizeRegistry.ts` holds spacing, corner
radius, font size, font weight, stroke thickness and icon size, and is
deliberately **not** theme-overridable — a stylelint gate gives it teeth, and
`.github/skills/ux-css-layout/SKILL.md` states the ramp is engineering tooling
rather than a design surface. Both emit through the same runtime function
(`generateColorThemeCSS`) onto the same scoped root, `.monaco-workbench`.

The lesson is not "ship no defaults". It is that colour and structure are two
contracts with opposite rules, and both are published.

**A colour default is a formula, not a swatch.** `registerColor` accepts
defaults that reference another colour by id or transform one —
`transparent(editorSelectionBackground, 0.5)`, `lighten(toolbarHoverBackground,
0.1)`. A theme sets a small base and the rest resolves by derivation. Our 30
`fallback` tokens each carry an independent literal, so they cannot track a
consumer who changes the palette. That is the mechanism behind the 29 divergent
sites above.

**Atom shipped our exact bug, and named the rule that prevents it.** Atom
issue #13019: a mechanical selector rewrite stayed syntactically faithful and
silently lowered specificity, so a package's rule stopped outweighing core's and
both painted at once. That is `.inspector__title`, eight years earlier. The rule
it yields is that a contract built on **substituting values** cannot fail this
way, because its correctness does not depend on specificity, while a contract
built on **overriding selectors** always can. Atom issue #13555 adds the second
rule: a consumer's broken theme took the whole application down at boot, because
theme CSS was compiled synchronously with nothing catching the error.

Atom's contract also failed for a reason ours does not — `ui-variables.less` was
prose that "specifies the variables themes must implement", enforced by nothing.
`REQUIRED_TOKENS` and `tests/contrast.test.ts` are already better than that. What
we have instead is a *hand-maintained published projection* of an enforced
contract, which is a smaller version of the same disease.

**Eclipse Theia generates its namespace and exposes no selectors.** Theia is a
workbench packaged specifically for downstream products. `ColorRegistry` takes
typed `ColorDefinition`s and `toCssVariableName(id, prefix)` derives
`--theia-editor-background` mechanically; no one hand-maintains the list.
Downstream products rebrand through metadata, asset substitution, and DI
`rebind()` seams — never by writing CSS that competes with the shell's. Positron
layers whole new namespaces onto the same pipe without collision.

**A widget's stylesheet is imported by the widget.** `button.ts` begins
`import './button.css'`. The stylesheet travels in the module graph, so a widget
cannot be bundled without it. `monaco-editor` ships that same tree, plus a
concatenated `editor.main.css` that is generated at build time rather than
maintained.

Our `structural.css` is, in `tests/package-styles.test.ts`'s own words, "a
hand-maintained mirror". `mirroredRules()` exists because it drifts; its
`DELIBERATE` list carries six exemptions; the test's header records that 20
shared selectors had already drifted, including a primary button that did not
change colour on hover.

## This is the package's own rule, applied to CSS

`AGENTS.md` settles the same argument three times elsewhere. Fuse values live in
`scripts/package-contract.mjs` so a seventh fuse "is applied and checked from a
single edit rather than from a review convention". Icon file names live there too,
"so there is one list rather than two". `hoistedDependencies` derives from the
installed tree because a fourth hand-maintained edit is how a feature goes
missing from a build that passes its tests.

`structural.css` is the fourth case and the only one still hand-copied. Nothing
below is a new principle for this package.

## Decision

**1. Publish the contract in two namespaces with different rules.**

`--shell-*` colour tokens stay the consumer's, as today. Thirty-four of them.
This package ships no palette, and the three reasons in `docs/shell-variables.md`
are unchanged — all three are about colour, and none is affected by what
follows.

The other thirty-four are structural, and this package ships them with values:

    --control-sm/md/lg  --size-row/tabbar/titlebar  --nav-heading
    --space-1..5  --radius-card/chip/dialog/input/pill
    --text-xs/sm/base/md  --weight-base/md/lg  --leading-base  --tracking-caps
    --font-body  --font-mono  --icon-stroke  --opacity-disabled
    --elevation-dialog/popover  --focus-ring-width/offset
    --duration-fast  --ease-out  --tab-min/max

A consumer is not required to define any of them and is not expected to. They
exist so no component — ours or a consumer's — writes `font-size: 13px` again.
This is `sizeRegistry.ts`, and it is what makes `controls.css` publishable.

**2. A colour default is derived, not transcribed.** Where a `fallback` token
has a value, express it against a `required` token rather than as an independent
literal. A consumer who changes the palette then moves everything that depends
on it, and drift of the kind measured above stops being possible.

**3. A component carries the rules it draws itself with.** Not a sibling
`.css` file: `dist/` is built by `tsc`, which has no loader for one. The rules
live in the component's own source as a string and inject on first render —
`src/renderer/lib/component-styles.ts`.

This retires the mirror for everything that moves. `mirroredRules()`, the
`DELIBERATE` list and the partition test all exist to police a hand-copied
duplicate; a component with one source has nothing to police. Exporting a
component and shipping its styles become one act, which is the property that
was missing.

A string in a TypeScript file is somewhere nothing was watching for a literal,
so `tests/component-styles.test.ts` is the other half of the decision: no
colour, and no length beyond a hairline, `0` and `100%`. Geometry a component
owns and the ramp has no name for becomes a token that component declares.

**4. Class names stop being the consumer API.** The consumer's surface is
components, tokens, and slots. It is not selectors. Today a consumer can write
`.inspector__title` and land in the same cascade as ours, and whoever wins is
decided by specificity — which is how the client came to have two eyebrows and
no title.

Following Theia: if a consumer needs a selector or an `!important` to get the
result they want, the tokens are missing something and the answer is to add a
token, not to let them reach past. `docs/consuming.md` should say plainly that
the class names in the shipped stylesheet are an implementation detail, and the
structural tokens of decision 1 are what makes that a fair thing to say — a
consumer given a complete ramp has no reason to reach for a selector.

**5. The published stylesheet ships inside a cascade layer.** *(Shipped in
`fd01f21`, ahead of its stated sequencing. The blocker below was measured
rather than assumed: after the `.inspector__*` rename the client and the
package share no class name at all — `styledClassNames` over both reports one
overlap, `.sb-shell`, which is the root a consumer is meant to set tokens on.
Handing the client's rules the win at once turned out to be handing them
nothing.)* `@layer` makes
layer order beat specificity, so a consumer's rule wins over ours however many
classes ours chains — without `!important`, and without this package policing
its own selectors forever. Radix Themes had to retrofit exactly this after
shipping two-class selectors that outranked consumers' utilities.

It is also the mechanical end of the `.inspector__title` class of bug: with our
rules in an earlier layer, a colliding consumer rule simply wins instead of
losing silently. **Sequenced deliberately after decision 6** — adding it while
the client still carries 1,106 lines of unlayered CSS would hand every one of
those rules the win at once, including the ones that are wrong.

**6. A bad value degrades; it never crashes.** No consumer-supplied token may be
evaluated anywhere that can abort first paint. An unparseable or missing value
falls back and warns.

**7. Controls carry no content.** Fifty-seven user-facing strings sit in five
components here. A reusable control must take its content from its caller.
Placeholder and story data comes from a stub provider returning lorem ipsum, so
the seam sits between model and view rather than inside the view.

*(This paragraph said fifteen strings, and named `Inspector` as a published
component shipping one application's settings copy. `Inspector` is the
client's, not this package's — `InspectorPanel` is what is exported, and it
takes its children. The count was of one file rather than of the surfaces the
decision is about. Both corrected; the measurement is `Usage` 18, `ApiKeys` 15,
`Diagnostics` 10, `Apps` 10, `ModelCards` 6, plus `CopyButton`'s two.)*

**8. The styling surface is named slots, not class names.** Decision 4 says
class names stop being the API; this says what replaces them. React Aria, Base
UI and HeroUI converge on the same shape — a component declares a small,
documented set of named slots and state attributes, and a consumer styles
`classNames={{ header: … }}` or `[data-state="open"]`, never a nested chain.
Shoelace promises a shipped part survives until a major version.

This is what "purpose, taxonomy, interaction" means concretely: a consumer names
*the danger state of this control*, not the second div inside it. MUI's
retrospective on composed classes — 26 class combinations for one Chip, "bloat
the API without adding significant improvements" — is what the alternative costs.

## Consequences

The client deletes its 1,106 lines and composes. The five settings components
become exportable. The `.inspector__title` collision disappears with the rule
that caused it. `docs/consuming.md` and the README table describe a contract a
consumer can satisfy completely rather than one they must guess the remainder
of.

The cost is real: a build step for the stylesheet, a rename pass across
`controls.css` from the internal names to `--shell-*`, and a larger published
surface that this package is then bound to. The rename is the bulk of it — 66
rule blocks and roughly 551 lines for the settings components alone.

Two things get harder to change once shipped: the structural token names, and
the per-component CSS file layout. Both are the kind of thing a consumer pins,
so both should land in one release rather than accreting.

## Tracked work

Per `docs/proposals/README.md`, this proposal is not done until the issues exist
and are named here. They are not filed yet:

1. ~~Ship the 34 structural tokens~~ — done, `db9da26`.
2. ~~Re-express the `fallback` colour defaults as derivations of `required`
   tokens~~ — done, and largely already true when this was written. All
   fourteen colour fallbacks name another token; the twenty literals left are
   structural — spacing, radii, control heights, opacity, icon stroke, the two
   font stacks — which decision 1 says this package *should* ship with values.
   The measurement behind "30 independent literals" counted those.

   One real case was found and fixed: `--shell-input-border:
   var(--shell-border-strong, var(--shell-border, #2a2a2a))`, a transcribed
   swatch three levels down a chain, in the file added to end exactly this. It
   was also pointless — `--shell-border` is required, so a consumer defines it
   or nothing has a border. `tests/fallback-derivation.test.ts` now asserts the
   published stylesheet names no colour at all, and that a colour fallback is
   always a `var()`. `--shell-scrim` is the one named exemption, with its
   reason: derived from the palette it would be white on a light theme, which
   is not a dimmer page but a brighter one.
3. ~~Colocate the settings rules with their components~~ — done, `1ee7bca`.
   546 lines left `controls.css`. The remaining controls still read the
   internal namespace and `structural.css` still mirrors them; the mirror
   retires when the last one moves.
4. ~~Export the settings components with their styles~~ — done, `1ee7bca`.
5. ~~Lift embedded content out of the five components; add a lorem-ipsum stub
   provider for stories and placeholders~~ — done. `lib/content.ts` holds the
   catalogue, `ShellContentProvider` supplies it, and `lib/content-lorem.ts` is
   the stub, exported so a consumer can build against shape before wording
   exists. `USAGE_PERIODS`'s labels and `APP_STATUS_LABELS` moved there too:
   they were content in a module about arithmetic.

   Two checks, because neither reaches everything. `tests/content-seam.test.ts`
   renders each surface from the stub and fails on any English the stub cannot
   account for — the strong check, and blind to the two dialogs, which Radix
   portals into a document the test environment does not have.
   `eslint/shell.mjs`'s `content` rule reads source, so it sees all five, and
   it reports as the words are typed. Both were verified by putting a string
   back: the rule named the character, the render named the word.
6. Client: delete the hand-written CSS, compose the published controls, and
   remove the `.inspector__*` and `.nav` redeclarations. Measured after
   `1ee7bca`: 750 lines across nine injected blocks, five class names
   colliding with rules the package ships, and 56 of 158 `var(--shell-*)`
   sites naming a token the contract does not define — so those always paint
   their hardcoded fallback and ignore the theme.

# Quality standard

## Pull-request gates

The required CI workflow MUST enforce:

- strict TypeScript and lint checks;
- the reviewed public API report;
- exact package and subpath export coverage;
- statement, branch, function, and line coverage floors that MUST NOT be
  lowered;
- complete classification of every public runtime UI export;
- a Storybook entry for every standalone public component;
- more than one meaningful state for every standalone component;
- generated-token and down-only inventory checks;
- source policies against invented DOM-like props, literal colors, literal
  spatial dimensions, literal stacking levels, literal motion durations, and
  `!important`;
- every design-system-owned story in the light and dark themes;
- successful story rendering and play functions;
- generated token stylesheet loading;
- zero browser console errors and uncaught page errors;
- a completed Axe scan for every story execution;
- zero Axe violations;
- zero unresolved Axe incomplete results;
- an unobscured visible indicator on the first applicable keyboard focus
  target.
- deterministic reflow, viewport-equivalent 200% zoom, forced-colors,
  reduced-motion, and text-spacing acceptance profiles.

The browser report MUST record the policy, story count, execution count,
failures, Axe details, focus result, browser errors, and theme for every
execution.

An Axe incomplete result for an `aria-controls` reference MAY be resolved only
when the harness proves that every referenced ID exists in the rendered
document. The report MUST retain the resolved result for review.

An Axe incomplete color-contrast result MAY be resolved only when the harness
calculates the effective foreground and background colors without image layers
and proves that the applicable WCAG contrast ratio passes. Results attributed
to overlap MUST also have no intersecting sibling geometry. Results attributed
to clipping MUST also prove that an overflow ancestor clips the target.

## Accessibility acceptance

Automated checks MUST target WCAG 2.2 Level AA rules and applicable Axe best
practices. A passing automated check MUST NOT be represented as WCAG
conformance.

Before a component is classified as stable, its acceptance evidence MUST
cover every applicable WCAG 2.2 Level A and AA success criterion.

Interactive components MUST be operable with the keyboard. Acceptance MUST
verify:

- forward and reverse tab order;
- Enter and Space activation where applicable;
- arrow-key behavior for composite widgets;
- Escape and dismissal behavior;
- modal focus containment and restoration;
- no keyboard trap;
- no focus loss to the document body after a state transition;
- an unobscured focus indicator with at least 3:1 contrast;
- a 24 by 24 CSS pixel target or a documented WCAG target-spacing exception.

Acceptance MUST test reflow at 320 CSS pixels, text spacing, 200% zoom, forced
colors, reduced motion, and both supported themes.

The automated `zoom-200-equivalent` profile MUST use a 640 CSS pixel viewport
as the deterministic layout equivalent of 200% zoom at a 1280 CSS pixel
baseline. It MUST NOT be described as browser UI zoom.

The forced-colors profile MUST disable Axe's `color-contrast` rule because
axe-core combines authored foreground colors with forced system backgrounds
([axe-core#3978](https://github.com/dequelabs/axe-core/issues/3978)). The
default light and dark gates MUST continue to run that rule. Forced-colors
focus evidence MUST composite translucent system indicator colors and still
prove at least 3:1 contrast.

Stable releases MUST verify representative complex widgets with NVDA and
Firefox or Chrome on Windows and VoiceOver with Safari on macOS. Blocker or
critical task failures MUST prevent release.

## Interaction evidence

Every interactive standalone component MUST own at least one Storybook play
function that performs a real user interaction and asserts the resulting
focus, state, value, or rendered surface through an accessible query.

Disabled, loading, invalid, empty, open, closed, selected, and overflow states
MUST have separate stories when the component API supports them.

Before a component is classified as stable, public runtime code MUST maintain
at least 90% statement, line, and function coverage and at least 85% branch
coverage. Focus management, state machines, accessibility utilities, and token
transforms MUST maintain at least 95% branch coverage.

Critical policy and browser-quality decision logic MUST maintain a 100%
mutation score in its explicitly reviewed mutation scope.

## Visual evidence

Every stable component state MUST receive human visual review in both themes.
Review MUST include the minimum supported viewport, forced colors, reduced
motion, 200% zoom, and long or localized content.

Screenshot comparison MAY become a required gate only when its operating
system, browser revision, fonts, animation state, time, and data are
deterministic. A screenshot threshold MUST NOT automatically accept an
unreviewed visual change.

## Browser support

MDS MUST support the Chromium engine bundled by the desktop application. CI
MUST use the Playwright Chromium revision pinned by the lockfile.

The package MUST NOT claim general web or Safari support until required CI
runs the blocking suite in Chromium, Firefox, and WebKit and release testing
also covers real Safari. Playwright WebKit MUST NOT be described as Safari.

## Public API and distribution

Every public TypeScript signature change MUST update the reviewed API report
in the same change. Breaking changes MUST include migration guidance before a
published stable release.

Tokens, CSS custom properties, documented selectors, and package subpaths MUST
be treated as public API.

Bundle-size and tree-shaking budgets MUST be added before the package publishes
a JavaScript distribution artifact. Budgets MUST measure the packed artifact
through representative consumer imports and MUST externalize React.

## Exceptions

Every exception to this standard MUST name an owner, rationale, tracking issue,
and expiry date. CI suppressions without all four fields MUST NOT be accepted.

# Storybook

Storybook MUST render the reusable renderer exports without a product
application.

`.storybook/preview.ts` MUST install the package stylesheet, consumer palette,
content provider, and providers required by exported components.

`.storybook/consumer.css` MUST remain the worked example of the public
`--shell-*` variable contract.

Stories MUST use deterministic fixtures owned beside the package they exercise.

Every exported component that owns rendered UI MUST have a story or an explicit
non-visual classification in the Storybook checks.

`pnpm storybook:check` MUST inspect real computed layout and accessibility in
a browser.

The required CI gate MUST run every design-system-owned story in Chromium
against the light and dark themes.

Required CI MUST also run the `reflow-320`, `zoom-200-equivalent`,
`forced-colors`, `reduced-motion`, and `text-spacing` acceptance profiles.
`zoom-200-equivalent` is a deterministic viewport-equivalence check rather than
literal browser UI zoom.

The forced-colors profile MUST use only the reviewed profile-specific Axe
exceptions in `quality.config.json`. Its `color-contrast` exception addresses
[axe-core#3978](https://github.com/dequelabs/axe-core/issues/3978); default
light and dark executions MUST continue to enforce Axe color contrast.

Every gated story execution MUST:

- render and complete its play function without an exception;
- load the generated design tokens;
- produce no browser console or uncaught page errors;
- complete an Axe scan;
- produce zero Axe violations;
- produce zero unresolved Axe results requiring manual review;
- expose an unobscured visible focus indicator when keyboard focus is
  applicable.

The component-scoped Axe configuration MAY disable only document-level rules
whose required landmarks or repeated-block navigation belong to the consuming
page rather than an isolated component.

The browser gate MAY resolve an Axe `aria-controls` incomplete result only
after proving that every referenced ID exists. Resolved results MUST remain in
the machine-readable report.

The browser gate MAY resolve an Axe color-contrast incomplete result only after
calculating the effective colors without image layers and proving the
applicable WCAG contrast ratio. An overlap result also requires proof that no
sibling intersects the text geometry; an obscuration result also requires
proof that an overflow ancestor clips the target.

The browser gate MUST enforce WCAG 2.2 Level AA. Automated results MUST NOT be
described as complete WCAG conformance; component acceptance MUST also review
keyboard operation, visible focus, zoom and reflow, forced colors, reduced
motion, screen-reader naming, and state announcements.

`quality.config.json` MUST own the machine-enforced thresholds, theme matrix,
acceptance-profile matrix, viewport, story ownership boundary, and
source-policy switches.

Portable browser-quality logic and its adversarial tests MUST live in
`@maximal/maximal-design-system-tools`; this package MUST own only the catalog,
configuration, reviewed baseline, and commands.

Development servers MUST register their branch, worktree, commit, port, and
process identity through `scripts/storybook-server.mjs`.

Screenshots MAY support diagnosis but MUST NOT be the only oracle.

Stories and Storybook fixtures MUST remain unreachable from every package
export; `npm run verify:exports` MUST enforce that boundary.

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

Development servers MUST register their branch, worktree, commit, port, and
process identity through `scripts/storybook-server.mjs`.

Screenshots MAY support diagnosis but MUST NOT be the only oracle.

Stories and Storybook fixtures MUST remain unreachable from every package
export; `npm run verify:exports` MUST enforce that boundary.

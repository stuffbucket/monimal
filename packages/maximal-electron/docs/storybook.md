# Storybook

Storybook MUST render the reusable renderer exports without a product
application.

`.storybook/preview.tsx` MUST install the package stylesheet, consumer palette,
content provider, and providers required by exported components.

`.storybook/consumer.css` MUST remain the worked example of the public
`--shell-*` variable contract.

Stories MUST use deterministic fixtures from `.storybook/sample-settings.ts`.

Every exported component that owns rendered UI MUST have a story or an explicit
non-visual classification in the Storybook checks.

`npm run storybook:check` MUST inspect real computed layout and accessibility in
a browser.

Screenshots MAY support diagnosis but MUST NOT be the only oracle.

Stories and Storybook fixtures MUST remain unreachable from every package
export; `npm run verify:exports` MUST enforce that boundary.

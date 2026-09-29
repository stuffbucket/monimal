# Testing

## Unit and component tests

Package tests MUST run through the workspace test runner from the repository
root.

Tests MUST establish their own state and MUST pass in randomized order.

Host tests MUST cover lifecycle sequencing, hardened window defaults, safe
navigation, shutdown, and terminal ownership.

Renderer tests MUST cover exported component behavior and contracts without
mounting a product application.

## Terminal tests

Electron-free terminal behavior MUST be tested in
`@maximal/maximal-terminal`.

Electron ownership, native adapter behavior, and renderer integration MUST be
tested in this package.

Packaged native-terminal behavior MUST be tested by `apps/desktop`, which owns
the artifact.

## Mutation testing

The mutation threshold MUST remain 100.

Every eligible source module MUST be either in the mutation configuration or
in the deferred map with its tracking issue.

Mutation scope checks MUST fail when they inspect no files.

## Browser rendering

Shared component rendering and accessibility MUST be checked through Storybook.

Layout assertions MUST inspect computed layout in a real browser.

Screenshots MUST NOT be the only oracle.

Product composition, terminal split geometry, terminal theme resolution, and
packaged Electron behavior MUST be tested in `apps/desktop/e2e`.

## Validation

Changes to this package MUST run build, typecheck, lint, unit tests, export
verification, neutrality verification, documentation verification, and the
applicable Storybook checks.

Changes to exported behavior consumed by the desktop MUST also run the
corresponding desktop tests.

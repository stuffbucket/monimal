# Continuous integration

The monorepo root workflow MUST own blocking CI for this package.

Package validation MUST include build, typecheck, lint, unit tests, mutation
scope, documentation claims, export integrity, renderer neutrality, contrast,
and applicable Storybook browser checks.

The package MUST NOT define a packaging matrix, packaged-application smoke
test, application end-to-end job, signing job, or release job.

Application packaging and packaged Electron tests MUST run under
`apps/desktop`.

Workflow dependencies MUST use full commit SHAs and runners MUST comply with
the repository workflow policy.

Every check MUST fail when its scope is empty.

# monimal

A spike combining the Maximal CLI, engine, Electron packages, client, and Astro
site in one pnpm workspace driven by Turborepo. The packages were copied from
separate repositories and are now edited here; [SOURCES.md](SOURCES.md) records
the copied commits, workspace rules, and deliberate deviations.

Nothing here publishes, and this repository is not a release home of record.

## Layout

```text
packages/eslint-config       @stuffbucket/eslint-config      shared ESLint config
packages/maximal             @stuffbucket/maximal            CLI + packaging wrapper
packages/maximal-core        @stuffbucket/maximal-core       engine
packages/maximal-electron    @stuffbucket/maximal-electron   Electron shell / UI library
packages/maximal/client      maximal-client                  Electron app
packages/maximal/site        maximal-site                    Astro marketing + guide site
```

## Commands

```sh
pnpm install
pnpm run build        # turbo run build
pnpm run typecheck
pnpm run lint
pnpm run test         # serialized workspace tests
pnpm run check        # parallel build/typecheck/lint, then serialized tests
pnpm run package      # package maximal-client with Electron Forge
```

The pnpm version comes from root `package.json#packageManager`; Node and Bun come
from `.nvmrc` and `.bun-version`. Bun remains where package scripts genuinely use
its compiler or test runner. Astro installs with the rest of the pnpm workspace
and builds under Node.

## Turborepo

Turbo models the real workspace graph:

```text
@stuffbucket/maximal-core ─┬─> maximal-client
@stuffbucket/maximal-electron ┘

@stuffbucket/maximal-core ───> @stuffbucket/maximal
@stuffbucket/eslint-config ──> the five linted code packages
maximal-site ────────────────> packages/maximal/docs/guide (file input)
```

The site reads Markdown from `packages/maximal/docs/guide`, so its build task
hashes that path explicitly even though the site is a nested workspace package.
Lint hashes follow a synthetic topology task, which propagates shared-config and
plugin-resolution changes without serializing lint execution.

Most build, typecheck, lint, and test results are locally cacheable. The client
sidecar build is deliberately uncached because it embeds `git rev-parse HEAD`, a
value no file-input hash can represent. Tests are serialized because the Bun
suites bind ports and install signal handlers.

## What the workspace buys

Workspace links replace stale upstream git pins:

- `@stuffbucket/maximal` consumes the current workspace copy of
  `@stuffbucket/maximal-core`.
- `maximal-client` consumes both the workspace core and
  `@stuffbucket/maximal-electron`.
- The dependency key `stuffbucket-electron` is bridged to the scoped package with
  `workspace:@stuffbucket/maximal-electron@*`.

That means the CLI, desktop client, tests, and packaged sidecar are checked
against the code in this checkout rather than independent historical snapshots.

## Packaging

```sh
pnpm run package
```

The command builds the dependency graph, compiles the core into the client
sidecar, bundles the renderer against the workspace Electron library, and asks
Electron Forge to create the app directory. CI separately asserts that the
package contains a nonempty `app.asar` and sidecar.

Electron Forge and Rolldown require selected dependencies to be visible from the
root while package-local `node_modules` must remain intact. The authoritative
hoist configuration and its constraints are in
[`pnpm-workspace.yaml`](pnpm-workspace.yaml); `verify:workspace` checks the
installed result rather than trusting that pnpm accepted the setting.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) has two Ubuntu jobs:

1. **check** — frozen install, workspace verification, the root `check` gate,
   package-mechanics checks, and sidecar provenance;
2. **electron package** — frozen install, workspace verification, Forge
   packaging, and packaged-content assertions.

Both jobs restore Turbo's local cache. Cacheable dependency builds may replay;
the sidecar recompiles because its task is uncached. Actions are SHA-pinned and
tool versions come from the same repository files used locally.

The workflows under `packages/*/.github` are copied upstream fixtures. GitHub
does not execute them here, but package tests assert against them, so they must
remain present.

## Standing hazards

- A non-frozen dependency resolution records rotating `ms-feed-N` tarball
  hosts, and pnpm rejects the lockfile on the *next* install with
  `ERR_PNPM_TARBALL_URL_MISMATCH`. Strip them before installing, never after.
  The registry's SHA-1 pins are kept as served: the proxy is the supply-chain
  control, so the hash only detects transit corruption. Owned by
  [SOURCES.md](SOURCES.md#lockfile-integrity).
- `publicHoistPattern` necessarily makes undeclared dependencies easier to hide.
  `verify:workspace` covers the known linker and native-module requirements; it
  is not proof that every package declaration is complete.
- `packages/maximal/site` reads guide content outside its package directory.
  Keep the corresponding external Turbo input when changing its content loader.
- Vendored `.github` directories are test fixtures, not disposable workflow
  copies.

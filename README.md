# monimal

A spike combining the Maximal CLI, engine, Electron packages, client, and Astro
site in one pnpm workspace driven by Turborepo. The product packages were copied
from separate repositories and are now edited here; shared tooling and runtime
adapters are owned here. [SOURCES.md](SOURCES.md) records the copied commits,
workspace rules, and deliberate deviations.

This repository publishes signed, notarized macOS DMGs to GitHub Releases;
[RELEASING.md](RELEASING.md) owns that process. It does not publish the update
manifest served at mxml.sh, which lives in `stuffbucket/maximal`.

## Layout

```text
packages/anthropic-provider  @stuffbucket/anthropic-provider external stock DSH adapter
packages/eslint-config       @stuffbucket/eslint-config       shared ESLint config
packages/llama-server        @stuffbucket/llama-server        llama.cpp HTTP adapter scaffold
packages/maximal             @stuffbucket/maximal             CLI + runtime composition
packages/maximal-core        @stuffbucket/maximal-core        engine
packages/maximal-dsh-host    @stuffbucket/maximal-dsh-host    generic external DSH host
packages/maximal-electron    @stuffbucket/maximal-electron    Electron shell / UI library
packages/maximal-provider-contract @stuffbucket/maximal-provider-contract provider gateway contract
packages/maximal/client      maximal-client                   Electron app
packages/maximal/site        maximal-site                     Astro marketing + guide site
packages/omlx                @stuffbucket/omlx                 external stock DSH oMLX adapter
```

## Commands

```sh
pnpm install
pnpm run build        # turbo run build
pnpm run typecheck
pnpm run lint
pnpm run test         # mountless Docker workspace tests
pnpm run check:core   # Core host checks, then focused mountless Core tests
pnpm run check        # workspace static + Core host checks, then one Docker graph
pnpm run package      # package maximal-client with Electron Forge
```

The pnpm version comes from root `package.json#packageManager`; Node and Bun come
from `.nvmrc` and `.bun-version`. Bun remains where package scripts genuinely use
its compiler or test runner. Astro installs with the rest of the pnpm workspace
and builds under Node. Tests run through the root mountless Docker boundary; see
[`docs/testing-in-docker.md`](docs/testing-in-docker.md) for its closed focused
suite selectors.

## Turborepo

Turbo models the real workspace graph:

```text
@stuffbucket/maximal-core ─┬─> maximal-client
@stuffbucket/maximal-electron ┘

@stuffbucket/maximal-provider-contract ─┬─> @stuffbucket/maximal-core
                                       └─> @stuffbucket/maximal-dsh-host
@stuffbucket/maximal-core ───────────────┐
@stuffbucket/maximal-dsh-host ───────────┼─> @stuffbucket/maximal
@stuffbucket/maximal-provider-contract ──┘
@stuffbucket/eslint-config ──────────────> linted code packages
maximal-site ────────────────────────────> packages/maximal/docs/guide (file input)
```

Concrete Anthropic and oMLX adapters are not Maximal dependencies. They are
stock Cordis/DSH plugins installed separately in a trusted external provider
profile and loaded through the generic host only when DSH mode is selected.

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

[`.github/workflows/release.yml`](.github/workflows/release.yml) is separate: a
tag creates a draft release, dispatches the private builder that holds the Apple
credentials, and waits for the signed DMG. It never publishes. Owned by
[RELEASING.md](RELEASING.md).

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
- The root `.macos-builder/` is the live release producer; the vendored
  `packages/maximal/.macos-builder/` is a fixture for a different layout and is
  never executed. Owned by [RELEASING.md](RELEASING.md).

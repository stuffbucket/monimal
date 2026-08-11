# monimal

A **spike**: `maximal`, `maximal-core` and `maximal-electron` in one Bun
workspace, driven by Turborepo. The three source repos stay canonical — see
[SOURCES.md](SOURCES.md) for exactly what was copied, from which commit, and
every deviation.

Nothing here publishes. Nothing here is a home of record.

## Layout

```
packages/maximal            @stuffbucket/maximal           the proxy + CLI
packages/maximal-core       @stuffbucket/maximal-core      headless engine
packages/maximal-electron   @stuffbucket/maximal-electron  Electron shell / UI library
```

The parked Tauri shell is not here.

## Commands

```sh
bun install
bun run build        # turbo run build
bun run typecheck    # turbo run typecheck
bun run test         # turbo run test --concurrency=1
bun run check        # build + typecheck, then test
```

`test` is pinned to `--concurrency=1` deliberately. See below.

## Status

| | build | typecheck | test |
| --- | --- | --- | --- |
| `maximal` | pass | pass | 1625 pass, 0 fail (148 files) |
| `maximal-core` | pass | pass | 1766 pass, 0 fail (144 files) |
| `maximal-electron` | pass | pass | 59 files pass |

Turbo caching works: a warm `build typecheck` is 6/6 cached in ~37ms.

`maximal-core`'s 1766 passing tests match its upstream count exactly.
`maximal`'s count is lower than upstream's 1752 because 14 Tauri-coupled test
files were removed with the shell.

## What the spike found

Four things surfaced that are worth acting on regardless of whether this
monorepo survives.

**1. `maximal-electron` has a phantom dependency.** It imports `typebox` in
`src/main/native/agent.ts` and `src/main/native/toolsets.ts` but never declares
it. npm's flat `node_modules` supplied it transitively via
`@earendil-works/pi-agent-core`. Under a stricter layout it simply is not there,
and typecheck fails. **This is a real bug in that repo**, not an artifact of
copying — a consumer installing the package today can hit it.

**2. One lockfile means every dependency floats.** A workspace has a single root
lockfile, so the per-package `bun.lock` files stop applying and everything
re-resolves to the newest semver-compatible version. That is not theoretical: it
moved `@hono/zod-openapi` from 1.5.0 to 1.5.2, whose changed type inference
broke `tests/setup-status-openapi.test.ts` in **both** `maximal` and
`maximal-core` — two packages that typecheck clean upstream. Pinning to `1.5.0`
fixed it. Any real merge needs a deliberate pinning pass, not a hopeful install.

**3. `maximal` and `maximal-core` are near-identical.** Their bundles are 632
modules / 7.36 MB and 629 modules / 7.38 MB, and both carry the same
`setup-status-openapi` test that broke in the same way. This is the duplication
`docs/maximal-core-integration.md` calls out as needing excavation, now visible
as a measurement rather than a claim.

**4. Nothing here depends on anything else here.** None of the three packages
declares a dependency on another, so `node_modules/@stuffbucket/` is empty and
Turbo's `^build` ordering has no edges to order. The git-dep that motivated a
monorepo (`"@stuffbucket/maximal-core": "github:...#v0.2.0"`, pinned four minors
behind core's 0.6.3) lives in `client/` and `shell/` — neither of which is here.

That last point is the honest headline: **as assembled, this is three
independent packages sharing an install, not an integrated monorepo.** It proves
the three can coexist, build, typecheck and test under one Bun workspace with
Turborepo. It does not yet prove the thing the integration doc actually worries
about, because the consumer that would exercise the seam was left out.

## Two operational notes

**Tests are serialized.** `maximal` and `maximal-core` are near-duplicates that
both bind ports and install signal handlers. Run concurrently under Turbo they
interfere — `maximal-core` picked up spurious `process.exit`/SIGINT failures that
vanish when run alone. Hence `--concurrency=1`. Real isolation would need port
randomization in the suites.

**Tests depend on repo state.** `getGitVersion` and the diagnostics
`source_revision` test read git HEAD, so they fail in a repo with no commits.
They pass once there is one.

## Divergence to watch

`~/github/stuffbucket/maximal-electron` **has migrated to pnpm** — committed as
`b6d9de1` ("build: migrate from npm to pnpm") on branch `release/0.0.9`, adding
`"packageManager": "pnpm@10.20.0"` and a `pnpm.onlyBuiltDependencies` list for
`electron`, `node-pty`, `node-llama-cpp`, `esbuild`, `@google/genai` and
`protobufjs`.

This workspace uses Bun, and the copy here predates that migration
(`86e210a`, `main`). So the package-manager question is now live rather than
hypothetical: the one package with native build steps has picked pnpm, and that
`onlyBuiltDependencies` list is precisely the native-module surface a Bun
workspace would have to handle differently. Settle this before building further
on this spike.

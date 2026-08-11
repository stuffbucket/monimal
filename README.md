# monimal

A **spike**: `maximal`, `maximal-core`, `maximal-electron` and the Astro site in
one pnpm workspace, driven by Turborepo. The source repos stay canonical — see
[SOURCES.md](SOURCES.md) for what was copied, from which commit, and every
deviation.

Nothing here publishes. Nothing here is a home of record.

## Layout

```
packages/maximal            @stuffbucket/maximal           CLI + packaging wrapper
packages/maximal-core       @stuffbucket/maximal-core      the engine
packages/maximal-electron   @stuffbucket/maximal-electron  Electron shell / UI library
packages/site               maximal-site                   Astro marketing + guide site
```

All four are synced from `main`.

## Commands

```sh
pnpm install
pnpm run build        # turbo run build
pnpm run typecheck
pnpm run lint
pnpm run test         # turbo run test --concurrency=1
pnpm run check        # build + typecheck, then test

pnpm run sync         # git archive main -> packages/*, then re-apply deviations
pnpm run deviations   # re-apply local edits (idempotent)
pnpm run check:float  # dependencies resolving differently than upstream
```

**A sync must be followed by `pnpm install`** — syncing replaces the package
directories, which removes their `node_modules`.

pnpm 10.20 manages dependencies. `bun` remains the bundler and test runner in
`maximal` and `maximal-core`; `vitest` in `maximal-electron`; `astro` in `site`.

## Status

| | build | typecheck | lint | test |
| --- | --- | --- | --- | --- |
| `maximal` | pass | pass | pass | 75 pass, 0 fail |
| `maximal-core` | pass | pass | pass | 1766 pass, 0 fail |
| `maximal-electron` | pass | pass | pass | 59 files pass |
| `site` | pass | — | — | pass |

## What upstream did while this spike was being built

Between 2026-08-03 and 2026-08-11, `maximal`'s `main` absorbed the work this
spike had been measuring:

- **`chore: retire the Tauri shell and excavate the duplicated core` (#442)** —
  `maximal/src` is **gone**. The package now builds, runs and starts directly out
  of `node_modules/@stuffbucket/maximal-core/src`. The 4,235-line divergence this
  repo previously reported no longer exists; it was excavated at the source.
- **`feat(client): ship usable Electron desktop MVP` (#440)**, on top of
  `feat(client): Electron client consuming maximal-core + stuffbucket/electron`
  (#419) — there is now a real Electron Forge app at `packages/maximal/client`,
  with vite configs, vitest and Playwright e2e.

So `maximal` is a thin CLI and packaging wrapper, and the Electron client already
exists. Earlier revisions of this README described the pre-excavation repo.

## Turborepo

Caching is real and the numbers are good — cold vs warm, whole workspace:

| task | cold | warm |
| --- | --- | --- |
| `build` | ~2.2s | ~17ms |
| `typecheck` | ~4.7s | ~16ms |
| `lint` | ~3.7s | ~16ms |
| `test` | ~53s | ~22ms |

Cache scoping is correct: editing one file rebuilds only the packages downstream
of it. Task `inputs` exclude `research_log/`, `.claude/`, `.github/` and
`reports/`, so churn there no longer busts a cache.

There is now a genuine dependency chain, which earlier revisions of this repo
did not have:

```
@stuffbucket/maximal-core#build  ->  @stuffbucket/maximal#build  ->  maximal-site#build
```

`maximal-electron#build` still stands alone — nothing in the workspace consumes
it yet. That is the next thing to change.

## What the workspace is actually buying

Two stale pins upstream, which a workspace link closes:

| consumer | pins | actual | gap |
| --- | --- | --- | --- |
| `maximal` | `maximal-core#v0.1.1` | 0.6.3 | five minors |
| `maximal/client` | `maximal-electron#2f1a06c` | 0.0.9 | **50 commits** |

The first is closed here: `apply-deviations.mjs` rewrites it to `workspace:*`,
and because `maximal`'s build/dev/start all run out of
`node_modules/@stuffbucket/maximal-core/src`, that link is load-bearing — this
really does build the published CLI against current core, and it passes.

The second is **not** closed yet, because `packages/maximal/client` is not a
workspace package. Closing it is the obvious next step.

One obstacle worth knowing before starting: the client declares the dependency
as `"stuffbucket-electron": "github:stuffbucket/maximal-electron#..."`, but the
package's actual name is `@stuffbucket/maximal-electron`. A git dependency
tolerates that mismatch; a `workspace:*` link does not.

## Standing hazards

**Dependency float.** One root lockfile means per-package lockfiles stop
applying and everything re-resolves to the newest semver-compatible version.
This has broken the build three times — `@hono/zod-openapi` twice (a changed
inferred type failed typecheck) and `prettier` once (changed union formatting
produced 20 lint errors in untouched files). Only those two are pinned.
`pnpm run check:float` reports the rest; treat every transitive tool version as
floating until pinned.

**Tests are serialized.** `--concurrency=1`, because `maximal` and
`maximal-core` both bind ports and install signal handlers.

**`.github/` is load-bearing.** It looks like dead weight since those workflows
cannot run here, but deleting it dropped 69 passing tests — `maximal-electron`
asserts against those files.

**The linker is unresolved.** `maximal-electron` sets `node-linker=hoisted` for
Electron Forge's native prebuilds; `maximal-core`'s build refuses to run without
a package-local `node_modules`, which hoisting empties. `node-linker` is a
workspace-root setting, so only one can win. This workspace uses pnpm's default
isolated linker, which suits `tsc`/`bun test`/`vitest` but means
`electron-forge package` is not expected to work from here. **This will matter
as soon as the client is wired in.**

**maximal <-> site is a cycle.** `site` depends on `maximal` for `docs/guide`;
`maximal`'s release script and three tests import the site's updates-manifest
library. The second direction has to stay a relative path (`../../site/...`),
because a package dependency both ways is a cycle Turborepo rejects.

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
| `maximal-client` | pass | pass | pass | 54 pass, 0 fail |
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
maximal-core   ─┬─>  maximal-client        (the Electron app)
maximal-electron┘

maximal-core   ──>  maximal  ──>  maximal-site
```

Both libraries feed the client, which is the only thing here that consumes
both.

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

**Both are now closed.** `packages/maximal/client` is a workspace package, and
the client typechecks, lints and passes its 54 tests against a maximal-electron
50 commits newer than its pin — with no source changes. That is the single most
useful thing this workspace has demonstrated.

The name mismatch (`stuffbucket-electron` vs the real
`@stuffbucket/maximal-electron`) is bridged with pnpm's aliased workspace
protocol, `workspace:@stuffbucket/maximal-electron@*`.

## Packaging

`electron-forge package` does **not** yet succeed from this workspace. Two
distinct causes, one solved:

**1. Forge gates on the linker (solved).** It refuses to run under pnpm unless
`node-linker=hoisted` or a hoist pattern is defined. Hoisting outright breaks
maximal-core's build, so `.npmrc` defines `public-hoist-pattern` entries for
electron and node-pty instead. Forge's check passes, and main and preload build.

**2. Renderer bundling still fails (open).** Rolldown cannot resolve Radix's
transitive imports. The first layer was a genuine workspace-link artifact:
maximal-electron ships **no runtime dependencies** — React and Radix are
devDependencies plus optional peers — so a published install brings only `dist/`
and the consumer supplies them, while a `workspace:*` link symlinks the whole
source tree *including its devDependency `node_modules`*, which the bundler then
walks into. A `resolve.dedupe` in the client's renderer config stops that. The
failure then moves to the client's own Radix copies, where Rolldown still cannot
follow a symlinked package's transitive deps under pnpm's isolated layout.

So: **linking these packages for typecheck, lint and test works and is
valuable; producing a shippable app from this workspace is unsolved.** The
options are a Vite resolution fix, packaging the client outside the workspace,
or relaxing maximal-core's build guard so `node-linker=hoisted` becomes
available.

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

**The linker conflict is real, and now measured** — see "Packaging" above. It no
longer blocks typecheck, lint or test; it blocks producing an app bundle.

**maximal <-> site is a cycle.** `site` depends on `maximal` for `docs/guide`;
`maximal`'s release script and three tests import the site's updates-manifest
library. The second direction has to stay a relative path (`../../site/...`),
because a package dependency both ways is a cycle Turborepo rejects.

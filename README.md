# monimal

A **spike**: `maximal`, `maximal-core` and `maximal-electron` in one pnpm
workspace, driven by Turborepo. The three source repos stay canonical — see
[SOURCES.md](SOURCES.md) for exactly what was copied, from which commit, and
every deviation.

Nothing here publishes. Nothing here is a home of record.

## Layout

```
packages/maximal            @stuffbucket/maximal           the proxy + CLI
packages/maximal-core       @stuffbucket/maximal-core      headless engine
packages/maximal-electron   @stuffbucket/maximal-electron  Electron shell / UI library
packages/site               maximal-site                   Astro marketing + guide site
```

The parked Tauri shell is not here. `site` was nested inside `maximal` upstream
and is a separate package here so the two builds are not commingled.

## Commands

```sh
pnpm install
pnpm run build        # turbo run build
pnpm run typecheck    # turbo run typecheck
pnpm run test         # turbo run test --concurrency=1
pnpm run check        # build + typecheck, then test
pnpm run sync         # re-sync from source repos (committed state only)
pnpm run deviations   # re-apply local edits after a re-sync
pnpm run check:float  # dependencies resolving differently than upstream
pnpm run drift        # maximal/src vs maximal-core/src divergence
```

pnpm 10.20 manages dependencies; `bun` is still the test runner and bundler
inside `maximal` and `maximal-core`, and `vitest` inside `maximal-electron`.
`test` is pinned to `--concurrency=1` deliberately. See below.

## Status

| | build | typecheck | lint | test |
| --- | --- | --- | --- | --- |
| `maximal` | pass | pass | pass | 1625 pass, 0 fail (148 files) |
| `maximal-core` | pass | pass | pass | 1766 pass, 0 fail (144 files) |
| `maximal-electron` | pass | pass | pass | 60 files, 1091 tests pass |
| `site` | pass | — | — | pass |

### Turborepo

Caching is the whole of the value here, and it is substantial:

| task | cold | warm |
| --- | --- | --- |
| `build` | 2.19s | 17ms |
| `typecheck` | 4.67s | 16ms |
| `lint` | 3.67s | 16ms |
| `test` | 52.56s | 22ms |

Cache scoping is correct, and verified two ways: editing one file in
`maximal-core` rebuilds only `maximal-core`, and editing one in `maximal`
correctly cascades to `maximal-site`. Task `inputs` exclude `research_log/`,
`.claude/`, `.github/` and `reports/`, so churn in those no longer busts a
cache — a docs edit used to.

There is now **one** real edge: `maximal-site#build dependsOn
@stuffbucket/maximal#build`, created by declaring the site's dependency on
maximal's `docs/guide`. The other three packages still declare nothing about
each other, so `^build` has almost nothing to order. And `test` runs at
`--concurrency=1`, giving up parallelism across packages. Turbo is doing real
work as a cache; it is barely being used as a build graph.

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

**4. Almost nothing here depends on anything else here.** Splitting out the site
produced the workspace's only edge (`site` -> `maximal`). `maximal`,
`maximal-core` and `maximal-electron` still declare nothing about one another.
The git-dep that motivated a monorepo (`"@stuffbucket/maximal-core":
"github:...#v0.2.0"`, pinned four minors behind core's 0.6.3) lives in `client/`
and `shell/` — neither of which is here.

**5. The three packages disagree about `node-linker`, and only one can win.**
maximal-electron sets `node-linker=hoisted` because Electron Forge packages
native prebuilds (`node-pty`, `node-llama-cpp`) for the final app and does not
follow pnpm's symlinked store. But `node-linker` is a *workspace-root* setting —
a package-level `.npmrc` is ignored — so it is one choice for all three.
Hoisted empties every package-local `node_modules` (all 822 packages land at the
root), and maximal-core's build then **refuses to run**: `bun build` writes
module paths relative to the resolved build root, so a bundle produced without
package-local deps is not byte-comparable, and it has an explicit guard saying
so. This workspace therefore runs pnpm's default isolated linker, which suits
`tsc`/`bun test`/`vitest` but means `electron-forge package` is not expected to
work from here. A real monorepo has to resolve this, not pick a side per task.

**6. `maximal` and its site are mutually coupled, and neither break was loud.**
Extracting `site` into its own package broke both directions. The site globs
`../docs/guide` for its user guide, so as a sibling it built **successfully with
an empty guide** — 8 pages down to 1, zero exit code. And `maximal` imports the
site's updates-manifest library from a release script and four tests. The second
direction cannot be expressed as a package dependency, because `site` already
depends on `maximal` and the reverse would be a cycle Turborepo rejects; those
imports are relative paths across packages, which is the smell that says these
two are not actually separable as written.

That is the honest headline: **as assembled, this is four largely independent
packages sharing an install, not an integrated monorepo.** It proves they can
coexist, build, typecheck, lint and test under one pnpm workspace with
Turborepo. It does not prove what the integration doc worries about, because the
consumer that would exercise the real seam was left out.

### The duplication, quantified

`pnpm run drift` compares the two copies of the engine:

| | |
| --- | --- |
| files in `maximal/src` | 175 |
| files in `maximal-core/src` | 174 |
| shared paths | 155 |
| — identical | 86 |
| — **diverged** | **69** |
| total differing lines | **4,235** |

`server.ts` alone differs by 343 lines.

**This is a one-way fork, not duplicated effort.** maximal-core was forked from
maximal on **2026-07-30** with the history rewritten but preserved: 1,126 of the
1,127 shared commit subjects carry identical author dates, so they are the same
original commits, not the same fix applied twice. Since the fork:

- `maximal-core` — **130 commits**
- `maximal` — **2 commits**, a research note and a Tauri `Cargo.lock` bump.
  **Nothing under `src/`.**

So `maximal/src` is frozen at the fork point while core moves. Of the 69
diverged files, 54 are core pulling ahead; the 8 where maximal has more lines
are mostly core *deliberately shedding scope* — `lib/platform/cli-path.ts` drops
from 240 lines to 58 because `ensureCliSymlink()`, the macOS `.app` first-launch
shim, has no place in a headless engine.

Two consequences follow.

**The good one:** excavating `maximal/src` is a **deletion, not a merge**. No
work lives only in maximal's copy, so there is nothing to rescue or reconcile —
delete it and depend on `@stuffbucket/maximal-core`.

**The bad one:** `@stuffbucket/maximal` is the public npm CLI (`bin: maximal`,
`bun publish --access public`) and its engine stopped receiving fixes on
2026-07-30, while core has taken 130 commits since. Every day that gap widens at
roughly the rate core is developed. The cost of the excavation is not really the
4,235 lines — it is that the shipped CLI and the maintained engine are no longer
the same code.

## Two operational notes

**Tests are serialized.** `maximal` and `maximal-core` are near-duplicates that
both bind ports and install signal handlers. Run concurrently under Turbo they
interfere — `maximal-core` picked up spurious `process.exit`/SIGINT failures that
vanish when run alone. Hence `--concurrency=1`. Real isolation would need port
randomization in the suites.

**Tests depend on repo state.** `getGitVersion` and the diagnostics
`source_revision` test read git HEAD, so they fail in a repo with no commits.
They pass once there is one.

**`.github/` is load-bearing.** It looks like dead weight, since those workflows
cannot run here. Deleting it dropped 69 passing tests — maximal-electron asserts
against those files in `tests/workflows.test.ts` and `tests/workflow-health.test.ts`.

**Dependency float is tracked, not fixed.** `pnpm run check:float` currently
reports **22** dependencies resolving differently than upstream, including
`oxlint` 1.63.0 -> 1.78.0 and `astro` 6.2.2 -> 6.4.8. Only the two that actually
broke something are pinned. The rest are a standing risk.

## Divergence to watch

The package-manager question is **settled**: maximal-electron migrated to pnpm
upstream, and this workspace followed. Its `pnpm.onlyBuiltDependencies` list
(`electron`, `node-pty`, `node-llama-cpp`, `esbuild`, `@google/genai`,
`protobufjs`) is hoisted to the root `package.json`, since only root pnpm
settings apply in a workspace.

What is **not** settled is the linker (finding 5). maximal-electron needs
`hoisted` for Forge packaging; maximal-core's build needs package-local
`node_modules`. Those are mutually exclusive under one root setting. Right now
the spike favours maximal-core, because it exercises builds and tests rather
than app packaging. Anything that has to produce a shippable Electron artifact
will hit this and needs a real answer — most likely packaging maximal-electron
outside the workspace, or relaxing maximal-core's reproducibility guard.

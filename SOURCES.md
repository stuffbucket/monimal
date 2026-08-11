# Sources

`monimal` is a **spike**, not a home of record. Each package is a copy — no git
history came across, so this file is the only thread back to the originals. The
canonical repos remain canonical.

Last re-synced 2026-08-11.

| Package | Source repo | Ref | Commit |
| --- | --- | --- | --- |
| `packages/maximal` | `stuffbucket/maximal` | `main` | `b831d87` |
| `packages/maximal-core` | `stuffbucket/maximal-core` | `main` | `3e2b10c` |
| `packages/maximal-electron` | `stuffbucket/maximal-electron` | `main` | `c31f238` |
| `packages/site` | `stuffbucket/maximal` | `main` | `b831d87` |

**Committed state on `main`.** `scripts/sync.sh` uses `git archive main`, so
these SHAs fully describe the copy: re-running the sync at the same commits
reproduces the same tree. `main` rather than `HEAD` on purpose — the source
repos sit on feature branches for long stretches, and a copy taken from whatever
happened to be checked out is not something you can reason about later. Override
for a one-off with `REF=... pnpm run sync`.

`packages/site` is the Astro site that lives at `maximal/site` upstream. It is a
separate package here so its build is not commingled with the CLI's.

## Re-syncing

```sh
pnpm run sync        # git archive main -> packages/*, then re-apply deviations
pnpm install         # REQUIRED: sync replaces package dirs, removing node_modules
pnpm run check       # build, typecheck, test
```

`scripts/apply-deviations.mjs` re-applies the local edits and is idempotent, so
the deviation set below stays a reviewable list rather than remembered
hand-edits. `pnpm run check:float` reports dependencies resolving differently
than upstream — currently **22**.

## What was excluded

- **`.claude/worktrees/`** — local agent state, hundreds of MB.
  `.claude/skills`, `.claude/agents` and settings are kept.
- **`maximal-electron/demo/`** — 2,581 jpg + 24 png + 2 mp4 of recorded demo
  footage (287MB). The four `.json` files under `demo/edits/` and `demo/takes/`
  are kept, because `tests/docs-claims.test.ts` references them.
- **Per-package lockfiles** — ignored in a workspace; leaving them implies a
  pinning that is not in effect.
- Build and tool artifacts: `node_modules`, `dist`, `out`, `reports`,
  `playwright-report`, `test-results`, `storybook-static`, `.eslintcache`.

The Tauri shell and `maximal/src` are absent because **upstream deleted them**
(maximal#442), not because this spike excluded them. Earlier revisions of this
file described deviations for that pre-excavation layout; they are gone.

## Deviations from the sources

Every change made to the copied packages, and why. Keep this list short — the
more that accumulates, the less the spike tells you about the real repos.

### The seam

`maximal` pins `"@stuffbucket/maximal-core": "github:stuffbucket/maximal-core#v0.1.1"`
while core is **0.6.3**. Rewritten to `workspace:*`. This is not cosmetic:
`maximal`'s `build`, `dev` and `start` all run out of
`node_modules/@stuffbucket/maximal-core/src`, so the link is load-bearing — the
workspace really does build the published CLI against current core, and it
passes.

The equivalent pin in `packages/maximal/client`
(`stuffbucket-electron` → `maximal-electron#2f1a06c`, 50 commits behind) is
**not** closed, because `client/` is not a workspace package yet. Note the
client declares the dependency under the key `stuffbucket-electron` while the
package's real name is `@stuffbucket/maximal-electron`; a git dependency
tolerates that, a `workspace:*` link will not.

### Required by Turborepo

- `maximal`, `maximal-core`: added `"test": "bun test"`. Neither had a plain
  `test` script; Turbo needs one to drive the task.
- `maximal-electron`: added `"build": "npm run build:package"` as an alias.

### Workspace hygiene

- `maximal`, `maximal-core`: git hooks taken off the install path
  (`maximal`'s `prepare` dropped, `maximal-core`'s renamed to `prepare:hooks`)
  and the `simple-git-hooks` devDependency removed. Two packages installing
  competing pre-commit hooks into one repo's `.git` is wrong.

### Forced by the single workspace lockfile

One root lockfile means the per-package lockfiles stop applying and everything
re-resolves to the newest semver-compatible version. This has broken the build
three times:

- `@hono/zod-openapi` floated `^1.5.0` → **1.5.2**, whose changed type inference
  makes `Object.values(ready.checks)` yield `unknown` and fails
  `tests/setup-status-openapi.test.ts` — in a package that typechecks clean
  upstream. **Pinned to `1.5.0`** in `maximal-core`.
- `prettier` floated **3.8.3 → 3.9.6**, which changed union-type formatting and
  produced 20 lint errors in files nobody touched. prettier is declared nowhere
  — it arrives through `@echristian/eslint-config` — so the only lever is a root
  `pnpm.overrides` entry. **Pinned to `3.8.3`.**

  `eslint --cache` hid the fix at first, replaying errors from the 3.9.6 run.
  Delete `.eslintcache` after changing a formatter version.

Third instance, third tool: **assume every transitive tool version floats until
pinned.**

### Forced by splitting the site into its own package

Extracting the Astro site broke the coupling in **both** directions, neither
loudly:

- `site` globs `../docs/guide` for its user guide — maximal's docs. As a sibling
  that path resolves to nothing, and Astro **built successfully with an empty
  guide**: 1 page instead of 8, content loss with a zero exit code. Fixed by
  declaring `@stuffbucket/maximal` as a workspace dependency and globbing
  through `node_modules`.
- `maximal`'s release script and three tests import the site's updates-manifest
  library. Those are repointed at `../../site/`. This **cannot** be a package
  dependency: `site` already depends on `maximal`, so the reverse is a cycle
  Turborepo rejects. Cross-package relative imports are a smell, and that is the
  finding — as written, these two are not separable.

  Lengthening the specifier also changes import sort order, which
  `perfectionist/sort-imports` fails on. The script reorders those imports
  itself rather than shelling out to `eslint --fix`: this runs during a sync,
  when the packages have just been replaced and `node_modules` does not exist
  yet, so eslint is unavailable at the one moment it would be needed.

### Forced by the package manager

The workspace is **pnpm**, matching maximal-electron's own migration off npm. It
uses pnpm's **default isolated linker**, deliberately overriding
maximal-electron's `node-linker=hoisted`. `node-linker` is a workspace-root
setting, so a package-level `.npmrc` cannot win and the choice is made once for
everyone. Hoisting empties every package-local `node_modules`, and
`maximal-core`'s build then refuses to run — `bun build` writes module paths
relative to the resolved build root, so a bundle built without package-local
deps is not byte-comparable. See `.npmrc`.

### Kept on purpose

`.github/` looks like dead weight — those workflows cannot run from this repo.
Deleting it silently dropped **69 passing tests**: maximal-electron's
`tests/workflows.test.ts` and `tests/workflow-health.test.ts` assert against
those files. They are tested artifacts, not inert config. `scripts/sync.sh` says
so at the point where deleting them would be tempting.

### Latent bugs the workspace exposed

- `maximal-electron` imports `typebox` in `src/main/native/agent.ts` and
  `src/main/native/toolsets.ts` but **never declares it**. npm's flat
  `node_modules` supplied it transitively via `@earendil-works/pi-agent-core`.
  A stricter layout does not, and typecheck fails. `typebox: 1.3.7` added here.
  **This is a real bug upstream**, not an artifact of copying.

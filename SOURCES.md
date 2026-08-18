# Sources

`packages/maximal`, `packages/maximal-core` and `packages/maximal-electron` are
copies of the repos below. No git history came across. Syncing is over — edit
them here.

| Package | Source repo | Commit copied |
| --- | --- | --- |
| `packages/maximal` | `stuffbucket/maximal` | `b831d87` |
| `packages/maximal-core` | `stuffbucket/maximal-core` | `3e2b10c` |
| `packages/maximal-electron` | `stuffbucket/maximal-electron` | `c31f238` |

## Rules

- Do not delete `packages/*/.github`. maximal-electron's `workflows.test.ts` and
  `workflow-health.test.ts` assert against those files.
- Do not add per-package lockfiles. The root lockfile is the only one that
  applies; a second implies a pinning that is not in effect.
- Do not call `npm` in package scripts. Use pnpm.
- Do not set `node-linker=hoisted`. It empties package-local `node_modules`, and
  maximal-core's `bun build` then writes module paths that are not
  byte-comparable. See `.npmrc`.
- Do not commit `maximal-core/dist`. Its `build` generates it.
- Keep `maximal/site` inside `maximal`. It is the Pages site, not a workspace
  member.
- Pin transitive tool versions. The root lockfile re-resolves everything to the
  newest semver-compatible version, so assume anything unpinned floats.
- Delete `.eslintcache` after changing a formatter version, or it replays stale
  errors.

## Deviations

- `maximal` and `maximal/client`: git pins on `@stuffbucket/maximal-core`
  rewritten to `workspace:*`. Load-bearing — maximal's `build`, `dev` and
  `start` run out of `node_modules/@stuffbucket/maximal-core/src`.
- `maximal/client`: `stuffbucket-electron` rewritten to
  `workspace:@stuffbucket/maximal-electron@*`. Aliased because the dependency
  key does not match the package's real name, which a git dependency tolerates
  and a workspace link does not.
- `maximal-core`: `build` extended with `bun run build:lib`, so the subpath
  exports in its `exports` map resolve without committing `dist/lib`.
- `maximal` and `maximal-core`: added `"test": "bun test"`; Turbo needs a plain
  `test` script. `maximal-electron`: added `"build"` as an alias for
  `build:package`, same reason.
- `maximal-electron`: every `npm run` replaced with `pnpm run`. npm does not
  recognise the config pnpm exports and warned four times per invocation.
- `maximal-electron`: dropped `pnpm.onlyBuiltDependencies`. It duplicated the
  root list, which is the only one pnpm honours.
- `maximal-electron`: deleted its `.npmrc`. Its only line set
  `node-linker=hoisted`, which the root setting overrides.
- `maximal/client`: deleted `package-lock.json`, and `scripts/build-core.ts`
  now takes the sidecar's git SHA from `git rev-parse HEAD`. It parsed the
  lockfile for the git URL maximal-core was once installed from — a commit that
  is not what gets compiled, since the workspace link means the code comes from
  this checkout.
- `maximal-core`: `tests/tee-logger.test.ts` waits for the log flush by polling
  for the content it asserts on, and uses a fresh logger name per run. It slept
  a fixed 1300ms against a 1s flush interval and unlinked its own log file,
  which strands the cached `WriteStream` in `platform/logger.ts` on a deleted
  inode. Both tests then failed on every re-run in the same process.
- `maximal-core`: `@hono/zod-openapi` pinned to `1.5.0`. 1.5.2 changes an
  inferred type and fails `tests/setup-status-openapi.test.ts`.
- Root: `prettier` pinned to `3.8.3` via `pnpm.overrides`. 3.9.6 reformats
  unions and turns untouched files into lint errors. It is declared nowhere —
  it arrives through `@echristian/eslint-config` — so overrides is the only lever.
- `maximal` and `maximal-core`: git hooks taken off the install path and
  `simple-git-hooks` dropped. Two packages installing competing hooks into one
  `.git` is wrong.
- `maximal-electron`: added `typebox`. `maximal/client`: added `@types/node` and
  `@electron/packager`. All three are imported but never declared, and npm's
  flat `node_modules` used to supply them. Real bugs upstream.

## Excluded from the copies

`node_modules`, build output, `reports`, `.claude/worktrees`, per-package
lockfiles, and maximal-electron's recorded demo media. The `.json` files under
`demo/` are kept — `tests/docs-claims.test.ts` references them.

The Tauri shell and `maximal/src` are absent because upstream deleted them
(maximal#442), not because the copy excluded them.

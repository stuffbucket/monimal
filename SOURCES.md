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
  byte-comparable. See `pnpm-workspace.yaml`.
- Put pnpm settings in `pnpm-workspace.yaml`, not `.npmrc` or `package.json`.
  pnpm 11 reads neither of the latter for them and does not warn: the setting is
  simply ignored. `.npmrc` carries the registry and nothing else.
- Do not commit `maximal-core/dist`. Its `build` generates it.
- Keep `maximal/site` inside `maximal`. It is the Pages site, not a workspace
  member.
- Pin transitive tool versions. The root lockfile re-resolves everything to the
  newest semver-compatible version, so assume anything unpinned floats.
- Delete `.eslintcache` after changing a formatter version, or it replays stale
  errors. CI's cold job does this for every run, since a stale cache once
  replayed a lint crash as green.
- Run `node scripts/verify-workspace.mjs` after changing anything in
  `pnpm-workspace.yaml`. It reads the installed tree rather than the config,
  which is the only way to catch a pnpm setting that is accepted and ignored.

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
- Root: `prettier` pinned to `3.8.3` via `overrides` in `pnpm-workspace.yaml`.
  3.9.6 reformats unions and turns untouched files into lint errors. It is
  declared nowhere — it arrives through `@echristian/eslint-config` — so
  overrides is the only lever.
- `maximal` and `maximal-core`: git hooks taken off the install path and
  `simple-git-hooks` dropped. Two packages installing competing hooks into one
  `.git` is wrong.
- `maximal-electron`: added `typebox`. `maximal/client`: added `@types/node` and
  `@electron/packager`. All three are imported but never declared, and npm's
  flat `node_modules` used to supply them. Real bugs upstream.
- `maximal-electron`: `vite` moved from `^7.3.6` to `^8.2.1`. The registry in
  `.npmrc` carries 7.3.5 and then 8.x, never 7.3.6, so the pinned version cannot
  be installed at all. Every dependent already accepts vite 8 as a peer, and
  `maximal/client` was on `^8.2.1` already.
- `maximal/site`: `astro` and `@astrojs/markdown-remark` moved from `^7.2.2` to
  `^7.2.1`, and `bun.lock` re-resolved. Same cause in the other direction — the
  registry's newest astro is 7.2.1 — so this walks back the dependabot bump in
  33c4a5f for as long as that gap persists.
- Root: `packageManager` moved to `pnpm@11.17.0`, and `mise.toml` / `mise.lock`
  pin the same version locally so pnpm never has to switch versions to satisfy
  the field. mise verifies GitHub artifact attestations and records a per-
  platform checksum, which is the only content pin available here: the registry
  publishes no signatures, no attestations, and only a SHA-1 shasum.
- Root: `pnpm.overrides` and `pnpm.onlyBuiltDependencies` moved out of
  `package.json` into `pnpm-workspace.yaml`, the latter renamed to `allowBuilds`
  and reshaped from a list to a map. Under pnpm 11 the old spellings are ignored
  silently, which does not fail the install — it just leaves every native
  dependency unbuilt.
- Root: the hoist pattern moved from `.npmrc` to `publicHoistPattern` in
  `pnpm-workspace.yaml`, gaining a `!typescript` exemption. `maximal/client`
  pins typescript `^7.0.2` and everything else pins `^5.9.3`, so hoisting either
  shadows the other for any dependency that resolves by walking up rather than
  through its own peer link — which is what made `eslint-plugin-perfectionist`
  call a TS 5 API on the TS 7 module.

## Excluded from the copies

`node_modules`, build output, `reports`, `.claude/worktrees`, per-package
lockfiles, and maximal-electron's recorded demo media. The `.json` files under
`demo/` are kept — `tests/docs-claims.test.ts` references them.

The Tauri shell and `maximal/src` are absent because upstream deleted them
(maximal#442), not because the copy excluded them.

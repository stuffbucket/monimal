# Sources

`packages/maximal`, `packages/maximal-core` and `packages/maximal-electron` are
copies of the repos below. No git history came across. Syncing is over — edit
them here.

| Package                     | Source repo                    | Commit copied |
| --------------------------- | ------------------------------ | ------------- |
| `packages/maximal`          | `stuffbucket/maximal`          | `b831d87`     |
| `packages/maximal-core`     | `stuffbucket/maximal-core`     | `3e2b10c`     |
| `packages/maximal-electron` | `stuffbucket/maximal-electron` | `c31f238`     |

## Rules

- Do not delete `packages/*/.github`. maximal-electron's `workflows.test.ts` and
  `workflow-health.test.ts` assert against those files.
- Do not edit, delete, or sync `packages/maximal/.macos-builder/`. It is a
  vendored copy of maximal's producer; the builder reads the ROOT
  `.macos-builder/` and never that path. The two target different layouts
  (npm with `client/` at the root, versus pnpm with `packages/maximal/client`)
  and are meant to diverge.
- Do not add per-package lockfiles. The root lockfile is the only one that
  applies; a second implies a pinning that is not in effect.
- Do not call `npm` in package scripts. Use pnpm.
- Root rules win over `packages/*/AGENTS.md` and `packages/*/CLAUDE.md`. Those
  were written for standalone repos, so their `npm run` commands and release
  steps do not apply here.
- Do not delete `maximal-core/AGENTS.md` or `maximal-electron/AGENTS.md`.
  `docs-reference-parity.test.ts` and `verify-docs.mjs` read them.
- Do not reference a root file from inside `packages/**`. A link to `AGENTS.md`
  or `SOURCES.md` there resolves to nothing in the source repo.
- Do not set `node-linker=hoisted`. It empties package-local `node_modules`, and
  maximal-core's `bun build` then writes module paths that are not
  byte-comparable. `publicHoistPattern` in `pnpm-workspace.yaml` is what gets
  the hoisting Electron Forge and Rolldown need without it.
- Put pnpm settings in `pnpm-workspace.yaml`, not `.npmrc` or `package.json`.
  pnpm 11 reads neither of the latter for them and does not warn: the setting is
  simply ignored. `.npmrc` carries the registry and nothing else.
- Do not commit `maximal-core/dist`. Its `build` generates it.
- Keep `packages/maximal/site` inside `maximal`; copied scripts and frozen
  workflow fixtures address it as `site/` relative to that package.
- Keep `packages/maximal/site` in the root pnpm workspace. Otherwise the root
  install, lockfile, Dependabot entry, and Turbo graph do not cover it.
- Pin transitive tool versions. The root lockfile re-resolves everything to the
  newest semver-compatible version, so assume anything unpinned floats.
- Do not wire `verify:workflow-health` into this repo's CI. It reads Actions
  run history for `GITHUB_REPOSITORY`, so it passes locally by querying the
  upstream repo and fails in CI by asking monimal about workflows only the
  vendored `packages/*/.github` fixtures declare.
- Prefer `pnpm install --frozen-lockfile`; a re-resolution records rotating
  hosts that pnpm rejects on the next install.
- Run `node scripts/strip-lockfile-hosts.mjs` BEFORE `pnpm install`, not after,
  and never as a `postinstall` hook. pnpm's supply-chain check rejects a
  recorded host before lifecycle scripts run, so a hook cannot repair it.
- Do not re-add a SHA-512 requirement for lockfile entries. SHA-1 as served is
  deliberate: the proxy is the supply-chain control and the hash only detects
  transit corruption. See [Lockfile integrity](#lockfile-integrity).
- Run `node scripts/verify-workspace.mjs` after changing anything in
  `pnpm-workspace.yaml`. It reads the installed tree rather than the config,
  which is the only way to catch a pnpm setting that is accepted and ignored.
- One node version, named in `.nvmrc` and nowhere else. `mise.toml` opts node
  into idiomatic version files so mise reads that same file; CI reads it through
  setup-node's `node-version-file`. `engines` states the floor, which nothing
  enforces, so `verify-workspace.mjs` compares the _running_ major against it.
- Do not let two packages pin different versions of the same dependency. The
  script above ratchets this: `DELIBERATE` holds the splits that are meant
  (typescript), `BACKLOG` holds the ones that are not and may only shrink.

## Lockfile integrity

The root `.npmrc` sends installs through the public 1ES read-through proxy.
**The proxy is the supply-chain control** -- that is why it is configured, and
it is what vets what may be installed. The lockfile hash is not doing security
work; it detects corruption in transit and nothing more.

That settles the algorithm. The proxy publishes only a legacy SHA-1 `shasum` --
no `dist.integrity`, no signing keys, no attestations -- and SHA-1 is adequate
for a transport check, so the pins are recorded as served. Requiring SHA-512
meant repairing the lockfile after every re-resolution to buy a property the
proxy already provides.

**Hostnames are a different matter, and are not tolerated.** The proxy serves
tarballs from `ms-feed-N.pkgs.visualstudio.com`, and which shard answers
rotates constantly: two installs of the same package minutes apart were served
by different hosts. Only four shards -- 2, 12, 17 and 25 -- answer anonymously
at all; others return 401 or 404.

A recorded hostname does not fail eventually. It fails on the **next** install,
and pnpm is what rejects it: pnpm 11 verifies every recorded `tarball:` URL
against the registry's *current* metadata and refuses the lockfile outright.

```
[ERR_PNPM_TARBALL_URL_MISMATCH] 1 lockfile entries failed verification:
  picocolors@1.1.1 has a tarball URL (...ms-feed-7...) that does not match
  the registry's published metadata (...ms-feed-17...)
```

That check runs **before lifecycle scripts**, so no `postinstall` hook can
repair it -- the install is already dead. `scripts/strip-lockfile-hosts.mjs`
must run *before* `pnpm install`. pnpm reconstructs the URL from the configured
registry when `tarball:` is absent, so the rule is simply that no entry carries
one.

`scripts/verify-workspace.mjs` is a backstop for a lockfile that reaches the
tree by some other route. It checks lockfile metadata; it does not establish
package provenance or publisher identity -- the proxy does that.

## Deviations

- Added `packages/eslint-config` (`@stuffbucket/eslint-config`), a private
  workspace package holding the shared flat config, and dropped
  `@echristian/eslint-config` from `maximal` and `maximal-core`. That preset
  was one person's personal config, last published 2025-08-28, and the React
  plugins it pinned but left disabled -- `@eslint-react/*`, `jsx-a11y`,
  `react-hooks` -- were the only thing capping the workspace at ESLint 9.
  Removing it took 83 packages out of the root `node_modules`.
  Three entry points: `./base` (ignores + `js.configs.recommended`, used by
  the workspace packages), `./typescript` (adds typescript-eslint), `./service`
  (adds the quality plugins and prettier for service packages).
- Added `packages/maximal-provider-contract` as the side-effect-free HTTP
  gateway contract, `packages/maximal-dsh-host` as its trusted in-process DSH
  implementation, and `packages/anthropic-provider` as an independently
  installable stock Cordis/DSH adapter. Maximal Core consumes only the contract;
  the packaging composition may consume the host; neither depends on a concrete
  provider plugin.
- Replaced the private `packages/omlx` descriptor scaffold with a publishable
  stock Cordis/DSH adapter for an independently running oMLX HTTP server. Cordis
  and DSH are exact peers of external provider packages and are loaded from a
  user-managed profile rather than compiled into Maximal. `packages/llama-server`
  remains a private descriptor scaffold and is deliberately separate from
  `maximal-electron`'s embedded `node-llama-cpp` utility process.
- Pin rule SETS, not just plugin versions, when a plugin major moves. The
  replaced preset enumerated 83 unicorn rules against unicorn 60; ESLint 10
  needs unicorn >= 73, whose `recommended` turns on 227 more. Taking
  `recommended` produced 3071 errors in untouched files. `service.js` lists
  the rules instead, so the plugin version floats and the enforced set does
  not. The same applies to `eslint-plugin-package-json`, whose 1.x added two
  `require-*` rules that are switched off there.
- Do not add `{ ignores: [...] }` as a standalone object to share an exclusion
  between config layers. A config object whose only key is `ignores` is a
  GLOBAL ignore in flat config, so one added for "keep TypeScript rules off
  package.json" silently stopped all three manifests being linted at all --
  invisible in the findings, which stayed at zero, and visible only in the
  linted-file count. Attach `ignores` to the objects that carry rules.

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
  3.9.6 reformats unions and turns untouched files into lint errors.
  `@stuffbucket/eslint-config` declares it at that exact version, so overrides
  is no longer the only lever; it stays because it also pins the copies that
  arrive transitively, which a declaration cannot reach.
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
  `^7.2.1`. The registry's newest Astro is 7.2.1, so this walks back the
  Dependabot bump in 33c4a5f for as long as that gap persists.
- `maximal/site`: added to the root pnpm workspace and root lockfile. Its Astro
  build is package-manager-neutral; the separate Bun install, lockfile,
  registry file, Dependabot entry, and CI path duplicated workspace machinery.
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
- `maximal-electron`: `electron` moved from `43.2.0` to `43.3.0`, matching
  `maximal/client`. The UI library was tested against one Electron and the app
  that ships it was built against another, which nothing reported because each
  package was internally consistent.
- Root: `@electron/node-gyp` overridden to `10.2.0-electron.1`, the same
  version, taken from the registry instead of the GitHub tarball
  `@electron/rebuild` pins. pnpm 11 refuses to resolve any git-hosted
  subdependency (`blockExoticSubdeps`, on by default). The committed lockfile
  is grandfathered, so installs worked while every re-resolution failed — which
  would have hit the first dependabot PR rather than anything a human ran.
- `maximal-electron`: dropped its `packageManager` field. It pinned pnpm
  10.20.0 against the root's 11.17.0, and a second declaration implies a pinning
  that is not in effect.
- All packages: `engines.node` moved to `>=24` and `.nvmrc` to 24, replacing 22.
  24 is Active LTS where 26 is still Current, and it clears the floor ESLint 10
  will need (`^20.19 || ^22.13 || >=24`) if that ever unblocks. `maximal/client`
  and `maximal/site` had no `engines` at all and now state it.
- Root: the hoist pattern moved from `.npmrc` to `publicHoistPattern` in
  `pnpm-workspace.yaml`, gaining a `!typescript` exemption. `maximal/client`
  pins typescript `^7.0.2` and everything else pins `^5.9.3`, so hoisting either
  shadows the other for any dependency that resolves by walking up rather than
  through its own peer link — which is what made `eslint-plugin-perfectionist`
  call a TS 5 API on the TS 7 module.
- Root, `maximal`, and `maximal-core`: the normal test graph moved behind the
  root mountless Docker runner. Package Bun preloads now reject raw host tests,
  and Core creates isolated Maximal and Claude homes only after the container
  marker is present. This is deliberately stricter than either copied upstream
  repository because a root-CWD run can skip a package-local `bunfig.toml`.
- `maximal/client`: `scripts/build-core.ts` accepts a validated
  `MAXIMAL_GIT_SHA` before falling back to `git rev-parse`. The filtered Docker
  context cannot use this linked worktree's host-absolute `.git` pointer, but
  the sidecar must still embed the checkout revision supplied by the wrapper.

## Known-blocked upgrades

- `maximal/client` cannot use typescript-eslint, so it lints without any
  type-aware rule. It pins `typescript ^7.0.2`; typescript-eslint still
  declares `typescript >=4.8.4 <6.1.0` at 8.67.0 and throws at import time even
  for plain, non-type-aware parsing. The package parses with
  `@babel/eslint-parser` instead. The only way out short of upstream support is
  a second, aliased TypeScript <6.1 installed for the linter alone -- a shadow
  compiler whose type layer can disagree with the real `tsc` -- which is a
  human decision, not a config change.

## Excluded from the copies

`node_modules`, build output, `reports`, `.claude/worktrees`, per-package
lockfiles, and maximal-electron's recorded demo media. The `.json` files under
`demo/` are kept — `tests/docs-claims.test.ts` references them.

The Tauri shell and `maximal/src` are absent because upstream deleted them
(maximal#442), not because the copy excluded them.

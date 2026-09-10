# Sources

`packages/maximal`, `packages/maximal-core` and `packages/maximal-electron` are
copies of the repos below. No git history came across. Syncing is over — edit
them here.

| Package                     | Source repo                    | Commit copied |
| --------------------------- | ------------------------------ | ------------- |
| `packages/maximal`          | `stuffbucket/maximal`          | `b831d87`     |
| `packages/maximal-core`     | `stuffbucket/maximal-core`     | `3e2b10c`     |
| `packages/maximal-electron` | `stuffbucket/maximal-electron` | `c31f238`     |

## Monorepo-native packages

These packages originated in this workspace and have no standalone source
repository or imported commit:

| Package                                   | Purpose                                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| `packages/maximal-observability-contract` | Runtime-neutral, versioned traffic-observability schemas and passive observer interfaces. |
| `packages/maximal-observability`          | Renderer-only traffic explorer components and source interface.                           |

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
- Pin transitive tool versions. The root lockfile re-resolves everything to the
  newest semver-compatible version, so assume anything unpinned floats.
- Do not wire `verify:workflow-health` into this repo's CI. It reads Actions
  run history for `GITHUB_REPOSITORY`, so it passes locally by querying the
  upstream repo and fails in CI by asking monimal about workflows only the
  vendored `packages/*/.github` fixtures declare.
- Keep `--frozen-lockfile` on every install that is not deliberately resolving.
  It fails when the lockfile disagrees with the manifests -- `specifiers in the
lockfile don't match specifiers in package.json` -- where a plain `pnpm
install` silently re-resolves and rewrites. That is what makes CI install what
  was committed. It used to be justified by rotating hosts as well; since
  `.pnpmfile.cjs` a re-resolution no longer records them, so reproducibility is
  now the whole of the reason.
- Do not delete `.pnpmfile.cjs`, and keep its `afterAllResolved` hook. It drops
  the rotating shard hosts from the lockfile before pnpm writes it, which is the
  only point at which Dependabot can be stopped from committing them.
- Re-resolve and commit `pnpm-lock.yaml` in the same change as any edit to
  `.pnpmfile.cjs`. pnpm records a `pnpmfileChecksum`, and every frozen install
  fails with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` until the two agree.
- Do not set `verifyDepsBeforeRun` to `install`, and do not remove it from
  `pnpm-workspace.yaml`. That is pnpm 11's default, and it makes every `pnpm
run` install first -- a silent re-resolution behind every script. Before
  `.pnpmfile.cjs` that re-recorded all 1724 rotating hosts the strip script had
  just removed, which is the whole of #26; the hook now drops them either way,
  so what `warn` buys is no longer writing the tree from under a `run`.
- Run `node scripts/strip-lockfile-hosts.mjs` BEFORE `pnpm install`, not after,
  and never as a `postinstall` hook. pnpm's supply-chain check rejects a
  recorded host before lifecycle scripts run, so a hook cannot repair it. Since
  `.pnpmfile.cjs` this is a repair for lockfiles written without it, not part of
  the normal loop.
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
- `package.json`'s `packageManager` owns the pnpm version. `mise.toml` and
  `mise.lock` resolve that same version locally and lock its platform artifacts
  by checksum. CI setup actions are SHA-pinned and validate their installed
  versions; the isolated macOS producer bootstraps only the committed
  `mise.lock` macOS artifact after verifying its checksum.
- The Docker dependency image MUST validate Node's exact `mise.lock` version and
  MUST install the Bun and pnpm URLs and checksums from that lock for its target
  architecture.
- Docker dependency-image builds MUST use the dedicated `monimal-test` Buildx
  builder. Cleanup MUST bound only that builder's cache and MUST NOT prune a
  shared builder.
- Host CLI requirements MUST be version-pinned in `mise.toml` and resolved in
  `mise.lock`; Homebrew MAY provide the same tool outside mise on macOS.
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
against the registry's _current_ metadata and refuses the lockfile outright.

```
[ERR_PNPM_TARBALL_URL_MISMATCH] 1 lockfile entries failed verification:
  picocolors@1.1.1 has a tarball URL (...ms-feed-7...) that does not match
  the registry's published metadata (...ms-feed-17...)
```

That check runs **before lifecycle scripts**, so no `postinstall` hook can
repair it -- the install is already dead. pnpm reconstructs the URL from the
configured registry when `tarball:` is absent, so the rule is simply that no
entry carries one.

The place to enforce that is `.pnpmfile.cjs`. Its `afterAllResolved` hook runs
on the in-memory lockfile _before_ serialization, so the hosts are never written
rather than removed afterwards. That is what makes it work for Dependabot, which
cannot be asked to run a repair script and which previously opened every
dependency PR with ~1700 host-pinned entries. A forced re-resolution of this
workspace drops ~1740 and leaves the lockfile byte-identical.

`scripts/strip-lockfile-hosts.mjs` does the same edit after the fact. It is the
repair for a lockfile written before the hook existed, and it must run _before_
`pnpm install` for the reason above; it is not part of the normal loop.

`scripts/verify-workspace.mjs` is a backstop for a lockfile that reaches the
tree by some other route. It checks lockfile metadata; it does not establish
package provenance or publisher identity -- the proxy does that.

## Deviations

- `maximal`, `maximal-core`, and `maximal-electron`: `CLAUDE.md` is a direct
  `@AGENTS.md` include. `maximal`'s instruction owner moved from `CLAUDE.md` to
  `AGENTS.md`, matching the other packages and preventing parallel rule copies.
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
- `maximal-core/downstream`: declares itself as an independently installed
  compatibility fixture so the root package-onboarding audit does not treat it
  as a missing nested workspace package.
- Added `packages/maximal-provider-contract` as the side-effect-free HTTP
  gateway contract, `packages/maximal-dsh-host` as its trusted in-process DSH
  implementation, and `packages/anthropic-provider` as an independently
  installable stock Cordis/DSH adapter. Maximal Core consumes only the contract;
  the packaging composition may consume the host; neither depends on a concrete
  provider plugin.
- Added the monorepo-native `packages/maximal-observability-contract` for the
  versioned, runtime-neutral traffic contract and passive observer seam, and
  `packages/maximal-observability` for renderer-only traffic surfaces. The UI
  package depends on the contract; the contract depends on neither Core nor a
  UI, database, transport, or desktop runtime.
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
- Added a Turbo-cached `analyze` task across every workspace package. Maximal
  Core owns the exact Knip, dependency-cruiser, and jscpd versions and the
  shared runner; its pre-existing cycle-edge and duplicate-pair ratchets call
  extracted shared primitives. `architecture-analysis.json` owns package
  coverage, package-layer rules, and non-Core baselines. The existing workspace
  verifier consumes the same layer data for its authoritative provider-edge
  check. The shared ESLint package owns the exact
  `eslint-plugin-boundaries` version and composes its architecture profile into
  the existing TypeScript lint pass.

- `maximal` and `maximal/client`: git pins on `@stuffbucket/maximal-core`
  rewritten to `workspace:*`. Load-bearing — maximal's `build`, `dev` and
  `start` run out of `node_modules/@stuffbucket/maximal-core/src`.
- `maximal/client`: `stuffbucket-electron` rewritten to
  `workspace:@stuffbucket/maximal-electron@*`. Aliased because the dependency
  key does not match the package's real name, which a git dependency tolerates
  and a workspace link does not.
- `maximal-core`: `build` extended with `bun run build:lib`, so the subpath
  exports in its `exports` map resolve without committing `dist/lib`.
- `maximal-core`: root CI uses `check:deep:host:after-workspace` after Turbo's
  workspace tasks; it retains both lint variants and the other host checks while
  reusing generated build output for downstream typechecking.
- `maximal` and `maximal-core`: added `"test": "bun test"`; Turbo needs a plain
  `test` script. `maximal-electron`: added `"build"` as an alias for
  `build:package`, same reason.
- `maximal-electron`: every `npm run` replaced with `pnpm run`. npm does not
  recognise the config pnpm exports and warned four times per invocation.
- `maximal-electron`: the nested `pnpm run` taken back out of the build hooks.
  `build:package` and the four `pre*` hooks that called it are now
  `node scripts/build-package.mjs`, which invokes `tsc` at its installed path
  and imports the stylesheet copy. `pnpm run` writes resolution progress to
  stdout whenever the lockfile does not match the configured registry — every
  invocation behind the proxy in `.npmrc` — and `scripts/verify-exports.mjs`
  parses `npm pack --dry-run --json` off the stdout `prepack` inherits. The
  check therefore passed in CI, where resolution is clean, and crashed with
  `Unexpected token 'S'` for anyone who ran it locally; it also rewrote
  `pnpm-lock.yaml` on its way out, which is the lockfile hazard above reached
  through a read-only check.
- `maximal-electron`: `src/main/llama-worker.ts` passes `build: 'never'` to
  `getLlama()`, and packaging drops
  `node-llama-cpp/llama/gitRelease.bundle` -- 33 MB of llama.cpp source for a
  compile that cannot run in an Electron bundle. Upstream already defaults the
  option that way inside Electron; stating it makes the packaging decision rest
  on this application's choice rather than on a default that could change.
- `maximal-electron`: dropped `pnpm.onlyBuiltDependencies`. It duplicated the
  root list, which is the only one pnpm honours.
- `maximal-electron`: deleted its `.npmrc`. Its only line set
  `node-linker=hoisted`, which the root setting overrides.
- `maximal/client`: added a `README.md`. The upstream copy carries none, and
  its gap list had no owner -- `docs/dev/client-architecture.md` listed four
  gaps without sequencing them. The README owns the sequence; that section now
  links to it rather than restating it.
- `maximal/client`: was on `typescript ^7.0.2` with `@babel/eslint-parser` and
  no typescript-eslint. bb12eaf moved the workspace to one TypeScript, so it
  now lints through the type-aware recommended profile in
  `@stuffbucket/eslint-config/typescript`.
- `maximal/client` and `maximal-electron`: renamed `vitest.config.ts` to
  `vitest.config.mts`. Both packages are CommonJS at their package boundary,
  while their Vitest configs use ESM syntax; the explicit extension keeps Vite
  from loading those configs as CommonJS.
- `maximal/client`: `scripts/name-dev-bundle.mjs` names a private copy of the
  Electron dist rather than the installed one, and `start` runs through
  `scripts/start.mjs` to point `ELECTRON_OVERRIDE_DIST_PATH` at it. Upstream is
  a single-package repository where `node_modules/electron` belongs to one
  application. Here pnpm links it from a store directory that
  `maximal-electron` shares, so naming the development bundle renamed that
  package's development bundle too.
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
- Removed `maximal/site` after the site moved to
  `https://github.com/stuffbucket/maximal-site`; its build, dependency updates,
  and release workflow are now owned by that repository.
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
- `maximal-electron`: dropped its `packageManager` field. The root owns the
  workspace package-manager version; a second declaration implies a pin that is
  not in effect.
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
- Root, `maximal`, and `maximal-core`: package Bun preloads admit native host
  tests only through the root wrapper's isolated temporary home and state paths;
  raw host tests still fail closed. This native admission is a monorepo deviation
  from the copied repositories' direct package test commands. The root wrapper
  runs affected or explicit full/focused tests natively. The Docker runner mounts
  the primary checkout read-only, stages Git-visible source into writable
  container storage, and uses container-owned dependencies and toolchains.
- `maximal/client`: `scripts/build-core.ts` accepts a validated
  `MAXIMAL_GIT_SHA` before falling back to `git rev-parse`. The filtered Docker
  context cannot use this linked worktree's host-absolute `.git` pointer, but
  the sidecar must still embed the checkout revision supplied by the wrapper.

## Known-blocked upgrades

None. The last entry was `maximal/client`'s TypeScript 7 pin, which bb12eaf
cleared; the Deviations section records what replaced it.

## Excluded from the copies

`node_modules`, build output, `reports`, `.claude/worktrees`, per-package
lockfiles, and maximal-electron's recorded demo media. The `.json` files under
`demo/` are kept — `tests/docs-claims.test.ts` references them.

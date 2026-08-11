# Sources

`monimal` is a **spike**, not a home of record. Each package here is a plain
working-tree copy — no git history came across, so this file is the only thread
back to the originals. The canonical repos remain canonical.

Copied 2026-08-11.

| Package | Source repo | Branch | Commit |
| --- | --- | --- | --- |
| `packages/maximal` | `stuffbucket/maximal` | `docs/reel-clipping-reference` | `a137a0f` |
| `packages/maximal-core` | `stuffbucket/maximal-core` | `feat/win11-vm-harness` | `6bb2eff` |
| `packages/maximal-electron` | `stuffbucket/maximal-electron` | `main` | `86e210a` |

## What was excluded

- **`maximal/shell/`** — the parked Tauri shell (7.7G, mostly `src-tauri/` Rust
  build artifacts). Excluded on request: no Tauri pieces.
- **`maximal/site/`** — kept (source only, ~1.5MB); its `node_modules` was not.
- **`.claude/worktrees/`** — 672MB of local agent state across the three repos.
  `.claude/skills`, `.claude/agents` and `settings.local.json` were kept.
- **`maximal-electron/demo/`** — 2,581 jpg + 24 png + 2 mp4 of recorded demo
  footage (287MB). The four `.json` files under `demo/edits/` and
  `demo/takes/` were kept, because `tests/docs-claims.test.ts` references them.
- Build and tool artifacts everywhere: `node_modules`, `dist`, `out`, `target`,
  `coverage`, `reports`, `playwright-report`, `test-results`,
  `storybook-static`, `.eslintcache`.

977MB on first copy → **18MB** after excluding the above.

## Deviations from the sources

Every change made to the copied packages, and why. Keep this list short — the
more that accumulates here, the less the spike tells you about the real repos.

### Forced by removing the Tauri shell

- `maximal`: `prepare` was `bun run ensure:ui-embed && simple-git-hooks && cd
  shell && bun install`. The `cd shell` half fails outright with no `shell/`,
  which breaks `bun install` for the whole workspace. Now `bun run
  ensure:ui-embed`.
- `maximal`: deleted 14 test files that import from or read `shell/`. Six
  imported `../shell/src/**` (`inline-state-client`, `project-slice`,
  `spa-router`, `tauri-shell-bridge`, `usage-format`, `ws/live-feed-core`);
  eight read shell files at runtime (`single-history-invariant`,
  `account-section`, `docs-reference-parity`, `tauri-resources`,
  `i18n-catalog-parity`, `boot-status`, `shell-sidecar-env-contract`,
  `ui-url-contract`).
- `maximal`: these scripts are now inert because they reach into `shell/` —
  `app:build`, `app:dev`, `app:icons`, `app:setup`, `app:sidecar`, `app:ui`,
  `build:ui`, `ui:harness`, `typecheck:shell`, and `scripts/generate-css-tokens.ts`.
  They were left in place rather than deleted, to keep the diff against upstream
  small. None are on the `build` / `typecheck` / `test` path.

### Forced by the single workspace lockfile

A Bun workspace has one root lockfile. The per-package `bun.lock` files came
across but are ignored, so every dependency re-resolved to the newest
semver-compatible version. That is not cosmetic — it broke a typecheck
immediately:

- `@hono/zod-openapi` floated `^1.5.0` → **1.5.2** in both `maximal` and
  `maximal-core`, and 1.5.2 changes an inferred type such that
  `Object.values(ready.checks)` yields `unknown`. Result:
  `tests/setup-status-openapi.test.ts(399,7): error TS2345`, in both packages,
  when both typecheck clean upstream. **Pinned to exactly `1.5.0`** to match
  what upstream's lockfiles resolve. `hono` likewise floated 4.12.18 → 4.13.1;
  left alone, as nothing failed because of it.

### Latent bugs the workspace exposed

- `maximal-electron` imports `typebox` in `src/main/native/agent.ts` and
  `src/main/native/toolsets.ts` but **never declares it**. npm's flat
  `node_modules` silently supplied it as a transitive dep of
  `@earendil-works/pi-agent-core` / `pi-ai`. Bun's isolated layout does not, so
  typecheck failed. Added `typebox: 1.3.7` to `devDependencies`, matching the
  version that was being hoisted and the pinned style of its parents. **This is
  a real bug in maximal-electron, not an artifact of the copy** — worth fixing
  upstream.

### Workspace hygiene

- `maximal` and `maximal-core`: dropped the `simple-git-hooks` devDependency and
  stopped invoking it (`maximal-core`'s `prepare` is renamed to
  `prepare:hooks`). Two packages installing competing pre-commit hooks into one
  repo's `.git` is wrong, and `simple-git-hooks`' own postinstall crashes on
  Bun's `node_modules/.bun` layout, which failed `bun install` outright.
- `maximal`, `maximal-core`: added `"test": "bun test"`. Neither had a plain
  `test` script; Turborepo needs one to drive the task.
- `maximal-electron`: added `"build": "npm run build:package"` as an alias, so
  Turbo's `build` task picks it up.

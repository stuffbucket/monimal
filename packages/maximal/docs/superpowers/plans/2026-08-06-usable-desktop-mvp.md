# Usable Desktop MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a signed, notarized macOS Maximal desktop MVP that supervises a released two-listener core, presents a live Overview/Models/Usage/Clients workspace, supports resumable GitHub first run, provides workspace-native Settings, and passes executable release-artifact gates.

**Architecture:** Use maximal PR #423 (`origin/feat/macos-dmg-electron`) as the only client lineage and restack the workspace from #424 only after the runtime boundary exists. Electron main owns the private control connection, process lifecycle, persistence, and native actions; preload exposes a closed capability contract; the renderer validates unknown snapshots into one external store and renders pure documents. A prerequisite maximal-core minor release adds connection lifecycle, typed terminal auth reasons, and a loopback-only deterministic OAuth seam because v0.4.3 cannot satisfy the approved recovery contract; the required auth-reason field is a breaking `0.x` wire change.

**Tech Stack:** Electron 43, Electron Forge/Vite, React 19, TypeScript 5.9, Zod 4, Vitest, `@stuffbucket/maximal-core` v0.5.0 (created in Task 2), `stuffbucket-electron` v0.0.4, Bun only for compiling the core sidecar, npm for `client/`.

## Global Constraints

- Execute Maximal changes in an isolated worktree based exactly on `origin/feat/macos-dmg-electron`. Never switch or edit the unrelated dirty `/Users/brian/github/stuffbucket/maximal` checkout during implementation.
- Execute maximal-core changes in a separate worktree based on current `origin/main`. Follow maximal-core release and milestone rules.
- Read `CLAUDE.md`, `docs/commands.md`, `docs/architecture.md`, and `docs/code-style.md` before code work. Read `.design-context.md`, `docs/design/failure-modes.md`, and the relevant topic design document before each UI task.
- Preserve the package-manager split: npm owns `client/`; Bun only compiles maximal-core.
- Pin `stuffbucket-electron` to the immutable v0.0.4 release tarball. Do not adopt `@stuffbucket/maximal-electron` until a scoped package is published and a real authenticated registry install passes on the signing runner.
- Consume maximal-core v0.5.0 by immutable Git tag. The new GitHub Packages workflow in maximal-core #82 does not change this MVP dependency until package publication and signing-runner authentication are proven.
- Keep control and public proxy listeners as distinct types. Only the control listener is explicitly ephemeral; core owns public port `4141` plus fallback.
- Main owns the private control URL. The renderer never receives it, cannot issue arbitrary JSON-RPC methods, and cannot access unrestricted process, network, filesystem, or IPC APIs.
- Show only the public listener as **This session's tool endpoint**. Never expose credentials, private control URLs, raw environment values, or unrestricted paths in copy or diagnostics.
- Keep `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`. Do not broaden external navigation beyond validated HTTPS GitHub device-flow URLs and the shell's existing safe schemes.
- No fixture, preview route, or test sidecar may be selectable by a packaged build.
- Project catalog (#426), harness runtime (#425), automatic tool mutation, package-registry migration, auto-update, destructive/switching multi-account operations, and non-macOS installers remain out of scope.
- Every new check reports how many targets it inspected, fails on zero targets, and is deliberately broken once before acceptance.
- Each task ends at an independently reviewable test gate. Commit, push, PR, issue, tag, workflow-dispatch, and release commands run only after explicit user authorization for that outward action.

---

## File Structure

### Producer prerequisite (`maximal-core`)

- `src/lib/live/client.ts` — publish connection lifecycle alongside snapshots.
- `src/lib/config/settings-types.ts` — add typed terminal auth reason to the public `AuthStatus` union.
- `src/services/github/poll-access-token.ts` — preserve denial, expiry, and offline as typed failures.
- `src/lib/auth/auth-controller.ts` — map typed failures into `AuthStatus` without string matching.
- `src/lib/config/test-github-origin.ts` — accept a loopback OAuth origin only in explicit test mode.
- `src/lib/config/api-config.ts` — route OAuth and GitHub API calls through that guarded test seam.

### Electron main and preload (`maximal/client`)

- `client/src/main/core-ready.ts` — map the published ready line to distinct typed listener addresses.
- `client/src/main/core-environment.ts` — construct the sidecar environment from an allowlist.
- `client/src/main/diagnostics.ts` — bounded redacted diagnostic buffer.
- `client/src/main/core.ts` — spawn, identify, drain, terminate, and restart the owned sidecar.
- `client/src/main/control-session.ts` — own `ControlClient`, discovery, initial snapshot, and connection events.
- `client/src/main/startup.ts` — retry/quit startup loop and visible native failures.
- `client/src/main/json-store.ts` — versioned atomic JSON persistence primitive.
- `client/src/main/first-run-store.ts` — first-run persistence on `json-store.ts`.
- `client/src/main/preferences-store.ts` — local settings persistence on `json-store.ts`.
- `client/src/main/index.ts` — lifecycle composition and closed IPC registration.
- `client/src/preload/index.ts` — expose only the typed `MaximalBridge` contract.

### Shared boundary and renderer state

- `client/src/shared/contract/discovery.ts` — validate numeric protocol 2, methods, identity, and ports in main and renderer.
- `client/src/shared/contract/topics.ts` — schemas for auth, model entries, usage, and clients.
- `client/src/shared/contract/snapshot.ts` — total per-topic parsing with structured warnings.
- `client/src/shared/bridge.ts` — exact IPC event and action types shared by main, preload, and renderer.
- `client/src/renderer/store/createClientStore.ts` — validate bridge events and own document/lifecycle state.
- `client/src/renderer/store/useDocument.ts` — React `useSyncExternalStore` adapter.
- `client/src/renderer/store/foldCatalog.ts` — fold model entries independently.

### Product UI

- `client/src/renderer/documents/Overview.tsx` — engine/auth/public-endpoint status and guidance.
- `client/src/renderer/documents/Models.tsx` — resilient model catalog.
- `client/src/renderer/documents/Usage.tsx` — totals and model/provider rollups.
- `client/src/renderer/documents/Clients.tsx` — capability-gated active clients.
- `client/src/renderer/first-run/machine.ts` — exhaustive first-run and auth recovery reducer.
- `client/src/renderer/first-run/FirstRun.tsx` — resumable first-run presentation.
- `client/src/renderer/settings/singleton.ts` — one Settings document and invocation restoration.
- `client/src/renderer/settings/sections.ts` — eight capability-gated Settings sections.
- `client/src/renderer/settings/Settings.tsx` — settings navigation and transactional controls.
- `client/src/renderer/a11y/LiveRegion.tsx` — polite progress and persistent alerts.
- `client/src/renderer/a11y/focus.ts` — focus capture/restoration helpers.
- `client/src/renderer/a11y/reduced-motion.ts` — literal reduced-motion selector.
- `client/src/renderer/Workspace.tsx` — production workspace composition.
- `client/src/renderer/main.tsx` — boot composition only; no query-selected preview.

### Verification and delivery

- `client/tests/**/*.test.ts` — Vitest unit, component, contract, and boundary suites.
- `client/tests/fixtures/device-flow-server.ts` — deterministic GitHub device-flow fixture.
- `client/tests/fixtures/fake-core.ts` — unpackaged-app recovery fixture implementing the public protocol.
- `client/scripts/e2e-app.ts` — external CDP real-app harness.
- `client/scripts/verify-lock.mjs` — reject mutable or unsupported dependency resolution.
- `client/scripts/verify-package.mjs` — verify staged/package sidecar identity, digest, count, and location.
- `.github/workflows/ci.yml` — portable client checks plus required Apple-silicon package/E2E job.
- `.github/workflows/macos-release.yml` — the one Maximal dispatcher for the private signing builder.
- `.macos-builder/build.sh` — signed/notarized artifact assertions.

---

### Task 1: Establish the canonical client line and architecture sources

**Files:**
- Create in the execution worktree: `docs/decisions/0023-control-plane-jsonrpc-over-http-sse.md`
- Create in the execution worktree: `research_log/2026-08-04-codex-od-learnings-for-electron-client.md`
- Verify: `client/package.json`, `client/forge.config.ts`, `client/src/main/core.ts`

**Interfaces:**
- Consumes: maximal PR #423 at `origin/feat/macos-dmg-electron`.
- Produces: one clean Maximal implementation branch with the architecture sources cited by later tasks.

- [ ] **Step 1: Create the execution worktree from the exact PR base**

Invoke `superpowers:using-git-worktrees` with requested branch `feat/usable-desktop-mvp` and base ref `origin/feat/macos-dmg-electron`. Do not run a second `git switch` inside the worktree.

Verify inside the worktree:

```bash
test "$(git branch --show-current)" = "feat/usable-desktop-mvp"
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feat/macos-dmg-electron)"
test -z "$(git status --porcelain)"
```

Expected: all commands exit `0`.

- [ ] **Step 2: Restore the two architecture sources without merging another lineage**

```bash
git show origin/docs/electron-client-learnings:docs/decisions/0023-control-plane-jsonrpc-over-http-sse.md > docs/decisions/0023-control-plane-jsonrpc-over-http-sse.md
git show origin/docs/electron-client-learnings:research_log/2026-08-04-codex-od-learnings-for-electron-client.md > research_log/2026-08-04-codex-od-learnings-for-electron-client.md
```

- [ ] **Step 3: Prove this is the Forge/Vite product lineage**

```bash
node -e "const p=require('./client/package.json'); if(p.main!=='.vite/build/main.js') process.exit(1)"
test -f client/forge.config.ts
test -f client/src/main/core.ts
test -f client/src/renderer/main.tsx
```

Expected: all commands exit `0`. Stop if `client/main` is `dist/main.js`; that is the obsolete reference client.

- [ ] **Step 4: Run the untouched baseline**

```bash
cd client && npm ci && npm run typecheck
cd .. && bun run check:fast
```

Expected: both checks pass before implementation.

- [ ] **Step 5: Commit checkpoint (only with explicit authorization)**

```bash
git add docs/decisions/0023-control-plane-jsonrpc-over-http-sse.md research_log/2026-08-04-codex-od-learnings-for-electron-client.md
git commit -m "docs(client): restore Electron integration architecture sources"
```

---

### Task 2: Release the missing core client lifecycle and auth contracts

**Files (`maximal-core` worktree):**
- Modify: `src/lib/live/client.ts`
- Modify: `tests/live/control-client.test.ts`
- Modify: `src/lib/config/settings-types.ts`
- Modify: `src/services/github/poll-access-token.ts`
- Modify: `src/lib/auth/auth-controller.ts`
- Create: `src/lib/config/test-github-origin.ts`
- Modify: `src/lib/config/api-config.ts`
- Modify: `tests/auth-controller.test.ts`
- Modify: `tests/poll-access-token.test.ts`
- Create: `tests/test-github-origin.test.ts`
- Regenerate through project scripts: `dist/lib/client.*`, `dist/lib/settings-types.*`

**Interfaces:**
- Produces in v0.5.0:

```ts
export type ControlConnectionStatus =
  | { state: 'connecting' }
  | { state: 'connected' }
  | { state: 'reconnecting'; attempt: number; retryInMs: number }
  | { state: 'closed' }
export type ConnectionStatusListener = (status: ControlConnectionStatus) => void
export type AuthFailureReason = 'authorization_denied' | 'device_code_expired' | 'offline' | 'fatal'
```

- Adds `ControlClient.onConnectionStatus(listener): () => void`.
- Adds `reason: AuthFailureReason` to the `AuthStatus` error variant.
- Adds `MAXIMAL_TEST_GITHUB_ORIGIN`, honored only when `NODE_ENV=test` and the URL is loopback HTTP.

- [ ] **Step 1: Create a separate core worktree from current `origin/main`**

Run `git status` in the existing checkout first. Invoke `superpowers:using-git-worktrees` with branch `feat/desktop-client-contracts` and base `origin/main`. Verify the new worktree is clean and contains merge commit `c390c57` or a descendant.

- [ ] **Step 2: Write failing connection lifecycle tests**

Extend the file's real `Bun.serve` harness so `serve(hub, port = 0)` can rebind the same port, then add:

```ts
function waitForConnection(
  client: ControlClient,
  predicate: (status: ControlConnectionStatus) => boolean,
): Promise<void> {
  return new Promise((resolve) => {
    const off = client.onConnectionStatus((status) => {
      if (!predicate(status)) return
      off()
      resolve()
    })
  })
}

test('reports disconnect and fresh-snapshot reconnect', async () => {
  const hub = snapshotHub({ auth: { state: 'unauthenticated' } })
  const first = serve(hub)
  const port = Number(new URL(first.baseUrl).port)
  let releaseBackoff: (() => void) | undefined
  const client = new ControlClient({
    baseUrl: first.baseUrl,
    reconnectDelayMs: 25,
    maxReconnectDelayMs: 100,
    sleep: () => new Promise<void>((resolve) => { releaseBackoff = resolve }),
  })
  const statuses: ControlConnectionStatus[] = []
  client.onConnectionStatus((status) => statuses.push(status))
  void client.connect()
  await waitForConnection(client, (status) => status.state === 'connected')
  first.stop()
  await waitForConnection(client, (status) => status.state === 'reconnecting')
  const second = serve(hub, port)
  releaseBackoff?.()
  await waitForConnection(client, (status) =>
    status.state === 'connected'
    && statuses.filter((entry) => entry.state === 'connected').length === 2)
  client.close()
  second.stop()
  hub.dispose()
  expect(statuses).toContainEqual({ state: 'reconnecting', attempt: 1, retryInMs: 25 })
  expect(statuses.at(-1)).toEqual({ state: 'closed' })
})
```

Keep all waits bounded with the test file's timeout so a missing lifecycle transition fails instead of hanging.

- [ ] **Step 3: Run the lifecycle test and verify failure**

```bash
bun test tests/live/control-client.test.ts
```

Expected: FAIL because `onConnectionStatus` and `ControlConnectionStatus` do not exist.

- [ ] **Step 4: Implement connection lifecycle in `ControlClient`**

Add a status set, immediate subscription, and one transition method:

```ts
private connectionStatus: ControlConnectionStatus = { state: 'connecting' }
private readonly connectionListeners = new Set<ConnectionStatusListener>()

onConnectionStatus(listener: ConnectionStatusListener): () => void {
  this.connectionListeners.add(listener)
  listener(this.connectionStatus)
  return () => this.connectionListeners.delete(listener)
}

private setConnectionStatus(status: ControlConnectionStatus): void {
  this.connectionStatus = status
  for (const listener of this.connectionListeners) listener(status)
}
```

`connect()` emits `connecting` once, `connected` only after a valid feed frame, and `reconnecting` after a failed/closed stream with the exact next delay. `close()` emits `closed` once. Preserve fresh-snapshot reconnect and never add `Last-Event-ID`.

- [ ] **Step 5: Write failing typed auth-reason tests**

Use the existing injected `harness.pollAccessTokenImpl` seam in `auth-controller.test.ts`:

```ts
test.each([
  ['authorization_denied', 'Authorization denied by the user.'],
  ['device_code_expired', 'Device code expired before authorization.'],
  ['offline', 'GitHub remained unreachable.'],
] as const)('preserves terminal reason %s', async (reason, message) => {
  harness.pollAccessTokenImpl = () => Promise.reject(new DeviceFlowError(reason, message))
  await startDeviceFlow()
  await Bun.sleep(0)
  expect(getAuthStatus()).toMatchObject({ state: 'error', reason, error: message })
})
```

Add an injected plain `Error('malformed response')` case requiring `{ state: 'error', reason: 'fatal' }`. In `poll-access-token.test.ts`, drive the exact wire values `access_denied` and `expired_token` plus transport exhaustion and require the corresponding `DeviceFlowError.reason` before testing the controller mapping.

- [ ] **Step 6: Implement typed device-flow failures**

In `poll-access-token.ts`:

```ts
export class DeviceFlowError extends Error {
  constructor(readonly reason: AuthFailureReason, message: string) {
    super(message)
    this.name = 'DeviceFlowError'
  }
}
```

Throw `authorization_denied`, `device_code_expired`, and `offline` at their exact branches. In `auth-controller.ts`, map `DeviceFlowError.reason`; map unknown failures to `fatal`. Add `reason: AuthFailureReason` to the public Zod error variant. Do not infer a reason from message text.

- [ ] **Step 7: Write failing loopback-origin guard tests**

```ts
test.each(['http://127.0.0.1:43119', 'http://[::1]:43119'])('accepts loopback in test mode: %s', (origin) => {
  expect(resolveTestGitHubOrigin({ NODE_ENV: 'test', MAXIMAL_TEST_GITHUB_ORIGIN: origin })).toBe(origin)
})

test.each([
  { NODE_ENV: 'production', MAXIMAL_TEST_GITHUB_ORIGIN: 'http://127.0.0.1:43119' },
  { NODE_ENV: 'test', MAXIMAL_TEST_GITHUB_ORIGIN: 'https://github.example' },
  { NODE_ENV: 'test', MAXIMAL_TEST_GITHUB_ORIGIN: 'http://192.0.2.4:43119' },
])('rejects or ignores unsafe test origin %#', (env) => {
  expect(resolveTestGitHubOrigin(env)).toBeNull()
})
```

- [ ] **Step 8: Implement the guarded test origin**

`resolveTestGitHubOrigin(env)` returns a normalized origin only when `NODE_ENV === 'test'`, protocol is `http:`, hostname is `127.0.0.1` or `::1`, and the URL has no credentials, query, hash, or non-root path. `getGitHubBaseUrl()` and `getGitHubApiBaseUrl()` consult it before production/enterprise resolution. No production command sets this variable.

- [ ] **Step 9: Run core gates and binary E2E**

```bash
bun run check:fast
bun test tests/live/control-client.test.ts tests/auth-controller.test.ts tests/poll-access-token.test.ts tests/test-github-origin.test.ts
bun run e2e
bun run e2e:binary
bun run check:deep
```

Expected: all pass. The lifecycle test observes at least one reconnect and the origin test examines five cases.

- [ ] **Step 10: Release v0.5.0 (outward actions require separate approval)**

After authorization, open a `feat(client)!:` Conventional Commit PR assigned to the v0.5.0 milestone, merge only after required checks, run the release process from `docs/release-runbook.md`, and verify:

```bash
gh release view v0.5.0 --repo stuffbucket/maximal-core
gh api repos/stuffbucket/maximal-core/git/ref/tags/v0.5.0 --jq .object.sha
gh run list --repo stuffbucket/maximal-core --workflow publish-package.yml --limit 3
```

The release is not complete until the tag exists, binary artifacts pass, and package publication either succeeds or is explicitly recorded as non-blocking for the Git-tag consumer.

---

### Task 3: Pin released producers and implement secure core supervision

**Files:**
- Modify: `client/package.json`
- Modify: `client/package-lock.json`
- Create: `client/src/main/core-ready.ts`
- Create: `client/src/main/core-environment.ts`
- Create: `client/src/main/diagnostics.ts`
- Modify: `client/src/main/core.ts`
- Create: `client/src/main/control-session.ts`
- Create: `client/src/main/startup.ts`
- Modify: `client/src/main/index.ts`
- Modify: `client/scripts/build-core.ts`
- Create: `client/vitest.config.ts`
- Create: `client/tests/core-ready.test.ts`
- Create: `client/tests/core-environment.test.ts`
- Create: `client/tests/diagnostics.test.ts`
- Create: `client/tests/control-session.test.ts`
- Create: `client/tests/build-target.test.ts`

**Interfaces:**

```ts
export interface CoreAddresses {
  controlOrigin: string
  publicEndpoint: string
  controlPort: number
  proxyPort: number
  pid: number
}
export type CoreLifecycle =
  | { state: 'starting' }
  | { state: 'ready'; pid: number; publicEndpoint: string }
  | { state: 'stopped'; expected: boolean; message: string }
  | { state: 'failed'; message: string }
export interface BootstrapPayload {
  discovery: unknown
  snapshot: unknown
  lifecycle: CoreLifecycle
  publicEndpoint: string
}
```

- Produces `CoreSupervisor`, `ControlSession`, and a bounded `DiagnosticBuffer`.

- [ ] **Step 1: Install immutable producer artifacts**

```bash
cd client
npm install --save-exact "stuffbucket-electron@https://github.com/stuffbucket/maximal-electron/releases/download/v0.0.4/stuffbucket-electron-0.0.4.tgz"
npm install --save-dev --save-exact "@stuffbucket/maximal-core@github:stuffbucket/maximal-core#v0.5.0" vitest
```

Verify `package-lock.json` resolves shell v0.0.4 and the exact v0.5.0 commit over HTTPS. Reject codeload, SSH, branch, and `main` resolutions.

- [ ] **Step 2: Write and implement ready-line mapping tests**

```ts
it('keeps control and public listeners distinct', () => {
  expect(addressesFromReady({ v: 1, controlPort: 51234, proxyPort: 4142, pid: 99 })).toEqual({
    controlOrigin: 'http://127.0.0.1:51234',
    publicEndpoint: 'http://127.0.0.1:4142',
    controlPort: 51234,
    proxyPort: 4142,
    pid: 99,
  })
})
```

Implement `addressesFromReady(ready: ParsedReadyLine): CoreAddresses` using `ready.controlPort`, `ready.proxyPort`, and `ready.pid`. Never read `ready.port`.

- [ ] **Step 3: Write and implement the environment allowlist**

Test that `GITHUB_TOKEN`, `ANTHROPIC_API_KEY`, arbitrary values, and inherited `MAXIMAL_TEST_GITHUB_ORIGIN` are absent. Preserve only `PATH`, `HOME`, `TMPDIR`, `LANG`, `LC_ALL`, `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY`, then add `sidecarSpawnEnv()` values and the application-owned `COPILOT_API_HOME`.

```ts
export function coreEnvironment(source: NodeJS.ProcessEnv, appHome: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const key of CORE_ENV_ALLOWLIST) if (source[key] !== undefined) env[key] = source[key]
  return { ...env, ...sidecarSpawnEnv(), COPILOT_API_HOME: appHome }
}
```

- [ ] **Step 4: Write and implement bounded redacted diagnostics**

Require a 200-line maximum, replacement of bearer/token/key patterns, replacement of the private control origin, and preservation of actionable non-secret stderr.

```ts
const buffer = new DiagnosticBuffer({ maxLines: 2, privateOrigin: 'http://127.0.0.1:51234' })
buffer.push('ready http://127.0.0.1:51234')
buffer.push('authorization: Bearer secret')
buffer.push('third')
expect(buffer.lines()).toEqual(['authorization: Bearer <redacted>', 'third'])
```

- [ ] **Step 5: Correct sidecar build targets**

```ts
export function targetForHost(platform: NodeJS.Platform, arch: string): 'bun-darwin-arm64' | 'bun-windows-x64' {
  if (platform === 'darwin' && arch === 'arm64') return 'bun-darwin-arm64'
  if (platform === 'win32' && arch === 'x64') return 'bun-windows-x64'
  throw new Error(`maximal-core does not publish a binary target for ${platform}/${arch}`)
}
```

Tests require Darwin/ARM64 and Windows/x64 success and Linux/x64 plus Darwin/x64 failure. Do not invent `aarch64`, Linux, or Intel macOS targets.

- [ ] **Step 6: Implement owned-process supervision**

Spawn:

```ts
spawn(coreBinaryPath(), ['start', '--control-port', '0'], {
  env: coreEnvironment(process.env, isolatedHome()),
  stdio: ['ignore', 'pipe', 'pipe'],
})
```

Use `awaitReadyLine`, require `ready.pid === child.pid`, drain both streams for the full process lifetime, and terminate only the owned child. Graceful stop sends `SIGTERM`, waits five seconds, then uses `SIGKILL` only for the same still-running PID. A restart is user-triggered and single-flight; no automatic crash loop.

- [ ] **Step 7: Implement main-owned control preflight**

`ControlSession.start(addresses)` creates one v0.5.0 `ControlClient`, calls `server/discover`, subscribes to connection and state, starts `connect()` without awaiting its lifetime, and resolves only after a snapshot arrives within ten seconds. It returns `BootstrapPayload` containing unknown discovery/snapshot, lifecycle, and public endpoint—but never control origin.

Expose only `startAuthentication()`, `restartEngine()`, `readDiagnostics()`, and subscription methods. Do not expose `call(method: string)` outside main.

- [ ] **Step 8: Implement visible startup retry/quit**

`startup.ts` loops around supervisor plus preflight. On failure it terminates the child and uses `dialog.showMessageBox` with `Retry`, `Copy diagnostics`, and `Quit`. Copy uses only `DiagnosticBuffer.text()`. `Quit` calls `app.quit()`; the app never remains hidden with no explanation.

- [ ] **Step 9: Run focused gates**

```bash
cd client
npx vitest run tests/core-ready.test.ts tests/core-environment.test.ts tests/diagnostics.test.ts tests/control-session.test.ts tests/build-target.test.ts
npm run typecheck
npm run build:core
./resources/bin/maximal-core --version
```

Expected on Apple silicon: tests pass and binary prints `0.4.4`. On other hosts, `build:core` must fail with the explicit unsupported-target message and is deferred to the Apple-silicon job, not reported as passed.

- [ ] **Step 10: Commit checkpoint (only with explicit authorization)**

```bash
git add client/package.json client/package-lock.json client/vitest.config.ts client/src/main client/scripts/build-core.ts client/tests
git commit -m "feat(client): supervise the released Maximal core"
```

---

### Task 4: Require portable checks and Apple-silicon package identity

**Files:**
- Modify: `client/package.json`
- Create: `client/scripts/verify-lock.mjs`
- Create: `client/scripts/verify-package.mjs`
- Create: `client/tests/package-verifier.test.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/macos-release.yml`
- Modify: `.github/workflows/release.yml`
- Delete after proof: `.github/workflows/macos-build.yml`

**Interfaces:**
- Produces `npm run check:portable`, `npm run check:macos-package`, and one authoritative release dispatcher.

- [ ] **Step 1: Write the complete package-verifier module and failing tests**

```js
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

export function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function assertSameDigest(stagedPath, packagedPath) {
  const staged = sha256(stagedPath)
  const packaged = sha256(packagedPath)
  if (staged !== packaged) throw new Error(`Packaged sidecar digest mismatch: ${staged} != ${packaged}`)
}

export function assertVersion(path, expected) {
  const actual = execFileSync(path, ['--version'], { encoding: 'utf8', timeout: 5_000 }).trim()
  if (actual !== expected) throw new Error(`Expected maximal-core ${expected}; received ${actual}`)
}
```

Test identical/different digests, wrong version, zero packaged candidates, and two candidates. Candidate discovery must report its count and require exactly one `.app/Contents/Resources/bin/maximal-core` outside ASAR.

- [ ] **Step 2: Implement immutable lock verification**

`verify-lock.mjs` parses `package-lock.json`, requires one shell resolution equal to the v0.0.4 release asset, requires core resolution to the v0.5.0 tag commit, and rejects `git+ssh:`, `ssh://`, `git@github.com`, codeload, branches, and `main`. It prints `verified 2 immutable producer dependencies` and fails if the count differs.

- [ ] **Step 3: Split portable and macOS package commands**

```json
{
  "scripts": {
    "test": "vitest run",
    "verify:lock": "node scripts/verify-lock.mjs",
    "verify:package": "node scripts/verify-package.mjs",
    "check:portable": "npm run verify:lock && npm run typecheck && npm test",
    "check:macos-package": "npm run check:portable && npm run build:core && npm run package && npm run verify:package"
  }
}
```

Linux CI runs only `check:portable`. It must not attempt to execute or locate a macOS `.app`.

- [ ] **Step 4: Add required CI jobs**

- `client-portable`: `ubuntu-latest`, Node 24, `npm ci`, `npm run check:portable`.
- `client-macos-package`: `macos-14-xlarge` (Apple silicon), Node 24, Bun at the repository pin, `npm ci`, `npm run check:macos-package`, then real-app E2E after Task 10.

Both jobs use `client/package-lock.json` as the npm cache dependency and fail if their check reports zero targets.

- [ ] **Step 5: Reconcile release workflows**

Use authenticated `gh workflow list --repo stuffbucket/maximal` to prove which workflow dispatches the private builder. Keep `.github/workflows/macos-release.yml` as the one dispatcher. Remove legacy Tauri updater expectations from `.github/workflows/release.yml`. Delete `.github/workflows/macos-build.yml` only after searching workflow names, docs, open PRs, and release scripts finds zero references.

- [ ] **Step 6: Break each check deliberately**

1. Point shell lock resolution at codeload: `verify:lock` must fail.
2. Copy different bytes over the packaged sidecar: `verify:package` must fail on digest.
3. Remove the candidate: `verify:package` must fail on `examined 0 packaged sidecars`.

Restore with `npm ci` and `npm run package`; do not use a destructive Git command.

- [ ] **Step 7: Run both applicable gates**

```bash
cd client && npm run check:portable
```

On Apple silicon also run:

```bash
npm run check:macos-package
```

- [ ] **Step 8: Commit checkpoint (only with explicit authorization)**

```bash
git add client/package.json client/package-lock.json client/scripts client/tests/package-verifier.test.ts .github/workflows
git commit -m "ci(client): require Electron package identity checks"
```

---

### Task 5: Build the closed bridge and validated client store

**Files:**
- Create: `client/src/shared/bridge.ts`
- Create: `client/src/shared/contract/discovery.ts`
- Create: `client/src/shared/contract/topics.ts`
- Create: `client/src/shared/contract/snapshot.ts`
- Modify: `client/src/main/control-session.ts`
- Create: `client/src/renderer/store/createClientStore.ts`
- Create: `client/src/renderer/store/useDocument.ts`
- Create: `client/src/renderer/store/foldCatalog.ts`
- Modify: `client/src/main/index.ts`
- Modify: `client/src/preload/index.ts`
- Delete: `client/src/renderer/core-client.ts`
- Create: `client/tests/discovery.test.ts`
- Create: `client/tests/snapshot.test.ts`
- Create: `client/tests/client-store.test.ts`
- Create: `client/tests/fold-catalog.test.ts`
- Create: `client/tests/bridge-boundary.test.ts`

**Interfaces:**

```ts
export type WriteResult = { ok: true } | { ok: false; message: string }
export type StoreTopic = 'auth' | 'models' | 'usage' | 'clients'
export type CoreBridgeEvent =
  | { type: 'connection'; status: ControlConnectionStatus }
  | { type: 'snapshot'; snapshot: unknown }
  | { type: 'lifecycle'; lifecycle: CoreLifecycle }

export interface MaximalBridge {
  core: {
    readBootstrap(): Promise<BootstrapPayload>
    subscribe(listener: (event: CoreBridgeEvent) => void): () => void
    restart(): Promise<WriteResult>
    readDiagnostics(): Promise<string>
  }
  auth: { start(): Promise<WriteResult> }
  external: { openHttps(url: string): Promise<WriteResult> }
  firstRun: { read(): Promise<unknown>; write(value: unknown): Promise<WriteResult> }
  preferences: { read(): Promise<unknown>; update(value: unknown): Promise<WriteResult> }
}
```

```ts
export type DocumentStatus = 'loading' | 'ready' | 'degraded' | 'stale' | 'error'
export interface DocumentState<T> {
  status: DocumentStatus
  value: T | null
  warnings: string[]
  error: string | null
  receivedAt: number | null
}
```

- [ ] **Step 1: Write discovery tests with the exact numeric protocol**

```ts
it('accepts maximal-core protocol 2 and distinct ports', () => {
  expect(parseDiscovery({
    protocolVersion: 2,
    capabilities: { methods: ['server/discover', 'subscriptions/listen'], feed: true },
    identity: { name: 'maximal-core', version: '0.4.4' },
    ports: { control: 51234, proxy: 4141 },
  }).ports).toEqual({ control: 51234, proxy: 4141 })
})

it.each(['2', 1, null])('rejects unsupported protocol %#', (protocolVersion) => {
  expect(() => parseDiscovery(validDiscovery({ protocolVersion }))).toThrow(/protocolVersion/)
})
```

Implement in `shared/contract/discovery.ts` with `z.literal(2)`, identity `maximal-core`, required positive ports, and required methods `server/discover` plus `subscriptions/listen`. Update `ControlSession.start()` to call `parseDiscovery()` before it accepts bootstrap or creates a product window; the renderer parses the bridged value again because IPC remains an untrusted boundary.

- [ ] **Step 2: Implement topic schemas and resilient model folding**

Import `AuthStatus` and `ModelSummary` schemas from `@stuffbucket/maximal-core/settings-types`. Validate the models envelope as `{ models: z.array(z.unknown()), count: z.number().int(), loaded_at: z.string().nullable() }`, then parse every entry with `ModelSummary.safeParse`.

Define exact usage and clients schemas from the v0.5.0 `ControlSnapshot` contract. `parseTopic` returns:

```ts
export type TopicParseResult<T> =
  | { ok: true; value: T; warnings: string[] }
  | { ok: false; issues: string[] }
```

One malformed model yields one warning and preserves every valid entry. Invalid auth/usage/clients data does not enter trusted state. Keep these schemas under `shared/contract/`; update `ControlSession.start()` to resolve bootstrap only after `parseSnapshot()` accepts the initial state, so window creation follows a valid discovery and snapshot rather than merely the first SSE frame.

- [ ] **Step 3: Write the bridge allowlist test before IPC code**

Test the exposed object keys exactly:

```ts
expect(deepKeys(window.maximal)).toEqual([
  'auth.start',
  'core.readBootstrap', 'core.readDiagnostics', 'core.restart', 'core.subscribe',
  'external.openHttps',
  'firstRun.read', 'firstRun.write',
  'preferences.read', 'preferences.update',
])
```

Also require rejection of channel names `core:origin`, `core:call`, `accounts:remove`, `accounts:switch`, `app:quit`, and `app:upgrade`.

- [ ] **Step 4: Implement closed main/preload IPC**

Main registers constants from `shared/bridge.ts`; preload exposes functions, never `ipcRenderer`. Remove `installCoreCorsShim`, `core:origin`, and every private-origin bridge. Validate renderer-supplied values again in main. `external.openHttps` accepts only `https:` and only the host/path in the current auth status verification URL; it rejects credentials, fragments, and unrelated origins.

- [ ] **Step 5: Write store transition tests**

Use an injected `MaximalBridge` fake:

```ts
it('keeps the last valid snapshot as stale while core reconnects', async () => {
  const bridge = createBridgeFake(validBootstrap)
  const store = createClientStore({ bridge, now: () => 100 })
  await store.start()
  bridge.emit({ type: 'connection', status: { state: 'reconnecting', attempt: 1, retryInMs: 500 } })
  expect(store.getDocument('models')).toMatchObject({ status: 'stale', value: validModels })
  bridge.emit({ type: 'snapshot', snapshot: replacementSnapshot })
  expect(store.getDocument('models')).toMatchObject({ status: 'ready', value: replacementModels })
})
```

Add invalid notification, unsupported Clients capability, lifecycle stopped, and restart success/failure cases.

- [ ] **Step 6: Implement one external store**

The store calls `readBootstrap()` once, validates discovery/snapshot, subscribes once, and exposes:

```ts
export interface ClientStore {
  start(): Promise<void>
  stop(): void
  getDocument<T>(topic: StoreTopic): DocumentState<T>
  getLifecycle(): CoreLifecycle
  getDiscovery(): Discovery | null
  getPublicEndpoint(): string | null
  subscribe(topic: StoreTopic | 'lifecycle', listener: () => void): () => void
  startAuthentication(): Promise<WriteResult>
  restartEngine(): Promise<WriteResult>
}
```

It has no generic `invoke` method. Invalid updates retain the last valid value as degraded; reconnect retains it as stale; the next complete snapshot replaces it. No interval and no `Last-Event-ID` exist.

- [ ] **Step 7: Add the React adapter and remove the renderer network client**

`useDocument` uses `useSyncExternalStore`. Delete `renderer/core-client.ts`, its three-second polling fallback, and direct renderer `fetch` calls.

- [ ] **Step 8: Run boundary gates**

```bash
cd client
npx vitest run tests/discovery.test.ts tests/snapshot.test.ts tests/client-store.test.ts tests/fold-catalog.test.ts tests/bridge-boundary.test.ts
npm run typecheck
```

- [ ] **Step 9: Commit checkpoint (only with explicit authorization)**

```bash
git add client/src/shared client/src/main/index.ts client/src/main/control-session.ts client/src/preload client/src/renderer/store client/tests
git rm client/src/renderer/core-client.ts
git commit -m "feat(client): add a closed validated control bridge"
```

---

### Task 6: Convert the spatial preview into live product documents

**Files:**
- Create: `client/src/renderer/documents/DocumentStateView.tsx`
- Create: `client/src/renderer/documents/Overview.tsx`
- Create: `client/src/renderer/documents/Models.tsx`
- Create: `client/src/renderer/documents/Usage.tsx`
- Create: `client/src/renderer/documents/Clients.tsx`
- Create: `client/src/renderer/Workspace.tsx`
- Modify: `client/src/renderer/preview/WorkspacePreview.tsx`
- Modify: `client/src/renderer/main.tsx`
- Modify: `client/src/renderer/styles/workspace-preview.css`
- Modify: `client/vitest.config.ts`
- Create: `client/tests/setup.ts`
- Create: `client/tests/documents.test.tsx`
- Create: `client/tests/production-boundary.test.ts`

**Interfaces:**
- Consumes `ClientStore`, `DocumentState<T>`, and shell renderer primitives.
- Produces `Workspace({ store }: { store: ClientStore })` with Overview, Models, Usage, and capability-gated Clients.

- [ ] **Step 1: Add component-test dependencies and setup**

```bash
cd client
npm install --save-dev --save-exact @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

Configure Vitest `environment: 'jsdom'` for component tests and import `@testing-library/jest-dom/vitest` from `tests/setup.ts`.

- [ ] **Step 2: Write failing document-state tests**

Require loading, ready, degraded, stale, empty, and error rendering. Require one primary heading per document. Require a malformed model warning while a valid model remains visible. Require Clients navigation and document to be absent when discovery lacks `clients/list`.

- [ ] **Step 3: Implement shared and product documents**

- Overview: core v0.5.0 health, authentication summary, public endpoint labelled **This session's tool endpoint**, manual connection guidance, and no control URL.
- Models: valid folded entries, capability flags, context/output limits, and per-entry warnings.
- Usage: daily totals plus model/provider lists and explicit zero-request empty state.
- Clients: label, user agent, and age only when `clients/list` is advertised.

Documents receive state props or use store selectors; none reads `window.maximal` directly.

- [ ] **Step 4: Promote the workspace composition**

Move shell structure from `WorkspacePreview` into `Workspace`. The rail contains product navigation/status only. Remove project, session, harness, approval, and invented assistant controls from production. Unsupported capabilities remove actions rather than disable promises.

Production `main.tsx` always renders `Workspace`; no query string chooses a preview. Development fixtures remain importable only from the preview entry used by visual tooling.

- [ ] **Step 5: Prove preview exclusion**

`production-boundary.test.ts` scans the production renderer entry and packaged renderer bundle for `preview=workspace`, fixture project names, and a runtime import of `WorkspacePreview`. It reports examined files and fails on zero. Source preview files may exist; no production import path may reach them.

- [ ] **Step 6: Run UI and design gates**

```bash
cd client && npm test && npm run typecheck && npm run package
cd .. && bun run check:design && bun run check:fast
```

Invoke `ui-layout-verification` against the real 1280×820 window and 880×560 minimum for light/dark themes and loading/empty/degraded/stale/error states.

- [ ] **Step 7: Commit checkpoint (only with explicit authorization)**

```bash
git add client/src/renderer client/tests client/vitest.config.ts client/package.json client/package-lock.json
git commit -m "feat(client): render the live Maximal workspace"
```

---

### Task 7: Implement resumable first run and deterministic device flow

**Files:**
- Create: `client/src/main/json-store.ts`
- Create: `client/src/main/first-run-store.ts`
- Modify: `client/src/main/index.ts`
- Modify: `client/src/preload/index.ts`
- Create: `client/src/renderer/first-run/machine.ts`
- Create: `client/src/renderer/first-run/FirstRun.tsx`
- Create: `client/src/renderer/a11y/LiveRegion.tsx`
- Create: `client/tests/json-store.test.ts`
- Create: `client/tests/first-run-machine.test.ts`
- Create: `client/tests/first-run-store.test.ts`
- Create: `client/tests/device-flow.test.ts`
- Create: `client/tests/fixtures/device-flow-server.ts`

**Interfaces:**

```ts
export type ActiveFirstRunState =
  | { kind: 'launching' }
  | { kind: 'coreReadySignedOut' }
  | { kind: 'deviceCode'; code: string; verificationUrl: string; expiresAt: string }
  | { kind: 'polling'; code: string; verificationUrl: string; expiresAt: string }
  | { kind: 'authenticated'; login: string }
  | { kind: 'endpointReview'; publicEndpoint: string }
  | { kind: 'complete' }
  | { kind: 'coreFailed'; message: string }
  | { kind: 'authorizationDenied' }
  | { kind: 'deviceCodeExpired' }
  | { kind: 'fatalProtocolError'; message: string }
  | { kind: 'fatalAuthenticationError'; message: string }
export type FirstRunState = ActiveFirstRunState | { kind: 'offline'; resume: ActiveFirstRunState }
```

- [ ] **Step 1: Write exhaustive reducer tests**

Cover the required path and every recovery discriminant. The default branch calls:

```ts
function assertNever(value: never): never {
  throw new Error(`Unhandled first-run event: ${JSON.stringify(value)}`)
}
```

Map `AuthStatus.error.reason` directly: `authorization_denied`, `device_code_expired`, `offline`, and `fatal`. Never match error prose.

- [ ] **Step 2: Implement the pure state machine**

A transient offline event wraps the current active state and reconnect restores it if the device code has not expired. Expiry, denial, fatal auth, fatal protocol, and core failure remain distinct. Completion requires authentication and endpoint review only.

- [ ] **Step 3: Write atomic JSON-store tests**

Inject a temporary path and filesystem adapter. Require `write temp -> fsync -> rename`, version/schema rejection, absent-file default, preservation of corrupt source, and no symlink-following at the temp path.

- [ ] **Step 4: Implement first-run persistence**

`json-store.ts` provides the tested atomic primitive. `first-run-store.ts` owns a versioned Zod schema containing completed required steps, active non-secret device-flow presentation, and explicit optional choices. It never stores tokens. IPC accepts a value, not a path, and validates again in main.

- [ ] **Step 5: Implement the deterministic OAuth fixture**

The fixture serves device code, token poll, GitHub user, and Copilot token endpoints. It scripts `authorization_pending`, `slow_down`, denied, expired, offline, malformed, and success responses.

The integration test spawns the real v0.5.0 binary with:

```ts
{
  NODE_ENV: 'test',
  MAXIMAL_TEST_GITHUB_ORIGIN: fixture.origin,
  COPILOT_API_HOME: temporaryHome,
}
```

and arguments `start --control-port 0 --port 0`. It drives `auth/start` through the private control listener and observes `subscriptions/listen`. The test records requested hosts and requires every request host to equal the loopback fixture host.

- [ ] **Step 6: Implement accessible first-run UI**

Use one heading, polite live progress, persistent `role="alert"` failures, a selectable/copyable tabular-monospace code, validated HTTPS browser opening, and visible manual URL fallback. Restore persisted progress after a new window/store instance. Do not add project scanning, assistant enablement, or tool mutation.

- [ ] **Step 7: Run unit and real-binary integration gates**

```bash
cd client
npx vitest run tests/json-store.test.ts tests/first-run-machine.test.ts tests/first-run-store.test.ts tests/device-flow.test.ts
npm run typecheck
```

Expected: every auth terminal reason is observed from the real sidecar and fixture logs contain only the loopback host.

- [ ] **Step 8: Commit checkpoint (only with explicit authorization)**

```bash
git add client/src/main/json-store.ts client/src/main/first-run-store.ts client/src/main/index.ts client/src/preload client/src/renderer/first-run client/src/renderer/a11y client/tests
git commit -m "feat(client): add resumable first-run authentication"
```

---

### Task 8: Add persistent singleton workspace Settings

**Files:**
- Create: `client/src/main/preferences-store.ts`
- Modify: `client/src/main/index.ts`
- Modify: `client/src/preload/index.ts`
- Create: `client/src/renderer/settings/singleton.ts`
- Create: `client/src/renderer/settings/sections.ts`
- Create: `client/src/renderer/settings/Settings.tsx`
- Modify: `client/src/renderer/Workspace.tsx`
- Modify: `client/src/renderer/styles/workspace-preview.css`
- Create: `client/tests/preferences-store.test.ts`
- Create: `client/tests/settings-singleton.test.ts`
- Create: `client/tests/settings.test.tsx`

**Interfaces:**

```ts
export interface Preferences {
  version: 1
  theme: 'system' | 'light' | 'dark'
  launchAtLogin: boolean
  layout: { railWidth: number; inspectorWidth: number }
  privacy: { allowProjectScanning: false; shareDiagnostics: boolean }
}
export interface WorkspaceInvocation {
  tabId: string
  controlId: string | null
  layout: { rail: number; canvas: number; inspector: number }
  scrollTop: number
}
```

- [ ] **Step 1: Write preference transaction tests**

Require restart persistence for theme/layout/privacy, schema rejection, rollback when `app.setLoginItemSettings` fails, and immutable `allowProjectScanning: false` for the MVP. Main owns the file path and returns `{ ok: false, message }` without leaking it.

- [ ] **Step 2: Implement exact writable and read-only settings**

Writable:

- General: theme and launch at login.
- Layout: rail width, inspector width, reset defaults.
- Privacy: diagnostic sharing; project scanning remains read-only off.

Read-only/capability-gated:

- Account & Connections: current auth and start-auth action only when signed out.
- Core: version, numeric protocol, public endpoint, listener health, copy redacted diagnostics.
- Assistant: unavailable until an advertised capability exists.
- Updates: **No update channel is configured** with no Update button.
- Advanced: copy redacted diagnostics; no raw path or environment display.

`preferences.update` writes atomically. Launch-at-login calls the Electron API first, persists only on success, and restores the prior renderer value on failure.

- [ ] **Step 3: Write singleton/restoration tests**

Require one Settings tab, `Cmd-,` focus, active section `aria-current`, hidden inspector, focus to the selected section heading, and exact restoration of tab/control/layout/scroll on close.

- [ ] **Step 4: Implement Settings controller and sections**

`open(invocation)` captures only the first invocation while open; repeated calls focus the existing document. `close()` returns that exact invocation and clears it. Unsupported write capabilities remove controls; they do not show disabled future promises.

- [ ] **Step 5: Run interaction and design verification**

```bash
cd client && npx vitest run tests/preferences-store.test.ts tests/settings-singleton.test.ts tests/settings.test.tsx && npm run typecheck
cd .. && bun run check:design
```

Run `ui-layout-verification` for all eight sections, keyboard-only navigation, light/dark themes, 880×560 minimum, long rollback errors, and no inspector while Settings is active.

- [ ] **Step 6: Commit checkpoint (only with explicit authorization)**

```bash
git add client/src/main/preferences-store.ts client/src/main/index.ts client/src/preload client/src/renderer/settings client/src/renderer/Workspace.tsx client/src/renderer/styles client/tests
git commit -m "feat(client): add workspace-native Settings"
```

---

### Task 9: Implement runtime recovery, focus, and reduced motion

**Files:**
- Modify: `client/src/main/core.ts`
- Modify: `client/src/main/index.ts`
- Create: `client/src/renderer/a11y/focus.ts`
- Create: `client/src/renderer/a11y/reduced-motion.ts`
- Create: `client/src/renderer/recovery/EngineStopped.tsx`
- Modify: `client/src/renderer/Workspace.tsx`
- Modify: `client/src/renderer/styles/workspace-preview.css`
- Create: `client/tests/core-lifecycle.test.ts`
- Create: `client/tests/focus.test.ts`
- Create: `client/tests/reduced-motion.test.tsx`
- Create: `client/tests/engine-stopped.test.tsx`

**Interfaces:**
- Produces a user-triggered single-flight `restartEngine()` and literal `useReducedMotion(): boolean`.

- [ ] **Step 1: Write lifecycle recovery tests**

Require unexpected exit -> visible stopped lifecycle + retained diagnostics; one click -> one restart; failed restart -> persistent actionable error; successful restart -> new PID, new discovery/snapshot, fresh documents; quit -> no restart and no owned child after five seconds.

- [ ] **Step 2: Implement runtime stop/restart propagation**

Main sends lifecycle events through the closed bridge. `EngineStopped` keeps stale documents visible behind a persistent recovery surface, gives `Restart engine` and `Copy diagnostics`, disables restart only while the one request is in flight, and never starts an automatic loop.

- [ ] **Step 3: Write and implement focus helpers**

Capture active element by stable control id; restore it only if still connected and focusable, otherwise focus the invoking document heading. Tests cover removed controls and Settings close.

- [ ] **Step 4: Write and implement literal reduced motion**

```ts
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, readReducedMotion, () => true)
}
```

`readReducedMotion()` uses `matchMedia('(prefers-reduced-motion: reduce)')`. CSS under that query sets transition/animation duration to `0.01ms`, iteration count to `1`, and disables smooth scrolling. Tests toggle a matchMedia fake and require both hook state and the production CSS rule.

- [ ] **Step 5: Run recovery and accessibility gates**

```bash
cd client
npx vitest run tests/core-lifecycle.test.ts tests/focus.test.ts tests/reduced-motion.test.tsx tests/engine-stopped.test.tsx
npm run typecheck
```

Run the browser accessibility audit against first run, workspace, Settings, stale state, and Engine stopped. Fix every serious/critical finding.

- [ ] **Step 6: Commit checkpoint (only with explicit authorization)**

```bash
git add client/src/main client/src/renderer/a11y client/src/renderer/recovery client/src/renderer/Workspace.tsx client/src/renderer/styles client/tests
git commit -m "feat(client): add accessible engine recovery"
```

---

### Task 10: Restore real-app CDP and packaged-boundary coverage

**Files:**
- Create: `client/scripts/e2e-app.ts` from the proven reference harness, then adapt it
- Create: `client/tests/fixtures/fake-core.ts`
- Create: `client/src/main/e2e-sidecar.ts`
- Modify: `client/src/main/core.ts`
- Modify: `client/package.json`
- Modify: `client/tests/production-boundary.test.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces `npm run e2e:app`, `npm run e2e:packaged`, and CI failure artifacts with logs/screenshots.

- [ ] **Step 1: Restore the external CDP harness**

Recover `client/scripts/e2e-app.ts` from `origin/feat/electron-client`. Keep its external CDP connection, bounded target wait, `Runtime.evaluate`, painted-content polling, and fail-fast reporter. Replace obsolete `renderer/index.html`, `window.maximal.boot()`, and one-port assumptions with Forge/Vite, the closed bridge, and separate public/control assertions.

- [ ] **Step 2: Implement an unpackaged-only fixture sidecar seam**

```ts
export function e2eSidecarPath(appIsPackaged: boolean, env: NodeJS.ProcessEnv): string | null {
  if (appIsPackaged) return null
  const candidate = env.MAXIMAL_E2E_CORE_PATH
  return candidate && path.isAbsolute(candidate) ? candidate : null
}
```

`fake-core.ts` emits the real v1 ready line, protocol-2 discovery, POST SSE snapshots, a public `/v1` response, scripted malformed model/auth/lifecycle states, and no credentials. It lives under tests and is never copied by Forge.

A packaged-boundary test launches the packaged app with `MAXIMAL_E2E_CORE_PATH` set and proves the app ignores it and launches the bundled v0.5.0 sidecar.

- [ ] **Step 3: Add deterministic unpackaged scenarios**

Drive clean first run success, authorization denied, device-code expiry, offline/resume, malformed model with valid siblings retained, startup failure retry/quit, sidecar exit/user restart, Settings singleton/restoration, keyboard-only paths, and reduced-motion mode. Each scenario has a bounded timeout and reports observed state on failure.

- [ ] **Step 4: Add real v0.5.0 sidecar scenarios**

Use the deterministic OAuth loopback server for auth scenarios. For coexistence, start one user-run core on public 4141, launch the desktop-owned core, require the desktop public port to be the core-selected next port, and send successful compatible `/v1` requests to both. Require different PIDs and control ports.

- [ ] **Step 5: Add packaged real-sidecar smoke**

Package, verify digest, launch the `.app`, require no test seam selection, validate discovery identity/version, paint Overview/Models/Usage, open/close Settings, send one compatible public `/v1` request, quit, and require no owned sidecar PID remains.

- [ ] **Step 6: Scan the shipping boundary**

`production-boundary.test.ts` inspects at least one main bundle, preload bundle, renderer bundle, and packaged resource list. It rejects fixture files in resources, query-selected preview, raw `ipcRenderer`, `core:origin`, unrestricted `core:call`, and presentation of a private control URL. It prints counts and fails on zero in every category.

- [ ] **Step 7: Run real-app suites**

```bash
cd client
npm run build:core
npm run e2e:app
npm run package
npm run verify:package
npm run e2e:packaged
```

Expected: every deterministic scenario passes; packaged app uses the bundled v0.5.0 binary; compatible public request succeeds; child PID disappears on quit.

- [ ] **Step 8: Make Apple-silicon E2E required**

Append `npm run e2e:app` and `npm run e2e:packaged` to `client-macos-package` in `.github/workflows/ci.yml`. Upload diagnostics and screenshots only on failure after redaction.

- [ ] **Step 9: Commit checkpoint (only with explicit authorization)**

```bash
git add client/scripts/e2e-app.ts client/tests client/src/main/e2e-sidecar.ts client/src/main/core.ts client/package.json .github/workflows/ci.yml
git commit -m "test(client): verify the real Electron application"
```

---

### Task 11: Prove and cut the exact signed MVP artifact

**Files:**
- Modify only when evidence requires repair: `.macos-builder/build.sh`
- Modify only when evidence requires repair: `.macos-builder/config`
- Modify: `docs/release-runbook.md`
- Update GitHub issue/PR state only after evidence exists

**Interfaces:**
- Consumes the exact Maximal implementation commit, core v0.5.0 tag, and shell v0.0.4 release asset.
- Produces a notarized DMG, checksum, verification report, and evidence-linked issue disposition.

- [ ] **Step 1: Run all local release gates from a clean tree**

```bash
test -z "$(git status --porcelain)"
cd client && npm ci && npm run check:portable
cd .. && bun run check:deep
```

On Apple silicon:

```bash
cd client && npm run check:macos-package && npm run e2e:app && npm run e2e:packaged
```

Do not call the release ready if Apple-silicon or real-app gates were skipped.

- [ ] **Step 2: Record immutable identity**

```bash
git rev-parse HEAD
node -p "require('./client/package-lock.json').packages['node_modules/@stuffbucket/maximal-core'].resolved"
node -p "require('./client/package-lock.json').packages['node_modules/stuffbucket-electron'].resolved"
shasum -a 256 client/resources/bin/maximal-core
```

Require the core v0.5.0 tag commit and shell v0.0.4 release URL.

- [ ] **Step 3: Create the Maximal release tag only after explicit approval**

Follow `docs/release-runbook.md`. After the approved release command creates the immutable tag, derive rather than guess it:

```bash
VERSION="$(node -p "require('./package.json').version")"
TAG="v${VERSION}"
test "$(git rev-list -n 1 "$TAG")" = "$(git rev-parse HEAD)"
```

A pushed tag is never moved. A failed build gets the next patch version.

- [ ] **Step 4: Dispatch the private signing builder only after explicit approval**

```bash
VERSION="$(node -p "require('./package.json').version")"
gh workflow run build.yml --repo stuffbucket/macos-builder --ref main \
  -f repo=stuffbucket/maximal -f ref="v${VERSION}"
```

Record the returned run URL and exact tag commit.

- [ ] **Step 5: Verify the downloaded artifact independently**

```bash
shasum -a 256 -c Maximal.dmg.sha256
xcrun stapler validate Maximal.dmg
spctl -a -t open -vv Maximal.dmg
hdiutil attach Maximal.dmg
codesign --verify --deep --strict --verbose=2 /Volumes/Maximal/Maximal.app
spctl -a -vv /Volumes/Maximal/Maximal.app
/Volumes/Maximal/Maximal.app/Contents/Resources/bin/maximal-core --version
```

Expected: checksum passes, staple validates, Gatekeeper accepts DMG and app, nested signatures pass, and sidecar prints `0.4.4`.

- [ ] **Step 6: Run clean-user-data acceptance against the mounted app**

Complete without a terminal inside the product: install/open, device-flow sign in, endpoint review, all capability-gated documents, Settings restoration, one real compatible public `/v1` request, network interruption/stale/reconnect recovery, and quit with no owned sidecar. Capture executable harness output plus artifact checksum; screenshots alone are insufficient.

- [ ] **Step 7: Update issue dispositions after separate outward-action approval**

- Close #408 only with supervision, coexistence, shutdown, and restart evidence.
- Close #409 only with real-binary deterministic auth and recovery evidence.
- Close #416 only with malformed-entry resilience evidence.
- Close #420 only when both client CI jobs are required.
- Close #421 when v0.0.4 release-asset pin and package checks merge.
- Update #412 to mark macOS packaging complete and retain cross-platform work.
- Keep #425, #426, #428, updater, broader i18n, and non-macOS installers open.
- Rewrite stale #417 checklist entries to cite the released producer contracts and artifact evidence.

- [ ] **Step 8: Final verification report**

Report exact Maximal commit/tag, core tag/commit, shell asset URL, sidecar digest, every command and exit status, required CI URLs, builder URL, DMG checksum, signing/notarization/Gatekeeper results, clean-user acceptance, deferred scope, and residual uncertainty. Never report a command that was not run.

---

## Execution Order and Review Gates

1. **Producer gate — Tasks 1–2:** reject execution if core v0.5.0 is not released with tested lifecycle/auth/test-origin contracts or if the Maximal branch is not #423 lineage.
2. **Native boundary gate — Tasks 3–5:** reject mutable dependencies, one-listener collapse, inherited secrets, unbounded diagnostics, hidden startup failure, renderer control URL, generic RPC invocation, polling, or unvalidated state.
3. **Product gate — Tasks 6–9:** reject fixture-backed production, dead controls, inaccessible recovery, non-resumable first run, duplicate Settings, context loss, automatic crash loops, or non-literal reduced motion.
4. **Artifact gate — Tasks 10–11:** reject source-only evidence, vacuous checks, skipped Apple-silicon/real-app tests, digest mismatch, unsigned nested code, missing notarization, test seam selection in package, or unapproved outward actions.

## Plan Self-Review

- **Spec coverage:** Repository ownership, immutable releases, two listeners, allowlisted supervision, PID/lifecycle, bounded redacted diagnostics, preflight discovery/snapshot, closed bridge, validated store, fresh-snapshot reconnect, Overview/Models/Usage/Clients, resilient model folding, resumable first run, typed auth recovery, singleton Settings, transactional preferences, startup/runtime failure surfaces, keyboard/focus/live regions/reduced motion, portable and Apple-silicon CI, real-app CDP, coexistence, package identity, signing/notarization, and clean-user acceptance each map to an implementation and test task.
- **Producer feasibility:** The plan no longer claims v0.4.3 exposes disconnect or typed denial/expiry. Task 2 creates and releases those contracts before the client pin moves.
- **Security boundary:** Private control transport and unrestricted method dispatch stay in main. Preload exposes an exact allowlist; the renderer receives unknown data to validate, public endpoint, and four narrow action groups.
- **Deferred scope:** Project catalog, harness runtime, registry migration, updater, destructive account operations, and non-macOS distribution are explicitly absent from implementation steps.
- **Placeholder scan:** No placeholder markers, stub implementation, omitted edge-case instruction, or guessed release tag remains. Runtime-derived release variables replace an unknowable future tag literal.
- **Type consistency:** Numeric protocol `2`, `CoreAddresses.publicEndpoint`, `BootstrapPayload`, `ControlConnectionStatus`, `AuthFailureReason`, `DocumentState<T>`, `ClientStore`, `ActiveFirstRunState`, `FirstRunState`, `Preferences`, and `WorkspaceInvocation` retain one definition and spelling across producers and consumers.

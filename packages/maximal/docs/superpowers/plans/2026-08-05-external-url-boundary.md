# External URL Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce `http:`, `https:`, and `mailto:` at generic `maximal-electron` openers and the narrower `https:`-only contract at the maximal device-flow opener.

**Architecture:** Each repository enforces its own main-process sink. `maximal-electron` reuses its existing tested predicate; `maximal` adds an Electron-free local predicate because its IPC channel is separate and the shell predicate is not a public export.

**Tech Stack:** TypeScript, Electron, Vitest in `maximal-electron`, Bun test in `maximal`.

## Global Constraints

- Work in isolated worktrees; do not touch either dirty primary checkout.
- Preserve unconditional denial/prevention of unsafe popup and cross-origin navigation.
- Do not add a shared package, public shell export, IPC channel, dependency update, or renderer change.
- Treat this as a T2 security-boundary change and use a fresh read-only reviewer after implementation.
- Report only commands actually run.

---

### Task 1: Guard maximal-electron OS URL sinks

**Files:**
- Modify: `/Users/brian/github/stuffbucket/electron/src/host/host-window.ts`
- Modify: `/Users/brian/github/stuffbucket/electron/src/main/windows/main-window.ts`
- Modify: `/Users/brian/github/stuffbucket/electron/tests/host-window.test.ts`
- Regenerate: `/Users/brian/github/stuffbucket/electron/dist/host/host-window.js`
- Regenerate: `/Users/brian/github/stuffbucket/electron/dist/shared/urls.js`
- Regenerate: `/Users/brian/github/stuffbucket/electron/dist/shared/urls.d.ts`

**Interfaces:**
- Consumes: `isSafeExternalUrl(raw: string): boolean` from `src/shared/urls.ts`.
- Produces: Existing host and reference-window APIs with unsafe schemes blocked at every `shell.openExternal` call.

- [ ] **Step 1: Extend the host-window handler test with unsafe schemes**

In the existing handler test in `tests/host-window.test.ts`, retain the safe HTTPS assertions and add isolated negative assertions equivalent to:

```ts
openExternal.mockClear()
windowOpenHandler?.({ url: 'file:///tmp/private' })
expect(openExternal).not.toHaveBeenCalled()

openExternal.mockClear()
const unsafeNavigation = { preventDefault: vi.fn() }
willNavigateHandler?.(unsafeNavigation, 'vscode://file/tmp/private')
expect(unsafeNavigation.preventDefault).toHaveBeenCalledOnce()
expect(openExternal).not.toHaveBeenCalled()
```

Use the test file's existing mock and captured-handler names rather than creating a second Electron mock harness.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm test -- tests/urls.test.ts tests/host-window.test.ts
```

Expected: the new negative assertions fail because `shell.openExternal` receives the unsafe URLs.

- [ ] **Step 3: Guard both host-window sinks**

In `src/host/host-window.ts`, import the existing predicate:

```ts
import { isSafeExternalUrl } from '../shared/urls.js'
```

Change the popup handler to preserve unconditional denial:

```ts
window.webContents.setWindowOpenHandler(({ url }) => {
  if (isSafeExternalUrl(url)) void shell.openExternal(url)
  return { action: 'deny' }
})
```

Change cross-origin navigation so it is always prevented but only safe schemes are opened:

```ts
window.webContents.on('will-navigate', (event, url) => {
  const current = window.webContents.getURL()
  if (current && new URL(url).origin !== new URL(current).origin) {
    event.preventDefault()
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
  }
})
```

Do not redesign origin comparison in this task.

- [ ] **Step 4: Guard the duplicated reference-window sinks**

In `src/main/windows/main-window.ts`, import the same predicate and apply the same conditional call at its popup and cross-origin navigation handlers. Preserve its current same-origin behavior and `preventDefault()` behavior.

- [ ] **Step 5: Run focused verification**

Run:

```bash
npm test -- tests/urls.test.ts tests/host-window.test.ts
npm run typecheck
npm run lint
```

Expected: all commands pass; safe HTTPS opens, while unsafe schemes are denied and never forwarded.

- [ ] **Step 6: Regenerate and verify package exports**

Run:

```bash
npm run build:host
npm run verify:exports
```

Expected: generated host output imports/emits the URL helper and export verification passes. Include generated `dist` changes; do not hand-edit them.

- [ ] **Step 7: Commit the Electron change**

```bash
git add src/host/host-window.ts src/main/windows/main-window.ts tests/host-window.test.ts dist/host/host-window.js dist/shared/urls.js dist/shared/urls.d.ts
git commit -m "fix(security): restrict external URL protocols"
```

### Task 2: Guard the maximal client IPC sink

**Files:**
- Create: `/Users/brian/github/stuffbucket/maximal/client/src/main/external-url.ts`
- Modify: `/Users/brian/github/stuffbucket/maximal/client/src/main/index.ts`
- Create on the current client baseline: `/Users/brian/github/stuffbucket/maximal/tests/client-external-url.test.ts`

**Interfaces:**
- Produces: `isSafeDeviceFlowUrl(raw: string): boolean` local to the maximal client main process.
- Consumes: Existing `native:open-external` IPC channel; no preload or renderer changes.

- [ ] **Step 1: Write the pure predicate test**

Create `tests/client-external-url.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { isSafeDeviceFlowUrl } from '../client/src/main/external-url'

describe('isSafeDeviceFlowUrl', () => {
  test('allows HTTPS device-flow URLs', () => {
    expect(isSafeDeviceFlowUrl('https://github.com/login/device')).toBe(true)
  })

  test.each([
    'http://localhost:4141',
    'mailto:support@example.com',
    'file:///tmp/private',
    'javascript:alert(1)',
    'data:text/html,unsafe',
    'vscode://file/tmp/private',
    'ms-msdt:/id',
    'not a url',
    'file:///tmp/private#https://example.com',
  ])('rejects %s', (url) => {
    expect(isSafeDeviceFlowUrl(url)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
bun test tests/client-external-url.test.ts
```

Expected: fail because `client/src/main/external-url.ts` does not exist.

- [ ] **Step 3: Add the minimal predicate**

Create `client/src/main/external-url.ts`:

```ts
export function isSafeDeviceFlowUrl(raw: string): boolean {
  try {
    return new URL(raw).protocol === 'https:'
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Guard the IPC sink**

In `client/src/main/index.ts`, import the predicate and replace the direct call with:

```ts
ipcMain.handle('native:open-external', (_event, url: unknown) => {
  if (typeof url !== 'string' || !isSafeDeviceFlowUrl(url)) {
    throw new Error('Refused to open unsafe URL')
  }
  return shell.openExternal(url)
})
```

Validation must remain in the main process even if later schema validation is added upstream.

- [ ] **Step 5: Run focused and repository verification**

Run:

```bash
bun test tests/client-external-url.test.ts
npm --prefix client run typecheck
bun run check:fast
bun test
```

Expected: all commands pass. If the chosen implementation branch already has client Vitest infrastructure, move the same test to `client/tests/external-url.test.ts` and use its existing test command instead of adding a second runner.

- [ ] **Step 6: Commit the maximal change**

```bash
git add client/src/main/external-url.ts client/src/main/index.ts tests/client-external-url.test.ts
git commit -m "fix(client): restrict external URL protocols"
```

### Task 3: Independent security review

**Files:**
- Review only; no authored files.

**Interfaces:**
- Consumes: both base-to-head diffs and this acceptance claim: generic Electron sinks allow only `http:`, `https:`, and `mailto:`; the maximal device-flow sink allows only `https:`; unsafe cross-origin navigation remains prevented.
- Produces: concrete findings or a verified no-finding result.

- [ ] **Step 1: Dispatch a fresh read-only reviewer**

Give the reviewer each repository's base/head SHA and changed files, but not the implementation agents' reasoning. Require checks for:

```text
- every shell.openExternal sink in changed windows
- malformed IPC input
- unsafe popup protocols
- unsafe cross-origin navigation
- preservation of preventDefault / action: deny
- negative tests that would fail if guards were removed
```

- [ ] **Step 2: Apply and re-verify confirmed findings**

A separate implementation agent fixes confirmed findings. Rerun the focused commands from Tasks 1 and 2. Stop after two failed repair attempts and surface the premise rather than issuing a third speculative patch.

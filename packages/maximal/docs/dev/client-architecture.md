# Client architecture

[`../../../../apps/desktop/`](../../../../apps/desktop/) owns the Electron host,
app-level renderer composition, sidecar build, packaging, assets, and E2E
tests. The [`../../../maximal-client/`](../../../maximal-client/) package owns
reusable React features, controls, and shared contracts. The application
composes the `@maximal/maximal-electron` shell and supervises a bundled sidecar named
`maximal-core`. That binary starts at Maximal's composition entry, invokes
Core's public CLI, and can load the generic provider plugin host without bundling concrete
providers.

## Process boundary

| Directory | Process | Responsibility |
|---|---|---|
| `apps/desktop/src/main/` | Electron main | Sidecar supervision, private control transport, native operations, window and app lifecycle |
| `apps/desktop/src/preload/` | Isolated preload | The only `contextBridge.exposeInMainWorld` call; publishes the closed `window.maximal` API |
| `apps/desktop/src/renderer/` | Sandboxed renderer entries | HTML pages at the root, workspace composition in `workspace/`, and assistant panel entry in `overlay/` |
| `maximal-client/src/renderer/` | Reusable product UI | `AppWorkspace.tsx`, feature surfaces, controls, styles, capability adapters, and UI preview |
| `maximal-client/src/shared/` | Main/preload shared code | Serializable bridge types and channel allowlists |

Within `apps/desktop/src/main`, `adapters/` binds package-owned hosts,
`native/` owns operating-system integration, `preferences/` owns persisted
desktop policy, `sidecar/` supervises Maximal Core, `windows/` owns window
construction helpers, and `workers/` contains separately executed worker
entry points. `index.ts` remains the Electron main-process composition root.

The packaged window must run with:

```text
contextIsolation: true
nodeIntegration: false
sandbox: true
```

Those settings come from `@maximal/maximal-electron`'s `createHostWindow`. The
packaged E2E suite reads the effective preferences from the live window so a
dependency update cannot weaken them silently.

## Sidecar and control channel

`apps/desktop/src/main/sidecar/core.ts` spawns the bundled `maximal-core` executable with
`start` and an inherited process IPC channel, waits for its structured ready
line, and keeps draining its output. The ready line identifies the public
proxy port and reports `controlPort: 0` to confirm there is no private listener:

The **public proxy** serves `/v1/*` for external programs. The client does not
pass `--port`, so Core prefers `4141` and follows its normal next-port policy
if that port is occupied. Private JSON-RPC requests and control notifications
travel over the inherited channel, not TCP or SSE. Standalone Core still offers
its loopback HTTP control listener.

The window is created before core starts so First-run can display live boot
status. `awaitCoreProcess()` and `awaitProxyUrl()` wait for `ready` rather than
returning an unavailable channel or empty URL during startup.

`CoreStatus` covers `starting`, `boot-status`, `ready`, `crashed`,
`restarting`, `failed`, and `stopped`. Unexpected exits use bounded retries
with delays of 1, 2, 5, 10, and 20 seconds. A restarted process must remain
alive for 30 seconds before its retry budget resets, preventing a process
that repeatedly dies just after readiness from restarting forever.

The sidecar is app-scoped. On macOS, closing the last window leaves it alive
for Dock reactivation; a real quit stops it. Other platforms quit and stop it
when the last window closes.

## Closed control bridge

ADR-0024 places the private control boundary in Electron main. The renderer
does not receive the process channel, discovery response, raw control snapshot,
IPC channel name, arbitrary RPC method, or `ipcRenderer`.

`apps/desktop/src/main/adapters/core-control-connection.ts` owns the
connection to Maximal Core's private process channel:

1. Wait for the ready child process.
2. Use a short-lived process client for `server/discover`.
3. Validate protocol version, `maximal-core` identity, feed support, and the
   required methods.
4. Attach a live process client to control notifications for that child.
5. On a new ready child, discover and install one replacement, detach and
   close the old client, and ignore callbacks from stale generations.

`apps/desktop/src/main/adapters/core-control-operations.ts` binds each named
operation to its wire method and validates its response. The connection owns
child-process state; the operations never access the process channel directly.

A same-process ready event is a no-op. Control-state changes are broadcast as
a payload-free invalidation hint; renderers re-read the named query they
need. The raw `ControlState` never crosses IPC.

Core RPC errors cross Electron IPC as serializable `ControlResult<T>` values
because Electron does not preserve custom `Error` fields reliably. The bridge
retains message, reason, retryability, request ID, remediation URL, and code.
Renderer adapters use `unwrapControlResult()` to reconstruct a local
`ControlCallError`.

### Preload API

`apps/desktop/src/preload/index.ts` exposes exactly:

```ts
window.maximal = {
  getCoreStatus,
  onCoreStatus,
  getProxyUrl,
  openExternal,
  control: {
    authStatus,
    authStart,
    authCancel,
    authSignOut,
    accountsList,
    accountsSwitch,
    onChange,
  },
}
```

Lifecycle state is mapped through `toLifecycleStatus()`. Its ready variant
contains the public `proxyUrl` and process ID, but no private channel handle.
Preload wraps event callbacks so `IpcRendererEvent` does not reach renderer
code, and each unsubscribe removes only its own listener.

There is no generic control-call channel. Operations without a current UI
consumer—including `accounts/remove`, `app/quit`, `app/upgrade`, config,
model, client, usage, and update methods—have no renderer capability.

`maximal-client/eslint.config.mjs` prevents renderer code from importing the core
control client, raw control contract, or IPC channel constants. Components
must use their surface capability interface; only the corresponding adapter
may touch `window.maximal`.

## Renderer composition

`apps/desktop/src/renderer/workspace/App.tsx` composes
`maximal-client/src/renderer/AppWorkspace.tsx` and the product features. The app
creates long-lived adapters once, checks auth through the Settings capability,
and renders First-run until authenticated. A control-change event is the fast
refresh path; existing three-second polls remain safety nets for
missed notifications. Authenticated users can switch between Dashboard,
Runs, and Settings.

- `first-run/` implements resumable device-code authentication and maps the
  redacted lifecycle feed to its narrower `BootPhase` model.
- `settings/` exposes auth status/actions, account listing/switching, and the
  public proxy URL.
- `workspace/` presents project, status, run, and inspector views.
- `dashboard/` derives fleet totals, project rollups, recent completions, and
  waiting-on-user items from the same `WorkspaceSource` model.

First-run and Settings adapters delegate only to named preload methods. Main
owns restart recovery, so a stable renderer subscription survives control
client replacement without learning about the new child process.

## Placeholder data

`WorkspaceSource` is either `placeholder` or `live`, and only `placeholder` is
implemented. No live source backs the fleet model it was written against,
because nothing produces one: core is a proxy, and a harness owns run state.
Replacing it is step 1 of [`../../../maximal-client/README.md`](../../../maximal-client/README.md).

Until then, placeholder records are deterministic, visibly named as
placeholders, and accompanied by persistent notices in Workspace and
Dashboard. Fabricated fleet data must never look live.

Completed and failed `AgentRun` records carry `finishedAt`; Dashboard orders
recent completions by that value rather than array position.

## Shell dependency

The client composes structural primitives from
`@maximal/maximal-electron/renderer`; it does not duplicate the shell package.
Host styles consume `--shell-*` custom properties with fallbacks because the
package intentionally supplies no product palette.

`ghostty-web` remains a direct client dependency even though the current
surfaces do not render a terminal. The shell's single renderer barrel
re-exports terminal components, and the bundler must resolve that graph before
tree-shaking.

## Verification

- Vitest separates Node/main tests from jsdom/renderer tests. Main, preload,
  lifecycle mapping, control generations, error transport, capability
  adapters, and UI behavior are covered.
- ESLint enforces React hooks, type-aware recommended TypeScript rules, and the
  renderer import boundary.
- TypeScript validates the complete main/preload/renderer contract.
- Packaged Playwright tests launch a relocated copy outside the repository's
  dependency tree. They verify sidecar readiness, the exact deep preload API,
  absence of `window.require`, effective sandbox preferences, primary-heading
  and visual invariants, and clean shutdown without an orphaned sidecar.
- `.github/workflows/client-ci.yml` runs unit gates on Linux and packages plus
  exercises the app on macOS.

A packaged test must never launch the in-place app under `apps/desktop/out/`.
`relocatePackagedApp()` copies it to a fresh external directory, verifies the
copy, and ensures no ancestor contains `node_modules`; otherwise tests could
resolve unshipped dependencies and validate an artifact users never receive.

## Known gaps

Listed, sequenced, and owned by
[`../../../../apps/desktop/README.md`](../../../../apps/desktop/README.md). Placeholder data, the
duplicated `ShellLayout`, the two shell stylesheet workarounds, and the
deferred lint rules are all tracked there rather than restated here.

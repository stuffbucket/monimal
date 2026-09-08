# maximal-client

The Maximal desktop app: an Electron shell that supervises a bundled
`maximal-core` sidecar and presents what that sidecar knows.

How it is built is owned by
[`../docs/dev/client-architecture.md`](../docs/dev/client-architecture.md).
How it should look is owned by
[`../.design-context.md`](../.design-context.md). This file records the current
surface state and near-term roadmap.

## State

| Surface | Backed by |
| --- | --- |
| First run | Live device-code flow over `auth/*`, with boot narration. |
| Overview | Live and persisted traffic metadata through `observability/overview`, with traffic flow, token volume, latency, and recent requests. |
| Traffic | Cursor-paged request metadata through `observability/requests` and `observability/request`. |
| Settings | Live account and proxy configuration through named control methods. |

The renderer does not import Core or use a generic RPC escape hatch. Main owns
one `ControlClient`, validates observability results against
`@stuffbucket/maximal-observability-contract`, and exposes only named IPC and
preload methods. The renderer-owned `ObservabilitySource` adapts those methods
for the feature package.

`src/renderer/frame/AppFrame.tsx` owns the single `ShellLayout`. Overview,
Traffic, and Settings are its document tabs. Feature surfaces render their main
content normally and use `SurfaceRail`, `SurfaceRight`, `SurfaceStatus`, and
`SurfaceTop` portals for host-owned shell slots.

## Privacy boundary

The dashboard is metadata-first. It may display normalized request identity,
timing, route, provider/model, token/context counts, byte counts, and bounded
failure classifications. It does not capture or expose prompts, responses,
tool bodies, headers, API keys, raw user-agent strings, or arbitrary upstream
errors.

Request/response content inspection is deferred. If added, it must be explicit
opt-in behavior with separate storage, retention, redaction, truncation, and
deletion controls.

## Roadmap

### 1. Validate the packaged traffic experience

Keep packaged-app coverage for Overview and Traffic, including sidecar restart,
persisted history, live invalidation refresh, empty/error/unsupported states,
and keyboard access to chart and table equivalents.

### 2. Add trustworthy attribution

Project attribution remains nullable until Core has an explicit, trustworthy
signal. Expand client/session/subagent and compaction attribution only through
additive contract fields; do not derive high-cardinality aggregate labels from
raw request content or user-agent values.

### 3. Add an explicit shaping policy seam

Observability is passive. Future token budgets, routing decisions, or stream
mutation belong behind a separately injected policy interface with explicit
authority. Telemetry callbacks must never gain mutation powers.

### 4. Consider opt-in content inspection

Only after the metadata dashboard is stable, define capture policy and status
in the contract and add explicit single-request content reads. Keep captured
content out of list queries, aggregates, live invalidations, logs, and the
metadata database.

### 5. Finish renderer lint hardening

`eslint.config.mjs` still carries narrowly scoped React hook warnings. Clear the
remaining findings and promote those rules to errors without weakening the
existing architecture checks.

## Not on this roadmap

- Runtime loading of third-party React components. UI feature packages are
  reviewed, statically composed dependencies.
- Giving the renderer access to `ipcRenderer`, the control origin, or a generic
  JSON-RPC method.
- Moving product-specific observability UI into `maximal-electron`; that package
  remains the neutral shell and component library.
- The optional OTel/SigNoz operations stack. It is an export and deployment
  concern distinct from the embedded local SQLite dashboard.

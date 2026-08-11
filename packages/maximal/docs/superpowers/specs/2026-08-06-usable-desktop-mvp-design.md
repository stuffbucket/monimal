# Usable Desktop MVP Design

**Status:** Approved design; implementation not started  
**Date:** 2026-08-06  
**Repositories:** `stuffbucket/maximal`, `stuffbucket/maximal-core`, `stuffbucket/maximal-electron`

## Purpose

Ship a high-quality, usable Maximal desktop MVP for macOS. A person must be able
to install a signed application, complete first run and GitHub sign-in without a
terminal, inspect the endpoint their tools can use, work in the real Maximal
workspace, and recover from expected failures.

This document applies the repository ownership and compatibility model in
[`2026-08-05-cross-repository-engineering-design.md`](./2026-08-05-cross-repository-engineering-design.md)
to the first desktop release.

## MVP boundary

The MVP includes:

- a signed, notarized, installable macOS DMG;
- an immutable `maximal-core` sidecar with supervised lifecycle;
- the reusable `maximal-electron` host and renderer primitives;
- the production Maximal workspace, driven by live core state;
- resumable first run and device-flow authentication;
- workspace-native Settings;
- visible, actionable startup and runtime failures;
- client-specific CI and packaged-application verification.

The MVP does not include:

- the durable project catalog in maximal#426;
- the harness runtime in maximal#425;
- automatic third-party tool configuration;
- an Electron update channel;
- destructive or switching multi-account operations;
- Windows or Linux installers;
- project scanning or assistant access as a completion requirement.

Those exclusions are product boundaries, not placeholders. The UI must not show
dead controls that imply the excluded behavior exists.

## Repository ownership

### `maximal-core`

Core owns the engine, public proxy, private control plane, protocol vocabulary,
ready-line format, supervisor helpers, sidecar binary build, authentication token
write, and listener policy.

The desktop app consumes core as an immutable sidecar artifact. It does not copy
core logic or derive the ready-line and protocol formats independently.

### `maximal-electron`

Electron owns the generic shell, secure native bridge, reusable host lifecycle,
window and renderer primitives, and shell-level security invariants. It remains
Maximal-agnostic.

The MVP pins stable `v0.0.4`. The GitHub Packages migration may be adopted later
but does not block this release.

### `maximal/client`

The client owns product composition: core supervision, native integration, the
validated client state model, first run, authentication presentation, Settings,
the live workspace, packaging, client CI, and product-level end-to-end tests.

## Delivery strategy

Stabilize the existing verified stack rather than rebuild it:

1. Update and merge maximal#423, retaining its signed/notarized DMG evidence.
2. Restack maximal#424 and turn its workspace preview into the production live
   composition.
3. Add client-specific checks and required CI for maximal#420.
4. Add the validated client store and live core wiring.
5. Implement deterministic device-flow authentication and first run.
6. Add singleton workspace-native Settings.
7. Run the complete release matrix and repair every release-blocking defect.
8. Release only the exact verified commit and immutable dependency set.

The packaging branch must consume a core release containing the two-listener
ready-line contract and current security and harness fixes. A temporary client
binary-build wrapper is allowed only while maximal-core#13 remains unresolved.
It must remain isolated, digest-checked, and removable without changing product
behavior.

## Startup architecture

1. Electron starts without showing the product window.
2. Main prepares the isolated application home. Failure is fatal and visible.
3. The supervisor launches the pinned core binary with an allowlisted environment.
4. It parses and validates the versioned ready line.
5. It verifies that the reported PID equals the spawned child PID.
6. It reads distinct private control and public proxy listener addresses.
7. It calls `server/discover` and validates protocol identity and capabilities.
8. It opens the workspace only after the initial control snapshot is valid.
9. It continuously drains sidecar output and retains a bounded redacted diagnostic
   buffer.
10. Graceful quit terminates only the owned child. Core's parent watchdog covers
    supervisor crashes.

The supervisor never probes arbitrary local listeners as substitutes for the
owned child. A malformed ready line, PID mismatch, unsupported protocol, or
missing required capability fails closed.

## Listener and security boundary

The control listener and public proxy listener remain distinct types throughout
the application.

- The private control listener is an implementation detail. Product copy never
  displays it.
- The renderer does not receive unrestricted network or process access.
- Main or a narrowly scoped secure bridge supplies only the validated capability
  needed by the client data layer.
- The public listener is shown as **This session's tool endpoint** until core and
  the product define persistent listener ownership and canonical tool mutation.
- The application never rewrites third-party tool configuration without a
  versioned core capability and explicit user action.

No error or diagnostic surface exposes credentials, the private control origin,
raw environment data, or unrestricted filesystem paths.

## Client state model

One validated store owns:

- core lifecycle and health;
- protocol identity and discovered capabilities;
- authentication state;
- public endpoint information;
- first-run progress;
- settings state;
- connection and reconnect status;
- the latest control snapshot.

`subscriptions/listen` provides the initial snapshot and subsequent JSON-RPC
notifications. The stream is not resumable. On disconnect, the client:

1. keeps the last valid snapshot and marks it stale;
2. reconnects with bounded backoff;
3. sends no `Last-Event-ID` or invented cursor;
4. replaces state from the next complete snapshot.

Every boundary payload is runtime-validated. Invalid notifications are diagnosed
and ignored or escalate the connection state; they are never cast into trusted
application state.

## First run and authentication

The required path is:

`launching -> coreReadySignedOut -> deviceCode/polling -> authenticated -> endpointReview -> complete`

Recovery states are distinct:

- `coreFailed`;
- `offline`;
- `authorizationDenied`;
- `deviceCodeExpired`;
- `fatalProtocolError`;
- `fatalAuthenticationError`.

Core owns token persistence. The client owns device-code presentation, polling
state, browser opening, manual fallback, and recovery copy. The auth result union
is exhaustive so a new core result fails compilation until handled.

First-run progress persists transactionally and resumes after restart. Completion
cannot require project scanning, assistant enablement, or automatic tool
configuration. Closing first run preserves completed required steps and explicit
optional choices.

## Workspace

The spatial workspace from maximal#424 becomes the production composition. It is
not a separate preview mode. The center canvas ships these live documents:

- **Overview:** engine health, authentication summary, public tool endpoint, and
  actionable connection guidance.
- **Models:** a resilient catalog that preserves unknown entries and folds each
  known entry independently, satisfying maximal#416 rather than dropping the
  whole response when one model shape changes.
- **Usage:** current core usage projections with explicit loading, unavailable,
  stale, empty, and error states.
- **Clients:** connected-client state when discovery advertises it; otherwise the
  document and navigation entry are absent.

The project rail remains structurally present but does not invent projects before
maximal#426. For the MVP it contains product-level navigation and status only.
Session and harness controls from the concept remain absent until maximal#425 is
implemented.

- Fixture data is replaced by selectors over the validated client store.
- Packaged builds cannot select fixture or preview routes.
- Unsupported capabilities remove the corresponding action instead of showing a
  disabled promise.
- The workspace presents core state without exposing raw protocol diagnostics.
- Development fixtures remain outside the production selection path and exist
  only to exercise visual and recovery states.

## Settings

`Cmd-,` opens or focuses one `settings` document tab. It never creates duplicates.
Opening Settings records the invoking tab, control, layout, and scroll position;
leaving restores them exactly. The contextual inspector is hidden while Settings
is active.

MVP sections are:

1. General: system, light, or dark theme and launch behavior.
2. Layout: panel defaults and reset.
3. Account & Connections: authentication state and supported non-destructive
   actions.
4. Core: read-only version, protocol, public endpoint, listener health, and
   diagnostics access.
5. Assistant: capability and consent state without a fake provider.
6. Updates: an honest no-channel state with no dead update action.
7. Privacy: future scan roots and transcript or telemetry choices, defaulting
   filesystem access off.
8. Advanced: redacted diagnostics and export.

Settings writes return transactional success or failure. Failed optimistic state
reverts and shows an inline error. A control is absent or read-only when discovery
does not advertise its write method.

## Failure behavior

### Startup

A core launch failure shows a native error containing a short actionable reason,
a retry path, and access to redacted recent output. Electron does not remain alive
without a visible window or explanation.

Ready-line timeout, malformed identity, PID mismatch, and protocol incompatibility
terminate the owned child and fail closed.

### Runtime

A control-stream disconnect leaves the last state visible but stale while bounded
reconnection runs. A sidecar exit moves the workspace into a recoverable
engine-stopped state, retains diagnostics, and offers restart. The client does not
enter an unbounded silent restart loop.

Authentication denial, expiry, offline state, and fatal failure remain distinct.
A still-valid device code survives a transient offline period. Settings failures
revert the affected state.

### Packaging

The build fails when the bundled sidecar version or digest differs from the pinned
artifact. The packaged application uses an executable sidecar outside ASAR and
resolves it by an absolute application-owned path.

## Accessibility and interaction quality

- Each view has one primary heading.
- Focus moves to active Settings sections and restores when Settings closes.
- Authentication and core progress use polite live regions.
- Persistent failures use alert semantics.
- Device codes are selectable, copyable, and rendered with tabular monospace
  figures.
- Browser opening always has a manual fallback.
- Keyboard navigation covers first run, workspace, Settings, retry, and recovery.
- Reduced-motion behavior is literal and tested.
- Production workspace contrast meets the project design-system requirements.

## Verification matrix

### Unit and contract

- ready-line parsing and malformed input;
- PID matching and lifecycle transitions;
- diagnostic redaction;
- exhaustive authentication reducer;
- capability-based feature selection;
- settings transactions and rollback;
- stream notification validation and snapshot replacement;
- packaged-build preview exclusion.

### Integration

- built core against a deterministic device-flow fixture;
- two-listener discovery and public/control separation;
- concurrent user-run and desktop-owned engines;
- stream loss, reconnection, and fresh snapshot;
- sidecar crash and restart;
- immutable dependency and digest checks.

### Real application

The existing external CDP harness drives the actual Electron app and verifies:

- delayed window creation until valid readiness;
- complete first run through required and recovery states;
- Settings singleton and exact workspace restoration;
- live workspace rendering from real core state;
- keyboard navigation, focus order, live regions, and reduced motion;
- one real compatible request through the public proxy endpoint.

### Packaged artifact

- build, sign, notarize, staple, install, and launch the DMG;
- validate the top-level app and every nested executable signature;
- verify the unpacked sidecar identity and digest;
- run packaged smoke and critical end-to-end tests against the release artifact;
- complete one clean-user-data first-run acceptance pass.

## Release gate

The MVP is releasable only when:

- a fresh macOS user can install and open the notarized DMG;
- first run completes without a terminal;
- auth success, denial, expiry, offline, and restart-resume paths have executable
  evidence;
- the public endpoint serves a real compatible client request;
- the private control endpoint never appears in renderer state intended for
  presentation or in user-facing setup copy;
- bundled sidecar identity and digest match the pinned source;
- startup and runtime failures are visible and actionable;
- client lint, typecheck, unit, boundary, package, and real-app end-to-end checks
  run in required CI;
- accessibility, contrast, keyboard, and reduced-motion checks pass on the
  production workspace;
- no fixture or preview route can be selected in a packaged build;
- every dependency pin names the immutable artifact used by release evidence.

A source-only green test suite, a screenshot, or a successful package command is
not sufficient release evidence.

## Issue disposition

Implementation must update issue state to match the delivered architecture:

- close maximal#408 only when supervision and coexistence acceptance evidence is
  attached;
- close maximal#409 only when the deterministic auth fixture and UI recovery
  states pass;
- close maximal#420 only when client checks are required in CI;
- close maximal#421 when the stable Electron dependency is pinned and verified;
- close maximal#416 only when unknown and malformed model entries cannot collapse
  the complete Models document;
- update maximal#412 to separate completed macOS MVP packaging from deferred
  cross-platform packaging;
- keep maximal#425, maximal#426, updater work, and non-macOS distribution open as
  explicit post-MVP work;
- rewrite or close stale checklist items in maximal#417 when producer work has
  already shipped under newer issue numbers or contracts.

## Success criterion

The MVP succeeds when a person with no existing Maximal state can install the
notarized application, sign in, understand the endpoint available to their tools,
use the live workspace, open and leave Settings without losing context, recover
from expected failures, and quit without leaving an owned engine behind—and every
part of that claim is backed by executable evidence against the exact released
artifact.

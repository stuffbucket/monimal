# maximal-client

The Maximal desktop app: an Electron shell that supervises a bundled
`maximal-core` sidecar and presents what that sidecar knows.

How it is built is owned by
[`../docs/dev/client-architecture.md`](../docs/dev/client-architecture.md).
How it should look is owned by
[`../.design-context.md`](../.design-context.md). This file owns the roadmap,
and only the roadmap.

## State

| Surface | Backed by |
| --- | --- |
| First run | Live. Full device-code flow over `auth/*`, with boot narration. |
| Settings | Live, three sections. `auth/*`, `accounts/*`, and the public proxy URL. |
| Dashboard | **Placeholder.** Fixed sample values behind a permanent notice. |
| Runs | **Placeholder.** Same source. |

Two of four surfaces render data that was written by hand.

## Roadmap

Four items, in order. Each one is finishable on its own, and each unblocks
the next.

### 1. Point Dashboard at data that exists

The placeholder source was written against an agent-fleet model — projects,
branches, diffs, approvals, tool-call counts. Nothing produces that. Core is a
proxy; a harness owns run state, and core takes correlation headers without
reading them. Waiting is not a plan, because nothing is on the way.

Core already serves, and already pushes, more than this app reads. Its
control RPC answers `apps/list`, `clients/list`, `models/list`, `usage/get`,
`config/get`, and `update/status`; its feed carries `apps`, `clients`,
`models`, `usage`, `config`, `accounts`, `auth`, and `boot`. The client
consumes two of those nine topics.

So the Dashboard's question changes from *what are my agents doing* — which
nothing can answer — to **what is using Maximal, and what has it cost**, which
core answers today:

- `clients/list` returns the programs that hit the proxy inside a freshness
  window: label, user agent, and age in seconds, pruned after five minutes.
  That is a live "who is connected" panel with no new core work.
- `usage/get` returns a persisted `TokenUsageSummary` — totals, `byModel`,
  `byProvider`, and the period's range. The same module also exposes a
  bucketed series and paged events when a chart or a log needs them.
- `models/list` and `apps/list` fill in what is available and what is
  configured.

Steps:

1. Add named `clientsList` and `usageGet` capabilities through main and
   preload. There is deliberately no generic dispatcher, so each operation is
   its own reviewed pair.
2. Rewrite `WorkspaceSource` around the roster and the usage summary, and
   delete the `kind: 'placeholder' | 'live'` discriminator with the last
   placeholder that needed it.
3. Redraw Dashboard against the new model, and drop `PlaceholderBanner`.

Done when no surface renders a value nobody measured.

### 2. Decide what Runs is

Runs is the fleet model with no producer. Step 1 leaves it the only fake
screen in the app, and a screen that exists to display data that will never
arrive is worse than one that does not exist.

Pick one, and record which in this file:

- **Retire it.** Delete `workspace/`, keep the app three surfaces wide. The
  composition it demonstrates is preserved in git.
- **Repoint it.** Make it the detail view under the Dashboard — per-client
  request history from the usage event pages, which is real and which the
  Dashboard summarises rather than lists.

Do not leave it placeholder. A permanent "this is not real" banner is a
decision deferred, not a decision made.

### 3. One frame

Dashboard and Runs each mount their own `ShellLayout`, and `App.tsx` draws a
third navigation strip above them. Three navigation systems on one screen is
the defect; whichever surface survives step 2 should not carry its own frame.

Hoist a single `ShellLayout` into `App.tsx`, give it the view switcher as its
nav rail, and let each surface render into the canvas.

This also retires the workaround in `App.tsx`. Two of its rules patched
`stuffbucket-electron` from the outside — a nav label that wrapped inside a
fixed-height row, and a status bar with a fixed height rather than a floor.
Both are now fixed upstream in
`packages/maximal-electron/src/renderer/styles/structural.css`, where they
belong: the workspace link makes that a same-repo change, which is one of the
few things this monorepo makes cheaper than the three repositories it was
assembled from.

### 4. Turn the lint warnings into errors

`eslint.config.mjs` runs typescript-eslint at `recommended` with
`typeChecked: false`, and holds two `react-hooks` rules at `warn`. Both are
scoped, and both name the files they are waiting on:

- Type-aware rules: 38 findings, mostly `require-await` and `unbound-method`.
- `set-state-in-effect`: `dashboard/Dashboard.tsx`,
  `first-run/useFirstRun.ts`, `workspace/Workspace.tsx`.
- `refs`: `settings/AccountSection.tsx`.

Steps 1 through 3 rewrite three of those four files anyway. Clear the
findings there, then set `typeChecked: true` and promote both rules to
`error`.

Last, because doing it first means fixing code that step 1 deletes.

## Not on this roadmap

- **The library's own sequencing** — overlay conversation history, a diff view
  in the approval prompt, a double-tap-Ctrl monitor, Windows and Linux
  terminal verification. That list is
  [`maximal-electron`'s](../../maximal-electron/docs/roadmap.md), and it
  describes the terminal and the overlay agent. This app renders neither. The
  only thing it needs from that package is step 3's two stylesheet fixes.
- **Destructive and lifecycle operations** — `accounts/remove`, `app/quit`,
  `app/upgrade`. Absent by design. Each needs a named capability pair and a
  confirmation flow, which is a feature, not cleanup.

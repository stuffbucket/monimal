# @maximal/maximal-terminal

Terminal sessions, launch connectors, tmux control and projection, and the
React terminal views. Nothing here imports `electron`; the Electron adapter is
`@maximal/maximal-electron/electron-terminal`.

| Entry | What it is | Peers |
| --- | --- | --- |
| `.` | `TerminalHost`, its `node-pty` connector, `registerTerminalChannels`, the launcher and its connectors, and tmux control and projection | `node-pty` |
| `./renderer` | `TerminalView`, the `TerminalTransport` contract, `createTerminalTransport`, `readTerminalTheme`, and the pane and workspace models | `react`, `@xterm/xterm`, `@xterm/addon-fit`, `@wterm/dom`, `@wterm/ghostty` |

Generated tmux session names take their prefix from the host through
`TmuxSessionNames`; only names under that prefix are offered for resume.

`pnpm run mutate` checks mutable lines changed since `origin/main`;
`--mutate=file[:start-end]` selects a scope explicitly.
`pnpm run mutate:incremental` reuses dynamic-mutant results during local edit
loops. `pnpm run mutate:all` is the fresh complete audit. The same audit can
be split into four isolated `--all --shard=I/4` runs followed by `pnpm run
mutate:merge-shards`. Every mode reruns selected static mutants in fresh
processes under the workspace criteria in [`../../scripts`](../../scripts).

## Wiring a terminal

`TerminalView` takes its transport as a value, so it knows nothing about an IPC
contract and a consumer supplies their own. Writing that transport was the
consumer's job until now: five request methods, two event subscriptions, and
the id filtering between them. Every consumer writes it the same way, and one
of them writes it wrong.

Two exports do it instead. `createTerminalTransport` from `./renderer` is the
renderer half. `registerTerminalChannels` from `.` answers it
from a `TerminalHost`. Neither picks a channel name, for the reason
`exposeBridge` takes its `namespace` from the caller: a name this package chose
is a name every consumer with a contract of their own has to work around. Issue #22.

```ts
// the consumer's renderer, over the preload they exposed themselves
import {
  createTerminalTransport,
  TerminalView,
} from '@maximal/maximal-terminal/renderer';

const transport = createTerminalTransport({
  invoke: (channel, request) => window.myApp.invoke(channel, request),
  on: (event, listener) => window.myApp.on(event, listener),
  channels: {
    spawn: 'term:spawn',
    write: 'term:write',
    resize: 'term:resize',
    terminate: 'term:kill',
    list: 'term:list',
    // Optional: enables bounded acknowledged terminal output.
    ack: 'term:ack',
    data: 'term:data',
    exit: 'term:exit',
  },
});

<TerminalView id="one" transport={transport} disposition="detach" />;
```

`invoke` and `on` are the consumer's own, exposed from their preload.

```ts
// the consumer's main process
import { app, ipcMain } from 'electron';
import {
  registerTerminalChannels,
  TerminalHost,
} from '@maximal/maximal-terminal';

const host = new TerminalHost({
  homeDirectory: app.getPath('home'),
  defaultShell: process.env['SHELL'] ?? (process.platform === 'darwin' ? '/bin/zsh' : '/bin/sh'),
  env: { TERM_PROGRAM: 'Consumer' },
  emit: (id, chunk) => mainWindow.webContents.send('term:data', { id, data: chunk }),
  onExit: (id, exitCode) =>
    mainWindow.webContents.send('term:exit', { id, exitCode }),
});

registerTerminalChannels(ipcMain, host, {
  channels: {
    spawn: 'term:spawn',
    write: 'term:write',
    resize: 'term:resize',
    terminate: 'term:kill',
    list: 'term:list',
    ack: 'term:ack',
  },
});
```

Four things about that pair are worth stating rather than discovering.

**The two halves name a different number of channels.** The transport takes
seven and the registration takes five. `data` and `exit` are pushed by the
host, so a `TerminalHost` reports them through `emit` and `onExit`, which the
consumer sends on whatever the host's own window send looks like. Nothing here
sends for them: `.` imports no `electron` and has no
`webContents` to reach.

**The names are typed against the caller's own contract.**
`TerminalChannels<C, E>` takes the caller's channel union and event union, so
`TerminalChannels<IpcChannel, IpcEvent>` makes a channel that contract does not
declare a compile error rather than a silent no-op. `TerminalRequestChannels<C>`
is the five-name half `registerTerminalChannels` takes.

**`registerTerminalChannels` takes a resolver as well as a host.** Its `host`
parameter accepts a `TerminalHost` or a function of the invoke event. A
consumer with one manager passes the manager. A consumer that keys one per
window passes the function: a session belongs to a window, so the manager
is resolved from `event.sender`. A request that resolves to no manager is dropped, and `list`
answers with no sessions.

**Its `ipcMain` parameter is structural, not an `electron` import.**
`TerminalIpcMain<E>` names the one method the registration calls, so
`.` still loads no `electron`. That is what keeps the module
inside the unit suite, and inside the criterion `scripts/mutation-scope.mjs`
applies; it is deferred there rather than mutated, under #125. Passing
Electron's own `ipcMain` satisfies the parameter, and `E` is inferred from it.

Neither half imports the other, and neither may.
`maximal-electron`'s `tests/terminal/terminal-channels.test.ts` drives both
halves and asserts they name the same set.

### Brokering tmux projections

`TmuxProjectionBroker` from `.` coordinates several ordinary
tmux client PTYs around one tmux-owned pane. It does not construct commands.
The consumer's `attach` callback chooses whether each client runs locally,
through SSH, or through another connector. The renderer receives only the
client PTY's VT stream.

```ts
import {
  LocalPtyConnector,
  TmuxProjectionBroker,
} from '@maximal/maximal-terminal';

const connector = new LocalPtyConnector();
const broker = new TmuxProjectionBroker({
  attach: ({ sessionId, cols, rows }) => connector.connect({
    command: 'tmux',
    args: ['attach-session', '-t', sessionId],
    name: 'xterm-256color',
    cols,
    rows,
    cwd: process.env['HOME'] ?? '/',
    env: { ...process.env, TERM: 'xterm-256color' } as Record<string, string>,
  }),
  terminateSession: (sessionId) => terminateTrustedTmuxSession(sessionId),
  emit: (sessionId, projectionId, chunk) =>
    sendProjectionOutput(sessionId, projectionId, chunk),
  onExit: (sessionId, projectionId, exitCode) =>
    reportProjectionExit(sessionId, projectionId, exitCode),
});
```

`attach` registers a projection without granting input. `focus` returns the
new focus epoch. `write` and `resize` accept only that projection and epoch;
an operation delayed across a focus transfer returns `false`. `detach` kills
one client process and leaves the tmux pane alive. `terminate` kills every
client and invokes `terminateSession`.

Tmux command arguments and session names remain trusted host state. A renderer
must not supply either. Tmux control mode uses another host-only process; its
records do not share the projection data stream.

### Flow control

The shipped `pty:ack` channel cumulatively confirms `pty:data.sequence` after
the emulator finishes a write. `MAX_IN_FLIGHT_BYTES` bounds IPC output. A pausable pty stops at its
high watermark and resumes at `RESUME_LOW_WATERMARK`; a non-pausable pty
retains only the newest `MAX_PENDING_BYTES` tail and reports one loss notice.
The host sends `pty:exit` only after prior output is acknowledged.

### Detaching a session from its view

Unmounting a `TerminalView` terminates its session. That is the default, and
changing it would leak a process for every caller that relies on a view going
away ending a shell. `disposition="detach"` opts out, and then the shell keeps
running with nothing showing it, which is what a long build needs and what
`tmux detach` means.

`disposition="preserve"` also leaves the session running, but only while a
parent still owns it. `TerminalTabs` uses this when a split reparents existing
pane views, then terminates every pane itself when the owning tab unmounts.
That keeps a layout change from killing a visible shell without turning it
into a detached session.

Three things make that a detach rather than a leak.

- **It still has an owner.** `TerminalHost.terminateAll` covers every unshared
  session it holds. A shared session transfers to a surviving viewer when its
  owner closes; quitting still reaps every host.
- **It can be found.** `TerminalHost.list` returns every live session, and the
  `pty:list` channel carries that to the renderer. Nothing signals a detach,
  because a detach is the absence of a terminate, so the set of detached
  sessions is derived: `detachedSessions` subtracts the session ids the renderer holds
  views for. There is no attached flag in the main process to fall out of step
  with the views.
- **It can be attached to.** `TerminalHost.spawn` on an id it already holds
  resizes that session and replays what it retained, rather than refusing.

**What survives a detach is the process, not the screen.** The scrollback lives
in the selected emulator, in the renderer, and it dies with the view. The
host keeps its own tail instead, bounded by `MAX_RETAINED_BYTES`, and a view
that attaches is sent that and nothing older. A session whose output has run
past the limit says so once, in the replay. `MAX_PENDING_BYTES` is a different
buffer and records nothing: it is drained on every flush.

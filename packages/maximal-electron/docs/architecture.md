# Architecture

## Processes

```text
main process                  preload (sandboxed)         renderer
─────────────                 ───────────────────         ────────
src/main/index.ts             src/preload/index.ts        src/renderer/main.tsx
  lifecycle, windows            contextBridge only          React 19 shell
src/main/ipc.ts               exposes: invoke, on
  handler map
src/main/native/*             ↑ both derive their types from ↓
  menu, tray, notifications
  preferences, updates              src/shared/ipc.ts
src/main/windows/*                  the contract
  main window, splash
```

## The contract

`src/shared/ipc.ts` is the load-bearing file.

`IpcContract` maps each channel to a request type and a response type.
`IpcEvents` maps each event to a payload. Everything else derives from those
two.

Three properties fall out, and each is enforced by the compiler rather than by
review:

1. **No missing handler.** `src/main/ipc.ts` types its handler map over every
   channel except the terminal's, and `registerTerminalChannels` answers those
   five. Declare a channel without handling it and the build fails; take a name
   out of `TERMINAL_CHANNELS` without giving it a handler and the build fails
   the same way, because the map's key type stops excluding it.
  `tests/terminal/terminal-channels.test.ts` covers the seam the two registrations
   leave, and asserts they cover `IPC_CHANNELS` exactly once between them.
2. **No drift.** A handler's argument and return types come from the contract,
   so it cannot quietly return a different shape.
3. **No stale runtime list.** `IPC_CHANNELS` and `IPC_EVENTS` are checked
   against the type maps by an exhaustiveness assertion at the bottom of the
   file.

The preload bridge checks every name against those runtime lists. That check is
the security boundary: a compromised renderer cannot reach an arbitrary main
process handler, because the name is not in the set.

The renderer never sees `ipcRenderer`.

## The shell

A three-panel layout, in the shape Figma uses.

[`embedding.md`](embedding.md#renderer-ownership) owns the package-versus-consumer
component placement rules and defines the roles of `ShellLayout`, `AppFrame`,
and `WindowChrome`.

| Region | Component | Behaviour |
| --- | --- | --- |
| Title bar | `TitleBar` | Draggable. Hosts the document tabs and the profile control. |
| Left | `LeftNav` | Collapses to an icon rail. Sections collapse on their own. |
| Centre | `Toolbar`, `Canvas` | Grid or list. Selection drives the inspector. |
| Right | `Inspector` | Properties when something is selected, settings when not. |

Libraries do the work that is easy to get wrong:

- `react-resizable-panels` owns panel width, collapse, and layout persistence.
  Version 4 exports `Group`, `Panel`, and `Separator`. It is not the version 3
  API most examples show.
- Radix supplies `Tabs`, `Collapsible`, and `Tooltip`, so keyboard navigation,
  roving focus, and ARIA wiring are not hand-rolled.
- `lucide-react` supplies icons.

Tabs live in the title bar rather than in a row of their own. That is where
Figma puts them, and it returns a row of vertical space to the canvas.

## The account, and the settings behind it

`Profile` is the account control in the title bar. It knows a display name, a
handle, an avatar and a plan, and it knows nothing else: `Account` is a value
the consumer already holds, and sign-in and sign-out are callbacks the consumer
already implements. The shell has no idea what an identity provider is. This is
the rule `lib/data.ts` states for content and `tokens.css` states for the
palette.

Its menu reaches five settings surfaces, which are the shell's own and are
therefore named by the shell. Where each one opens is a decision:

| Surface | Where | Why |
| --- | --- | --- |
| Model cards | Tab | A catalogue that grows with the provider. Read, not operated. |
| Logs and diagnostics | Tab | Kept open while the fault being reported is reproduced. |
| Usage | Tab | The widest surface here, and the one left open while work runs. |
| API keys | Dialog | One bounded task, and the only surface that puts a secret on screen. A modal takes it away again. |
| Apps | Dialog | A short list of switches with one decision each. |

Every surface takes its content as props. `ShellSettings.tsx` is the reference
application's wiring of them, and `lib/sample-settings.ts` is the sample
content it passes. Both are the parts a consumer replaces.

The functionality is ported from the parked Tauri shell in
`stuffbucket/maximal-client`; none of its markup or its stylesheet is.

## Terminals

A tab holds the library grid, a settings surface, or a terminal. The `+`
button opens a terminal.

`TerminalView` selects xterm.js by default. Its `emulator` option can select
wterm instead. `@wterm/dom` supplies the DOM renderer and input handling, and
`@wterm/ghostty` supplies the libghostty virtual terminal compiled to
WebAssembly. Both wterm packages are Apache-2.0 licensed.

Ghostty renders bounded direct Kitty PNG, RGB, and RGBA images. It does not
render SIXEL, iTerm2 images, animations, indirect media, or persistent images.
Kitty graphics inside tmux require the user's pane-level `allow-passthrough`
setting; this shell does not mutate an existing tmux session's options.

The optional `ghosttyWindow` value carries renderer-owned window adjustments:
horizontal and vertical padding, balanced opposing edges, background opacity,
and backdrop blur. It applies only when `emulator="ghostty"`; xterm geometry is
unchanged.

Native Ghostty owns windows and splits outside its virtual terminal. This shell
therefore owns that layer: `TerminalView` consumes Command+D and
Command+Shift+D, while `TerminalTabs` builds a resizable right or down split
from a second host-launched Local session. An embedder that supplies no split
launcher keeps those keys unconsumed. Command+[ and Command+] cycle split
focus, and the active pane carries the focus ring. An exited pane collapses to
its sibling; an exited final pane closes the terminal tab. Command+K, Command+A,
Command+Home, and Command+End use the emulator's
clear, select, and scroll actions. OSC 0 and OSC 2 title changes name a terminal
tab; controls are removed and titles are bounded before the tab stores them.
The PTY launch directory basename is the initial shell title.

`terminal-workspace.ts` defines the renderer aggregate for terminal composition.
A terminal document owns one pane tree and its logical
focus. Pane leaves reference branded view identities. A view references one
session and may reference one backend projection. A session may have any number
of views and projections, but one backend projection belongs to at most one live
view because its focus and resize epoch identify one control endpoint. The
aggregate owns split, close, focus, and document docking as immutable operations.
It owns no emulator, DOM node, Electron object, or process lifetime.
`TerminalTabs` uses one aggregate per attached document and keeps each emulator
mounted in a portal keyed by its view identity. Pane-tree changes move those
portal nodes without remounting the emulator or losing its buffer.

`init()` is shared across terminal views. A rejected load clears that shared
promise, and the view shows a retry action rather than leaving an empty canvas.
Emulator resize events coalesce to the latest dimensions once per animation
frame before crossing IPC. The selected emulator owns clipboard paste and IME
composition; the shell does not layer competing handlers over them.

It parses and renders. It does not run a process. The shell lives in the main
process, in `src/main/native/pty.ts`, which is what lets the renderer keep
`sandbox: true`. That file is the Electron half of the manager: which window
owns a session, where a session starts, and where its output goes. The manager
itself is `TerminalHost`, the class `./host/terminal` exports, so this shell
and a consumer run the same code rather than two copies of it. The wiring
between the two is exported as well: `src/main/ipc.ts` registers the channels
through `registerTerminalChannels` and `src/renderer/lib/bridge-terminal.ts`
builds its transport through `createTerminalTransport`. `docs/embedding.md`
holds the consumer's call of both.

The application also owns a separate launcher path. `terminal:profiles`,
`terminal:discover`, and `terminal:launch` accept only opaque identifiers and
dimensions. `terminal-launcher.ts` repairs versioned `terminal-profiles.json`
under `userData`, always synthesizes Local, and holds a short-lived reservation
for the owning window. `terminal:launch` consumes that reservation and starts
the process before it returns a session id. Its later `pty:spawn` attaches the
view and resizes the live id. The shipped spawn request accepts only that id
and dimensions, so a renderer cannot override executable configuration.
Direct `pty:spawn` remains the exported compatibility path for trusted
embedders. Discovery is generation-labelled and bounds a connector failure or
timeout to that profile, while Local remains available.

Local, Docker, Podman, Lima, Multipass, Kubernetes, WSL, Vagrant, SSH, Tmux,
and SSH + Tmux are immutable built-in profiles. Podman is available on supported hosts; Lima is
available on macOS and Linux; Multipass, Kubernetes, and Vagrant are available
on macOS, Linux, and Windows when their CLI is present; WSL is Windows only.
SSH is available on macOS, Linux, and Windows when system OpenSSH is present;
a bounded `ssh -V` probe makes an absent client SSH-local unavailable.
Discovery runs only in the main process through bounded `execFile` calls. WSL
uses `wsl.exe --list --quiet` and launches a registered distribution with its
exact `--distribution` argv. Vagrant reads pruned machine-readable global
status, exposes only running machines, retains its project directory only in
main, and launches its stable machine id without a renderer supplied cwd.
Kubernetes uses the current context and one
all-namespace JSON pod query, then exposes only Running pods and declared
normal containers. It caps subprocesses, duration, bytes, namespaces, pods,
containers, and labels. The renderer receives opaque target ids and labels,
never connection names, instance names, Kubernetes contexts, namespaces, pod
UIDs, container ids, Vagrant project directories, or WSL distribution names.
Kubernetes target state retains the context, namespace, pod name and UID, and
container in main. A later discovery invalidates all
older targets for that window. This slice launches its exact `kubectl exec`
argv without a third UID preflight, so a same-name replacement between discovery
and launch is resolved by Kubernetes rather than silently remapped by this
application. SSH reads only the trusted primary user config at `~/.ssh/config`
through a capped main-owned reader. It accepts a single strict `Host alias`
directive before `Match`; comments, wildcard and negated aliases, multi-pattern
entries, `Include`, and every option are ignored. Alias target ids are opaque;
the main process validates the cached alias again and launches exactly
`ssh -tt alias`. System OpenSSH retains all configuration and authentication.
Tmux is available locally on macOS and Linux and through SSH on every SSH
platform. Discovery reads `tmux -V` before the fixed bounded `tmux list-sessions
-F '#{session_name}'` command; the SSH form runs those exact remote commands
against at most 16 strict aliases. A missing tmux server still exposes one host-generated New
target, named `stuffbucket-` plus 32 lowercase hexadecimal characters; a
missing binary is unavailable. Existing session names and SSH aliases remain in
the owner- and generation-scoped main-process target cache. The renderer sees
only neutral `Tmux session N` or `New tmux session` labels and opaque ids.
Tmux 3.4 and newer launches use `tmux -T hyperlinks new-session -A -s NAME` or
`ssh -tt ALIAS tmux -T hyperlinks new-session -A -s NAME`; older clients omit
the unsupported feature flag. Both renderer emulators support OSC 8 links, and
no renderer value becomes command text. Closing a
terminal, its owner window, or the app kills only the local tmux or SSH client
PTY. The tmux server and session survive, while renderer scrollback and an SSH
connection do not. Multiple windows may attach to an existing tmux session;
tmux owns terminal-size arbitration.

Tmux Control (Experimental) is a separate local macOS/Linux capability. Its
main-process control client selects one pane and forwards that pane through the
existing terminal channel, so Ghostty excludes tmux status, copy, and choose
interfaces. It has no SSH form. The client bounds protocol and output backlog
and closes on a protocol failure; renderer acknowledgement does not currently
drive tmux `pause-after` flow control.

`TmuxProjectionBroker` is the reusable multi-client policy above ordinary tmux
client PTYs. One logical session holds canonical columns and rows, zero or one
focus owner, a monotonic focus epoch, and any number of projections. Each
projection receives its own tmux-rendered VT stream. Only the projection that
names the current focus epoch may write or resize. An accepted resize applies
to every client PTY, so tmux receives one geometry regardless of renderer
window size. Detaching or losing a projection kills only that tmux client.
Explicit session termination kills every client and calls the consumer's tmux
session terminator.

The broker takes process creation and session termination as callbacks. A
consumer may attach local tmux, SSH plus tmux, or another connector without
putting command construction in the renderer. Tmux control mode stays on a
separate host-only connection. `TmuxProjectionHost` retains the trusted attach
and termination commands for the reference Electron host. The
`pty:projection-*` channels carry opaque session and projection ids plus the
focus epoch. Attach, focus, write, resize, and detach stay separate so stale
input cannot become current merely by arriving later. Existing `pty:*` calls
remain the compatibility path and drive the first projection of a tmux launch.

The connector is mutation tested through `command-connectors.ts`. Command-backed
sessions are ephemeral and non-reconnectable:
closing their view terminates the command, and the application does not claim
detach support.

```
keystroke -> term.onData -> `pty:write` channel -> shell
shell     -> `pty:data` event                   -> term.write
term.write -> `pty:ack` channel                 -> shell
```

Four details are load-bearing.

- **A session belongs to a window.** `pty.ts` holds one `TerminalHost` per
  `BrowserWindow` and reaps it on `closed`, so a window that goes away takes
  its shells with it and cannot reach another window's. Quit reaps every one.
  A request that arrives with no window is refused: nothing would reap it.
  A detached session is reaped the same way; detach is a view's lifetime, not
  a window's.
- **`TerminalHost` batches output.** A build log emits thousands of small
  writes per second. One message each would swamp the channel, so it coalesces
  on an 8 millisecond timer.
- **Output has a bounded acknowledged window.** The shipped `pty:ack` channel
  cumulatively confirms `pty:data.sequence` after the emulator finishes a
  write. `MAX_IN_FLIGHT_BYTES` bounds IPC output. A pausable pty stops at its
  high watermark and resumes at `RESUME_LOW_WATERMARK`; a non-pausable pty
  retains only the newest `MAX_PENDING_BYTES` tail and reports one loss notice.
  The host sends `pty:exit` only after prior output is acknowledged.
- **Terminals stay mounted.** Switching tabs hides the inactive host rather
  than unmounting it. A remount loses the scrollback, which lives in the
  emulator, and by default kills the shell as well.
- **Tab and session identity differ.** The renderer owns tab ids and gives each
  terminal tab an opaque session id. IPC keeps the backward-compatible `id`
  field name for that session id. `pty:status` reports `started` after host
  registration and `exited` only for the current process generation.
- **The content policy permits WebAssembly.** `script-src` needs
  `'wasm-unsafe-eval'`. Vite emits wterm's `ghostty-vt.wasm` as a same-origin
  package asset, so `connect-src 'self'` covers its startup fetch.

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

- **It still has an owner.** `TerminalHost.terminateAll` covers every session
  it holds, so closing the window and quitting reap a detached shell exactly as
  they reap an attached one.
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

In this shell the `terminalDetach` preference is off by default. With it on,
closing a terminal tab leaves the shell running, the inspector lists what is
running with no tab, and clicking one reopens its tab and attaches.

### The terminal and the theme

The emulator draws to a canvas. It is the one surface that cannot inherit
colours from CSS. `src/renderer/lib/theme.ts` resolves three design tokens to
literal values, and the terminal starts with those.

**A terminal keeps the scheme it opened in.** Those colours reach the
WebAssembly terminal at construction. They become the default background,
foreground, and palette of every cell. `renderer.setTheme` changes only the
layer those cells cover. Assigning `options.theme` after `open()` does nothing,
and logs a warning. The supported route is `reset()`, which rebuilds the
WebAssembly terminal and wipes the screen and the scrollback.

Losing a build log to a theme toggle is the worse trade. So a running terminal
keeps its colours, and a new tab picks up the current scheme.
`e2e/shell.spec.ts` asserts both from canvas pixels. The value handed to the
emulator proves nothing about what reached the screen.

### Packaging the native module

`node-pty` is native, and this is the part that breaks quietly.

It stays external to the Vite bundle. Bundling it would inline code that
resolves a `.node` file by relative path, and that path does not survive the
move into `.vite/build`. Being external means it has to arrive as real files.

Forge's Vite plugin sets `packagerConfig.ignore` to "keep only `/.vite`",
because it assumes everything is bundled. That excluded the module entirely.
The package built, every test passed, and a user would still have had no
terminal. `forge.config.ts` now supplies its own `ignore`, and
`scripts/verify-package.mjs` asserts the module is present.

That `ignore` is the whole filter, because `packagerConfig.prune` is `false`.
Packager's own walk keeps `dependencies` and drops the rest, while this package
declares no runtime dependencies. An external native module therefore goes in
`devDependencies` and reaches the reference package through the keep-list.

`*.node` is not the whole of it. On macOS `node-pty` `execvp`s `spawn-helper`,
which sits beside `pty.node` and has no extension, at a path it rewrites from
`app.asar` to `app.asar.unpacked`. An `unpack` glob of only `*.node` leaves the
helper inside the archive and every shell fails to start with
`posix_spawn failed`. The whole prebuild tree is unpacked instead. Windows needs
the same treatment for `conpty.dll` and `OpenConsole.exe`, which `conpty.node`
loads.

**The package comes from Microsoft.** `@lydell/node-pty` repackages the same
published tarball — the binaries and the seven files in the package's `lib`
directory hash identically — and adds a single maintainer with no continuous
integration.
Microsoft ships every platform in one 26 MB package instead of a prebuild per
platform (their issue #864), so `prunePtyPrebuilds` in `forge.config.ts` drops
the ones a given build cannot use. It runs as `packageAfterCopy` rather than in
`packagerConfig.ignore`, because the `ignore` predicate is handed a path and
not the target platform, and a cross-platform build would otherwise keep the
build host's prebuild.

The binary is Node-API: 38 `napi_*` imports and no V8 symbols. One binary per
platform serves every Electron version, which is why `@electron/rebuild` does
not appear anywhere in this repository. A registry install runs
`scripts/prebuild.js`, which checks that the prebuild directory exists and exits
0. `node-gyp` fires only on an unsupported platform or under
`npm_config_build_from_source`.

Every runtime dependency is pinned to an exact version. `^1.2.0-beta.14`
admitted every later beta on a prerelease line, plus every 1.x release.
`tests/package-exports.test.ts` holds that rule.

## Crash artifacts

The reference application starts `crashReporter` with uploads disabled.
`runMain` leaves collection off unless a consumer sets `collectCrashDumps` and
supplies the reporter through `MainRuntime`.

`host/crash-artifacts.ts` asks Electron for the `crashDumps` directory and scans
it recursively because Crashpad's layout differs by platform. The Help menu
opens that directory when collection is enabled. Nothing uploads the files.

## The terminal a consumer gets

Five exports, and they are deliberately separate.

| Export | What it is |
| --- | --- |
| `./renderer` | `TerminalView` and `TerminalTabs`, the `TerminalTransport` contract, `createTerminalTransport` which builds one, and `readTerminalTheme`. |
| `./host/terminal` | `TerminalHost`, its `node-pty` connector, and `registerTerminalChannels`, which answers a consumer's channels from one. |
| `./electron-terminal` | The reference application's Electron IPC and terminal-launcher adapter. |
| `./renderer/styles.css` | `shell-structural-tokens.css` and `shell-package-rules.css`, which carry the terminal rules. |
| `./verify` | The packaging assertions, as a function to run against a consumer's own build. |

### Verifying a consumer's own package

A consumer inherits both traps and none of the checks. `./verify` closes that,
and `scripts/verify-package.mjs` calls the same function, so the two cannot
drift.

```js
import { readdirSync } from 'node:fs';
import { listPackage } from '@electron/asar';
import { terminalPackageChecks } from '@stuffbucket/maximal-electron/verify';

const resources = 'dist/mac-arm64/YourApp.app/Contents/Resources';
const checks = terminalPackageChecks({
  packedFiles: listPackage(`${resources}/app.asar`),
  unpackedFiles: readdirSync(`${resources}/app.asar.unpacked`, {
    recursive: true,
    encoding: 'utf8',
  }),
  platform: process.platform,
  arch: process.arch,
  contentSecurityPolicy: "script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'",
});

for (const { name, ok } of checks) if (!ok) throw new Error(name);
```

It is plain ESM under `scripts/`, not TypeScript in `src/`, because `dist/` is
ESM syntax in a package with no `"type": "module"`: a bundler reads it and
`node` refuses it. A packaging check runs under plain `node`.

The first three checks it returns are floors. Point either list at the wrong
directory and it is empty, and omit `contentSecurityPolicy` and there is no
policy to measure; in each case every assertion over the missing input would
otherwise report a pass. That is not hypothetical: the policy was optional and
this repository's own caller supplied none, so the WebAssembly grant
above were never measured against a shipped document. Read the policy out of the
HTML the build produced, as `scripts/verify-package.mjs` does, rather than
restating it beside the call.

`TerminalView` takes its transport as a value. It knows nothing about an IPC
contract, so a consumer wires `TerminalHost` to whatever channels they already
have. Hand-writing that wiring is no longer part of it:
`createTerminalTransport` builds the renderer half from the caller's `invoke`,
`on` and channel names, and `registerTerminalChannels` answers the five request
channels from a `TerminalHost`. `docs/embedding.md` has both calls.

The transport `createTerminalTransport` returns is a
`DetachableTerminalTransport`, so `disposition="detach"` works without a sixth
method. A consumer writing the object by hand still owes `list`, because the
type demands it: a shell that outlives every view and that nothing can
enumerate is a process the user cannot see and cannot stop, so the prop refuses
the half of the pair that leaks.

`TerminalHost` is an instance, not module state, so a consumer with two windows
gets two registries and closing one cannot reap the other's shells. This shell
uses it the same way: `src/main/native/pty.ts` keys one instance per
`BrowserWindow`. It imports no `electron`: the home directory, the default
shell, and any extra environment such as `TERM_PROGRAM` are supplied, because
`app.getPath` is not this module's to call and the product name is not its to
know.

Three custom properties have no declaration in any stylesheet and cannot have
one. The emulator renders to a canvas and takes literal colours at
construction, so `--shell-terminal-background`, `--shell-terminal-foreground`
and `--shell-terminal-cursor` are read by `readTerminalTheme` in JavaScript.

## Design tokens

`src/renderer/styles/tokens.css` follows the scale and the naming in
`maximal`'s `shell/src/ui/styles/tokens.css`, so a component can move between
the two projects. The palette differs, because this is a document-style
application rather than a menu-bar utility.

Components reference semantic names only. No component contains a hex value.

### Contrast

`src/renderer/lib/contrast.ts` records which token is drawn on which surface,
and therefore which pairs must be legible, plus every token the stylesheets
read. `npm run check:contrast` measures the palette against it, and CI runs it.

Three failures are reported separately, because they need different fixes: a
token that is not defined, a token defined in a form the check cannot read —
anything but `#rgb` or `#rrggbb` — and a pair that reads fine and does not
contrast. An unreadable pair is never counted as a pass.

## Native integration

| Feature | Module | Note |
| --- | --- | --- |
| Splash | `windows/splash.ts` | Self-contained HTML. A timer closes it, so a missed signal cannot strand it. |
| Application menu | `native/menu.ts` | Sends typed events. It never mutates renderer state directly. |
| Menu bar or tray | `native/tray.ts` | Optional, driven by a preference. macOS needs a `Template` image. |
| Icons | `native/icons.ts`, `native/app-icon.ts` | One directory, named by `STUFFBUCKET_ICON_DIR`. Resolution is pure, takes the platform as an argument, and is mutation tested. |
| Notifications | `native/notifications.ts` | Also owns the dock bounce. |
| Dock badge | `native/notifications.ts` | The renderer reports a count; the main process decides whether to show it. |
| Preferences | `native/preferences.ts` | One JSON file under `userData`. |
| Updates | `native/updates.ts` | Returns `unsupported`. See `docs/release.md`. |
| Electron panel | `host/electron-panel.ts` | Reusable transparent panel mechanics; the consumer owns content and policy. |
| Crash artifacts | `native/crash-reports.ts`, `host/crash-artifacts.ts` | Starts Crashpad, finds the dumps, opens the directory. Resolution is pure and mutation tested. |

The menu and the tray both route through `sendEvent`, so the React shell stays
the single owner of view state.

### The Electron panel

`host/electron-panel.ts` owns only `BrowserWindow` and display mechanics. The
consumer supplies the preload path, renderer loader, bounds, stacking policy,
and focus policy. The export keeps hardened web preferences and supports warm
hide/reuse plus explicit destruction.

### The application icon

Two halves, and they answer different questions.

**Build time** is what a user sees after installing. `forge.config.ts` sets
`packagerConfig.icon` from `STUFFBUCKET_ICON_DIR`, which defaults to
`build/icons`. macOS reads the bundle, Windows reads the executable. `bundleIcon`
in `scripts/package-contract.mjs` names the format each one needs, and
`forge.config.ts` then checks that file is present, because a missing bundle icon
is silent: packager warns and ships the Electron default.

**Run time** is what the developer sees, and what the tray needs. The main
process loads `icon.png` for the dock and for the `BrowserWindow` icon, and the
coloured Tauri icon at 22pt or 44px retina for the menu bar and system tray.
Those files ship beside `app.asar` rather than inside it, because they are read
as files.

`src/main/native/icons.ts` decides which directory that is and which file each
platform takes, and imports no Electron, so both decisions are unit and mutation
tested. `windowIconName`, `dockIconName` and `trayIconChoice` read their inputs
rather than `process.platform`, so a run on any host answers for all three
targets. The tray choice is deliberately the same coloured image everywhere;
macOS must not tint it as a template. `src/main/native/app-icon.ts` is the thin
part that touches `nativeImage`, and `tests/app-icon.test.ts` mocks Electron to
check the decision reaches it.

**A development run on macOS shows Electron's dock icon.** Packaging cannot
change that, because there is no bundle. `app.dock.setIcon` is the only way to
see a different one before a build, and `bootstrap` calls it. So a stock icon
during `npm start` on a build predating this is not a defect.

**There is no channel.** A renderer that can name a file and have the main
process load it as an image has an arbitrary file read and a path traversal
surface, and the icon is a decision belonging to whoever launched the
application rather than to a document. The seam is the environment and the
`createHostWindow` options, both of which the host owns.

## Build output

| Source | Output | Why |
| --- | --- | --- |
| `src/main/index.ts` | `.vite/build/main.js` | `entryFileNames` is explicit, or it collides with preload. |
| `src/preload/index.ts` | `.vite/build/preload.js` | Emits CommonJS: a sandboxed preload cannot use ES modules. |
| `src/renderer/*.html` | `.vite/renderer/main_window/` | `root` is set, so `outDir` must be absolute. |
| `e2e/fixtures/demo-shell/` | `.vite/renderer/demo_window/` | The capture fixture. Built here, then dropped from the package. |

That last row is a real trap. Forge's default `outDir` is relative to the root
it supplies. Override `root` without also setting `outDir` and the renderer
builds into `src/renderer/.vite/`, where the package never finds it.

The capture fixture is a second renderer entry rather than a branch inside the
first. It used to be a subtree of `src/renderer/` chosen at mount time by a
query parameter, which meant sample run data shipped inside the application a
user installs. `forge.config.ts` excludes its output, and
`npm run verify:package` fails if it ever returns.

## Testing

| Layer | Tool | Covers |
| --- | --- | --- |
| Unit | Vitest | Main-process logic and contract types. |
| End to end | Playwright | Behaviour and computed layout, against the built bundles. |
| Packaging | `scripts/verify-package.mjs` | asar contents, the shipped content policy, and fuse values. |

The third layer exists because the second cannot reach it. Playwright attaches
through the Node inspector, and `EnableNodeCliInspectArguments: false` disables
that on a packaged binary. So the end-to-end tests drive the unpackaged build,
and a separate script checks what only a package can show.

Reference screenshots go through `capture` in `e2e/harness.ts`, not
`page.screenshot`. macOS stops compositing an occluded window. The plain call
then blocks until its timeout instead of returning. `capture` reads the
renderer through the debugger. So it does not depend on what is in front.

A run also keeps off the developer's screen. Under `STUFFBUCKET_E2E` the
windows move off the side of the display instead. They still show, still report
visible, and still lay out identically. `STUFFBUCKET_E2E_VISIBLE=1` puts them
back.

Moving them is deliberate. Making them transparent works too, and it stops the
compositor producing content. The images came out blank while the suite stayed
green. `capture` now rejects an image under a size floor for that reason.

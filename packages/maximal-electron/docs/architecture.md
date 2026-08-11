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
   `tests/terminal-channels.test.ts` covers the seam the two registrations
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

`ghostty-web` supplies the terminal. It is Ghostty's own virtual terminal
implementation compiled to WebAssembly, with the xterm.js API on top. Coder
built it for Mux, and it is MIT licensed.

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

```
keystroke -> term.onData -> `pty:write` channel -> shell
shell     -> `pty:data` event                   -> term.write
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
- **Terminals stay mounted.** Switching tabs hides the inactive host rather
  than unmounting it. A remount loses the scrollback, which lives in the
  emulator, and by default kills the shell as well.
- **The content policy needs two additions.** `script-src` needs
  `'wasm-unsafe-eval'`, and `connect-src` needs `data:`. `ghostty-web` inlines
  its WebAssembly module as a data URL and fetches it at startup, so there is
  no separate asset to serve.

### Detaching a session from its view

Unmounting a `TerminalView` terminates its session. That is the default, and
changing it would leak a process for every caller that relies on a view going
away ending a shell. `disposition="detach"` opts out, and then the shell keeps
running with nothing showing it, which is what a long build needs and what
`tmux detach` means.

Three things make that a detach rather than a leak.

- **It still has an owner.** `TerminalHost.terminateAll` covers every session
  it holds, so closing the window and quitting reap a detached shell exactly as
  they reap an attached one.
- **It can be found.** `TerminalHost.list` returns every live session, and the
  `pty:list` channel carries that to the renderer. Nothing signals a detach,
  because a detach is the absence of a terminate, so the set of detached
  sessions is derived: `detachedSessions` subtracts the ids the renderer holds
  views for. There is no attached flag in the main process to fall out of step
  with the views.
- **It can be attached to.** `TerminalHost.spawn` on an id it already holds
  resizes that session and replays what it retained, rather than refusing.

**What survives a detach is the process, not the screen.** The scrollback lives
in the `ghostty-web` emulator, in the renderer, and it dies with the view. The
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
Packager's own walk keeps `dependencies` and drops the rest, and this package
declares no runtime dependencies at all — a consumer importing `./host` would
otherwise install `node-llama-cpp` for a module that imports `electron` alone.
A new external native module therefore goes in `devDependencies`, and reaches
the package through the keep-list rather than through `dependencies`.

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

## What llama.cpp backend the package ships

`node-llama-cpp` keeps its prebuilt binaries in the `@node-llama-cpp` scope,
one package per target and backend, named `<os>-<arch>[-<backend>]`. npm
selects them by the `os` and `cpu` fields alone, and those are wider than one
build. Several packages declare `cpu: ["arm64", "x64"]` so that one host can
build for the other, so a `win32-x64` install also receives `win-arm64` and a
`linux-x64` install also receives `linux-arm64`. Neither can ever load:
`node-llama-cpp` resolves a package from `process.arch` at run time.

`pruneLlamaBackends` in `forge.config.ts` drops what the target cannot use. The
plan is `llamaPackagePlan` in `scripts/package-contract.mjs`, which
`scripts/verify-package.mjs` reads as well, so the packages the build deletes
are the packages the check stops expecting.

**A GPU backend is dropped unless the build asks for it.** On `win32-x64` that
is 505 MB of CUDA across two packages and 94 MB of Vulkan, against 45 MB for
the CPU package. `linux-x64` is the same shape and 630 MB. The application
ships no weights and its embedded model is Qwen3 0.6B, a floor under the
provider chain rather than the performance path, so nine tenths of the packaged
application existed to accelerate the smallest thing it runs.

The consequence is real and is the reason this is a stated behaviour rather
than a size fix: **a machine with a CUDA GPU runs the embedded model on its
CPU.** `node-llama-cpp` logs the fallback and carries on. To ship the backend,
set `STUFFBUCKET_LLAMA_BACKENDS` when packaging:

```bash
STUFFBUCKET_LLAMA_BACKENDS=cuda npm run package
STUFFBUCKET_LLAMA_BACKENDS=cuda,vulkan npm run package
STUFFBUCKET_LLAMA_BACKENDS=all npm run package
```

A name the list does not know throws rather than being ignored, because the
failure it prevents is a CPU-only package built by someone who wrote `CUDA` and
believes otherwise. `cuda` keeps both `win-x64-cuda` and `win-x64-cuda-ext`:
the `-ext` package holds a fallback `ggml-cuda.dll` reachable only through the
cuda branch of the resolver, so it travels with that backend or not at all.

`metal` is not on the optional list. `mac-arm64-metal` is the only `mac-arm64`
package, so dropping it would leave that target with no llama.cpp rather than
with a slower one.

A cross-platform `npm run package -- --platform=<other>` now fails instead of
building, because npm installed only the host's prebuild packages and the plan
keeps none of them. Before this, `--platform=linux` on a mac produced a Linux
package whose only llama.cpp backend was 12 MB of macOS `.dylib` files, and
nothing said so. CI packages natively on each runner, so no job changes.

`e2e/embedded.spec.ts` drives the embedded provider against the unpackaged
build and the repository's own `node_modules`, which is the tree before the
prune. What exercises the packaged tree is below.

## Why llama.cpp runs in its own process

A native abort is not a JavaScript exception. A corrupt GGUF, an out-of-memory,
or an unsupported quantisation ends in `abort()` or a fault, and no `try` sees
it. With the engine in the main process, that took every window and every
terminal session with it.

It is reproducible. Truncate the weights file underneath the live mapping and
llama.cpp reads past the end of it: the process dies of `SIGBUS` with no
JavaScript error, no `exit` event, and nothing written to disk. Issue #133.

So `src/main/llama-worker.ts` is the only file in the repository that loads
`node-llama-cpp`, and it runs as an Electron `utilityProcess`. The two things
that must stay shared survive the boundary: a tool call becomes a message the
main process answers, so the approval gate is still the one gate, and a token
is posted as it is produced, so nothing accumulates a response.

**One loading path, not two.** The download moved with the engine, even though
it is ordinary JavaScript, because a second place that imports the library is a
second place that can die.

`native/llama-host.ts` supervises. When the engine goes, every outstanding
operation ends with a sentence naming the fault, and the next request starts a
new engine — **on demand, never on a timer, and at most three times a minute**.
A silent restart loop is worse than a crash: past the budget the engine reports
that it will not start again until the application restarts.

What it costs, measured on an M-series mac:

| | |
| --- | --- |
| Fork to `spawn` | 2 ms |
| Idle child before llama.cpp loads | 70 MB |
| First `getLlama()` on a cold Metal shader cache | 9.3 s |
| `getLlama()` warm | 0.4 s |
| Resident after the weights load | ~1.0 GB, in the child rather than in main |

The last row is the real trade: the same gigabyte, held somewhere the operating
system can reclaim by killing one process.

## What exercises the packaged llama.cpp

`npm run smoke:packaged` now launches the installed binary with
`--self-check=llama`, on both packaging hosts. The application forks its engine,
makes it load `node-llama-cpp` out of `app.asar.unpacked` through a
`utilityProcess`, and then makes it fault in native code. A pass needs both
halves: the library resolved from the child, and the main process outlived the
fault well enough to print a line about it. A negative control moves the
`@node-llama-cpp` scope aside and requires the same run to fail by reporting the
engine.

### It is launched from outside this repository

`out/` sits inside the checkout, so a package started in place resolves modules
one directory above itself and reaches the repository's own `node_modules`.
That is 600 MB the build never ships. On `win32-x64` it is where the engine
found the vulkan prebuild `pruneLlamaBackends` prunes, and the `#113` negative
control found it too — the control moves the scope **inside** the package, not
the one above it, so both runs took a branch no user's install can take.

`scripts/packaged-app.mjs` copies the package to a temporary directory first,
and both `smoke:packaged` and `verify:crash-artifact` launch it from there.
`nodeModulesAbove` states the property as two assertions rather than as an
intention: that something is above `out/`, which is the premise and fails at
zero, and that nothing is above the copy.

A copy rather than a move, because `verify:package` reads `out/` and
`verify:crash-artifact` runs after `smoke:packaged` on the same build.

**On `darwin-arm64` this changes nothing, which was worth measuring.** With the
scope moved aside the in-place run already failed with `NoBinaryFoundError`, so
resolution was not escaping the package there;
`detectBestComputeLayersAvailable` short-circuits to `["metal"]` and never
reaches the branch that walks up. `device=metal` and `loadMs` are the same
either way once the Metal shader cache is warm — 206 ms relocated against
231 ms in place. The first run from each temporary directory pays a cold cache
and costs about 9.4 s, which is inside the 60 s `engineCheckTimeoutMs` allows.

**The fault name is pinned per platform, from a run rather than from a table.**
macOS reports a signal death as the bare signal number, so `SIGSEGV` is
asserted by name against 11. Windows reports the status code, so
`access violation` is asserted against `0xC0000005`. The assertion that holds
everywhere is that the supervisor named it as a fault: a code
`llama-protocol.ts` cannot name reads as "exited with code N", which fails the
check and puts the number in the log to be pinned. That is how #154 pinned 134,
and how #156 found out what 134 was.

**On Windows the code depends on the crash reporter being up.** The same
`process.crash()` reports `0xC0000005` with Crashpad's handler installed and
`native fault 0xffff7003` without it, measured by suppressing
`startCrashReports()` on a `windows-latest` run. So a `0xffff7003` in a report
means the reporter was not running, and is not a fault worth naming in the
table.

## The embedded engine was gated off on Windows, and is not any more

From #144 until #149 `embeddedEngineStatus` reported the provider unavailable
on `win32`, because the packaged self check waited out its whole limit there,
twice, including with the `@node-llama-cpp` scope moved aside where it should
fail in milliseconds. A spinner forever is worse than a legible error, so
`discoverProvider` fell through and a Windows user read a sentence.

**What produced that was where the check ran, not the platform.** Both runs
launched `out/Stuffbucket-win32-x64` in place, inside this repository, and both
reached a vulkan prebuild in the repository's own `node_modules` that the build
prunes. Launched from a copy with nothing above it, the packaged binary names a
device. The gate is gone, and `embeddedEngineStatus` with it.

**It is not `getLlama()` either.** #144 read the absent 30 s import bound as
proof that the module graph had loaded and the engine call was what stopped.
That reading was wrong. Building the environment one rung at a time on
`windows-latest`, `getLlama()` returns and names a device every time:

| Where | What came back |
| --- | --- |
| Bare node, no Electron | `gpu=false` in 583 ms |
| An Electron main process | `gpu=false` in 438 ms |
| An Electron `utilityProcess` | `gpu=false` in 440 ms |
| The same two, against the packaged `node-llama-cpp` tree | `gpu=false` in 458 ms |
| `.vite/build/llama-worker.js` forked as a `utilityProcess` | `device=cpu loadMs=877` |
| The same bundle read out of `app.asar` | `device=cpu loadMs=943` |
| The same, from a package copied outside this repository | `device=cpu loadMs=647` |

The last three are the application's own engine, driven the way
`src/main/native/llama-host.ts` drives it.

**What Windows does that macOS does not is fork a process.**
`getShouldTestBinaryBeforeLoading` in `node-llama-cpp` is `false` on macOS for
every binary and `true` on Windows for any prebuilt binary whose backend is not
`false`. `windows-latest` has `vulkan-1.dll`, so the engine tries a vulkan
prebuild first and tests it before loading. `testBindingBinary` runs that test
by forking `process.execPath` — and the packaged binary, told to run a script,
loads `app.asar` instead and answers nothing:

```
[fuse-fork] Stuffbucket.exe running .../node-llama-cpp/dist/bindings/utils/testBindingBinary.js
  with ELECTRON_RUN_AS_NODE=1 after 20015 ms -> HUNG: nothing in 20 s
```

The same file under `node` answers `{"type":"ready"}` in 376 ms.
`testBindingBinary` waits five minutes for that answer, and
`engineCheckTimeoutMs` gives up at three, which is the timeout #149 opens with.

**And a build ships no vulkan prebuild.** `pruneLlamaBackends` keeps only
`@node-llama-cpp/win-x64`. The engine found one anyway because `out/` sits
inside this repository, so the resolution walked one directory above the package
into `node_modules`. The last row of the table is the same package copied to a
temporary directory, where nothing is above it: no test, no fork, and llama.cpp
loaded. Moving the `@node-llama-cpp` scope aside inside the package did not
move that copy, which is why the `#113` negative control hung for exactly as
long as the real run. Both checks now launch from a copy, as above.

The rung nothing had run was `--self-check=llama` inside `Stuffbucket.exe`,
which the gate short-circuited. `smoke:packaged` runs it now, from a copy of
the package outside this repository, and asserts the same four things it
asserts on macOS: that the engine named a device, that the main process
outlived the fault, that it named a fault rather than a bare exit code, and
that the `#113` control fails by reporting a library that would not load.

**The half that is upstream is untouched.** A build that ships a GPU backend —
`STUFFBUCKET_LLAMA_BACKENDS=vulkan` or `cuda` — still takes the fork, on a real
machine and not only in CI, and still waits five minutes for an answer.
`testBindingBinary` assumes a fork of `process.execPath` yields a node process,
which is false for any Electron application with the recommended fuses burned.
The default build does not ship such a backend, so it does not reach that path.
`engineCheckTimeoutMs` keeps its 180 s ceiling on Windows for the same reason.

### What the diagnosis cost, and what actually found it

Three explanations were proposed for the Windows hang and all three were wrong:
a slow `getLlama()`, a `spawn` event that never fires, and a request that never
arrived. What moved each step forward was not a theory but making the check
report what it did rather than that it passed:

| Added | What it settled |
| --- | --- |
| `phase` | The child had started, so it was not a fork or resolution failure |
| `released-by` | The queue flushed, and on which signal |
| `queued` | Nothing was left held, so delivery was not the problem |
| `ack` | The child read the request, which moved the fault past the boundary |
| `loadMs` | 256 ms on macOS, so slowness was never a plausible cause |

Two of those found bugs in the instrumentation itself before they found
anything about Windows: `released-by=nothing` on a run that plainly worked,
because the record was already cleared by the time the reporter read it. A
green check that says only "ok" would have hidden both.

That check found a defect on its first run. `packagerConfig.prune` is off and
the keep-list names directories, so a dependency npm hoisted out of
`node-llama-cpp` never reached the package: the library failed to load with
`Cannot find module 'universalify'` in every build ever made. `verify:package`
read names out of the archive listing, `smoke:packaged` only opened a shell, and
`e2e/embedded.spec.ts` drives the unpackaged tree where the hoisted packages are
all still there. `hoistedDependencies` in `scripts/package-contract.mjs` derives
the closure from the installed tree, `forge.config.ts` keeps it, and
`verify-package.mjs` asserts it arrived — 64 packages and 13 MB on
`darwin-arm64`. Issue #133.

## Crash artifacts

`crashReporter.start({ uploadToServer: false })` runs before anything else in
`src/main/index.ts`, above the branch that dispatches the self checks, because
those are the runs that crash on purpose. Nothing is uploaded: there is no
`submitURL`, no service, and no credential. Issue #134.

**Where the dumps land.** `app.getPath('crashDumps')`, which is
`<userData>/Crashpad`. On macOS the database holds `settings.dat` and the
directories `pending/`, `completed/`, `new/` and `attachments/`, and a dump
arrives as `pending/<uuid>.dmp` at 570 KB to 815 KB. On Windows it is
`%APPDATA%\<product>\Crashpad`, read off a packaged `windows-latest` run, and
the engine's dump is 34 MB. `host/crash-artifacts.ts` scans it recursively
rather than by name, because those names are Crashpad's and differ by platform.

**The call is what produces the artifact, not Electron on its own.** With the
start suppressed and everything else unchanged, the same crash left no file and
no directory — not an empty database, an absent one. That was measured on
Electron 43 before any of this was written.

| Process | Covered | Established by |
| --- | --- | --- |
| `utilityProcess` (the engine), macOS | yes | `npm run verify:crash-artifact` on a packaged build |
| `utilityProcess` (the engine), Windows | yes | `npm run verify:crash-artifact` on a packaged build. Issue #156 |
| Renderer | yes | A `forcefullyCrashRenderer` run on Electron 43. No check drives it |
| Main | yes | A `process.crash()` run on Electron 43. No check drives it |

The `utilityProcess` is the one worth checking. Since #144 the application
survives a native fault in the engine, so that crash now leaves nothing behind
except a sentence that scrolls away. The other two end the process, which is at
least visible.

**What a developer can do with the file.** Not much on its own: a minidump
needs a symbol-aware reader, and this repository publishes no symbols. What it
buys is that the fault is recorded at all, with a time and a process, so a
report of "it crashed and carried on" has something attached to it. The Help
menu has **Show Crash Reports**, which opens the directory, because a user
attaching the file to an issue is the only route it has while nothing is
uploaded.

**Nothing prunes the database.** Crashpad's own retention is what bounds it.

### What proves it

`npm run verify:crash-artifact` launches the packaged binary twice, each into a
throwaway profile given by `--user-data-dir`, and from a copy of the package
outside this repository for the reason above. The first run is
`--self-check=terminal`: it starts the reporter, crashes nothing, and must
leave a database with no dump in it. The second is `--self-check=llama` —
#144's crash, not a new one — which forks the engine, loads the packaged
llama.cpp, and calls `process.crash()` in it. That run must leave a dump where
the first left none, on both packaging hosts.

Both platforms crash now. #149's Windows gate is retired, so a run that does
not report the engine loading and dying is a defect rather than a disposition,
and the check demands that on both packaging hosts.

**`process.abort()` was the wrong instrument, and that is what #156 was.** Node
defines `ABORT_NO_BACKTRACE()` as `_exit(134)` on Windows rather than as
`abort()`, so the engine's `process.abort()` never faulted there: it exited
cleanly with Node's own abort exit code. Nothing raised an exception, so
Crashpad had nothing to record, and the coverage table said **no** for a
platform whose reporter was working the whole time. The 134 in `faultName` is
that exit code, not a signal and not an NTSTATUS.

Electron's `process.crash()` writes through a null pointer, which faults on
every platform — SIGSEGV on macOS, `STATUS_ACCESS_VIOLATION` on Windows — and
`shell/services/node/node_service.cc` binds it into the utility process as well
as the main one. The engine uses it, and both platforms leave a dump.

**A native `abort()` from inside a loaded library is still not covered on
Windows**, and no check here can cover it: it is
[electron#36862](https://github.com/electron/electron/issues/36862), confirmed
upstream and open. So a fault in ggml is recorded and an assertion failure
inside it may not be. That is a narrower gap than #156 described, and it is
upstream rather than here.

## The terminal a consumer gets

Four exports, and they are deliberately separate.

| Export | What it is |
| --- | --- |
| `./renderer` | `TerminalView` and `TerminalTabs`, the `TerminalTransport` contract, `createTerminalTransport` which builds one, and `readTerminalTheme`. |
| `./host/terminal` | `TerminalHost`, the pty manager, and `registerTerminalChannels`, which answers a consumer's channels from one. |
| `./renderer/styles.css` | `structural.css`, which carries the terminal rules. |
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
  contentSecurityPolicy: "script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' data:",
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
this repository's own caller supplied none, so the two `ghostty-web` grants
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
| Overlay | `windows/overlay.ts` | Non-activating panel on the cursor's display. |
| Agent | `native/agent.ts` | Ranks backends, then runs one. No API key. |
| Embedded model | `native/llama.ts` | Where the weights live, and the download. Loads nothing itself. |
| Embedded run | `native/embedded.ts` | The main-process half of a turn: the gate and the sink. |
| Engine supervisor | `native/llama-host.ts` | Forks the engine process, and turns its death into a sentence. |
| Engine wire | `native/llama-protocol.ts` | The messages and the crash policy. Pure, and mutation tested. |
| Crash artifacts | `native/crash-reports.ts`, `host/crash-artifacts.ts` | Starts Crashpad, finds the dumps, opens the directory. Resolution is pure and mutation tested. |
| Engine process | `llama-worker.ts` | The only file that loads `node-llama-cpp`. Runs as a `utilityProcess`. |
| Tool approval | `native/approval.ts` | Decides what the agent must ask about. Pure, and mutation tested. |
| Toolsets | `native/toolsets.ts` | Named groups of tools. Each tool declares its own risk, so the gate cannot go stale. |
| Schema bridge | `native/grammar.ts` | Translates tool schemas for llama.cpp. Pure, and mutation tested. |

The menu and the tray both route through `sendEvent`, so the React shell stays
the single owner of view state.

### The overlay window

`windows/overlay.ts` builds a `BrowserWindow` with `type: 'panel'`, held above
full-screen applications by `setAlwaysOnTop(true, 'screen-saver')`, and placed
on the display `getDisplayNearestPoint` returns for the cursor. A preference
holds the accelerator that summons it.

Two behaviours are deliberate.

- **It does not hide on blur.** The window covers the display, so a click
  outside the card already lands on the scrim. A blur handler on top of that
  makes the card vanish whenever a notification takes focus.
- **`showInactive`, then `focus`.** That pair puts the panel on screen and
  gives it key input without activating this application.

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
tray images for the menu bar. Those files ship beside `app.asar` rather than
inside it, because they are read as files.

`src/main/native/icons.ts` decides which directory that is and which file each
platform takes, and imports no Electron, so both decisions are unit and mutation
tested. `windowIconName`, `dockIconName` and `trayIconChoice` each read a
`platform` argument rather than `process.platform`, so a run on any host answers
for all three targets. `src/main/native/app-icon.ts` is the thin part that
touches `nativeImage`, and `tests/app-icon.test.ts` mocks Electron to check the
decision reaches it. Issue #49: before that, the taskbar icon and the
full-colour tray image had only ever been selected on macOS, where neither is
used.

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
query parameter, which meant a fleet of fake agent runs shipped inside the
application a user installs. `forge.config.ts` excludes its output, and
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

A run also keeps off the developer's screen. The overlay is built to sit above
full-screen applications and take the keyboard, which is correct in production
and hostile during eighteen scenarios. Under `STUFFBUCKET_E2E` the windows move
off the side of the display instead. They still show, still report visible, and
still lay out identically. `STUFFBUCKET_E2E_VISIBLE=1` puts them back.

Moving them is deliberate. Making them transparent works too, and it stops the
compositor producing content. The images came out blank while the suite stayed
green. `capture` now rejects an image under a size floor for that reason.

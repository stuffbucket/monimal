# Embedding

## Exports

| Specifier | Contract |
| --- | --- |
| `./main` | Reusable Electron application lifecycle |
| `./host` | Hardened consumer-owned BrowserWindow creation |
| `./renderer` | React shell, controls, settings, and terminal components |
| `./renderer/styles.css` | Structural shell and component styles |
| `./electron-terminal` | Electron terminal ownership adapter |
| `./electron-panel` | Secondary Electron panel mechanics |
| `./verify` | Native terminal artifact checks |
| `./verify/shell-variables` | Stylesheet variable contract |
| `./verify/peers` | Consumer peer-dependency checks |

The package MUST NOT export a preload, application renderer, product IPC
contract, or application entry point.

## Main lifecycle

Consumers MAY call `runMain(runtime, options)` to reuse profile selection,
single-instance behavior, window activation, and shutdown coordination.

Consumers MUST supply application-specific window creation, renderer loading,
shutdown policy, and native integration through the versioned options object.

The lifecycle API MUST NOT import product packages or select product behavior.

## Host windows

Consumers MUST supply an absolute bundled preload path to `createHostWindow`.

The preload and every API it exposes MUST be owned by the consuming
application.

`createHostWindow` MUST enforce sandboxing, context isolation, disabled Node
integration, and external-navigation denial.

Consumers MAY disable automatic reveal with `showWhenReady: false` and use
`waitForHostWindowReady` before committing a window transfer.

## Renderer ownership

Consumers MUST own tabs, navigation state, account state, settings
capabilities, terminal transport, and product composition.

`AppFrame`, `ShellLayout`, `WindowChrome`, `TabBar`, and the exported controls
MUST remain policy-free rendering primitives.

Components that portal MUST resolve their target document through the shell
root so detached windows receive the same component styles.

The consumer MUST import `@maximal/maximal-electron/renderer/styles.css` and
MUST define the required `--shell-*` palette variables documented in
`shell-variables.md`.

## Terminal composition

Consumers using `TerminalTabs` MUST provide a terminal transport.

Electron consumers MAY use `./electron-terminal` for one terminal host per
BrowserWindow owner.

Consumers packaging native terminal support MUST run the checks exported by
`./verify` against their own asar and unpacked native files.

## Peer dependencies

Every runtime package reached by an export MUST remain an optional peer.

The consuming application MUST install the peers for the subpaths it imports.

`npm run verify:exports` MUST compare the README peer table with the built
entry-point graph.

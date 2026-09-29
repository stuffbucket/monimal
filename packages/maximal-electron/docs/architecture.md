# Architecture

## Package boundary

`@maximal/maximal-electron` MUST remain an embeddable library.

The package MUST NOT contain an Electron application main entry, product
preload, product renderer root, Forge configuration, application HTML, product
IPC contract, application branding, or packaged-application harness.

`apps/desktop` MUST own those application concerns.

## Host APIs

`src/host/run-main.ts` MUST own reusable Electron lifecycle sequencing. Within
the source tree, `host/run-main.ts` is the reusable main-process entry.

`src/host/host-window.ts` MUST create consumer windows with
`contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.

The consumer MUST supply its own preload path and renderer loader.

Cross-origin navigation and new-window requests MUST be denied in the Electron
window and MAY be forwarded only through the safe external URL policy.

`src/host/electron-panel.ts` MUST own reusable secondary-panel window mechanics
without selecting product content or policy.

## Renderer APIs

`src/renderer/index.ts` MUST remain the only renderer export root.

The renderer export MAY expose shell layout, tabs, controls, settings
components, terminal components, and renderer-safe helpers.

The renderer export MUST NOT expose product composition, sample application
state, or a product bridge.

`src/renderer/styles/shell-structural-tokens.css`,
`src/renderer/styles/shell-accessibility.css`, and
`src/renderer/styles/shell-package-rules.css` MUST compose the exported
stylesheet.

The exported stylesheet MUST define structure and MUST NOT define a product
palette.

## Terminal integration

Electron-free terminal behavior MUST live in `@maximal/maximal-terminal`.

`./electron-terminal` MUST adapt terminal behavior to Electron window ownership
without defining product IPC channel names.

Each BrowserWindow owner MUST receive an independent terminal host.

Closing an owner MUST release its terminal host and terminate sessions that
were not transferred or explicitly retained.

Terminal ownership transfers MUST stage before commit and MUST roll back on a
failed destination.

`TerminalView` MUST select xterm.js by default and MAY select wterm/libghostty
through its `emulator` option.

`@wterm/dom` MUST own wterm DOM rendering and input handling.

`@wterm/ghostty` MUST own the libghostty virtual terminal compiled to
WebAssembly.

Ghostty MAY render bounded direct Kitty PNG, RGB, and RGBA images. The package
MUST NOT claim support for SIXEL, iTerm2 images, animations, indirect media, or
persistent images.

Kitty graphics through tmux MUST rely on the user's pane-level
`allow-passthrough` setting; the package MUST NOT mutate an existing tmux
session's options.

The optional `ghosttyWindow` value MAY adjust horizontal and vertical padding,
balanced opposing edges, background opacity, and backdrop blur only when
`emulator="ghostty"`.

`TerminalView` MUST consume Command+D and Command+Shift+D only when the
consumer supplies split launching.

`TerminalTabs` MUST create resizable right and down splits from separately
host-launched Local sessions.

Command+[ and Command+] MUST cycle split focus, and the active pane MUST carry
the focus ring.

An exited pane MUST collapse to its sibling, and an exited final pane MUST
close the terminal tab.

OSC 0 and OSC 2 title changes MAY name a terminal tab after control characters
are removed and the title is bounded.

`terminal-workspace.ts` MUST own the immutable renderer aggregate for pane
trees, logical focus, view identities, sessions, projections, splits, closes,
and document docking.

The terminal workspace MUST NOT own an emulator, DOM node, Electron object, or
process lifetime.

Main-process pane revisions MUST be observations; an older revision MUST NOT
replace or echo newer document state.

Terminal emulator initialization MUST be shared across terminal views, and a
rejected initialization MUST clear the shared promise so the renderer can
offer retry.

Emulator resize events MUST coalesce to the latest dimensions once per
animation frame before crossing the consumer-owned bridge.

The selected emulator MUST own clipboard paste and IME composition.

`src/main/native/pty/` MUST contain the Electron terminal manager, while
`TerminalHost` from `@maximal/maximal-terminal` MUST own process behavior.

The consuming application MUST own IPC channel names and adapt its preload
contract to the exported terminal functions and renderer transport.

Moving a live terminal between windows MUST transfer its `TerminalHost`
session rather than spawn a replacement process.

Terminal profile discovery and launch MUST accept opaque identifiers and
dimensions instead of renderer-supplied executable configuration.

Discovery MUST run in the main process through bounded process calls, isolate a
connector failure to its profile, and keep Local available.

The fixed terminal identity and tmux prefix MUST remain Maximal-owned rather
than derive from product settings or legacy application branding.

`./verify` MUST expose native terminal package checks for the consuming
application's artifact.

## Build output

`scripts/build-package.mjs` MUST compile host declarations and renderer
declarations and copy the exported stylesheet.

The build MUST write library artifacts under `dist/`.

The build MUST NOT create `.app`, `.exe`, asar, Forge, Vite-renderer, or
application HTML output.

The package export map MUST own the supported runtime surface.

`scripts/verify-exports.mjs` MUST verify every declared export and the renderer
dependency graph.

## Testing

Vitest MUST cover host lifecycle, host-window security, renderer components,
terminal ownership, exported contracts, and verification helpers.

Storybook browser checks MUST cover rendered shared components and accessibility.

Application packaging and Electron end-to-end behavior MUST be tested by
`apps/desktop`.

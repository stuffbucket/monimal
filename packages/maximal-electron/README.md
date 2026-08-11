# Stuffbucket

A reference Electron application. It exists to be forked.

It answers two questions that every desktop project has to answer, and that
most templates leave out:

1. How does this build and package on macOS and Windows, and how is the package
   proved correct?
2. How does an agent work in this repository without breaking it?

Screenshot of the shell: `test-results/shell.png`, after `npm run stills`.

## What is here

| Area | Choice |
| --- | --- |
| Framework | Electron 43 with Forge 7. |
| Renderer | React 19 on Vite 7. |
| Layout | Radix and `react-resizable-panels`. |
| Terminal | `ghostty-web` over `node-pty`. |
| Agent | pi coding agent, or an embedded model. |
| Packaging | Forge `package` on macOS and Windows, verified in CI. |
| Release | An npm tarball on a GitHub release. No installer. |
| Tests | Vitest and Playwright. |
| Demos | A scripted screen recorder that drives the real app. |
| Harness | `AGENTS.md` and `.claude/skills/`. |

## Quick start

```bash
npm ci
npm start
```

Other commands are in [AGENTS.md](./AGENTS.md).

## The shell

A three-panel layout in the shape Figma uses:

- A **collapsible left navigation** that reduces to an icon rail, with
  sections that collapse on their own.
- **Document tabs in the title bar**, not in a row of their own.
- **Real terminals in tabs.** The `+` button opens a shell, rendered by
  Ghostty's own emulator compiled to WebAssembly.
- A **floating overlay** running a coding agent, summoned by accelerator. It
  streams, uses tools, and asks before it touches anything. There is no API
  key, and nothing to install: it prefers a local proxy when one is running,
  and otherwise runs a small model inside the application.
- A **grid and list canvas** with selection.
- A **collapsible right inspector** that shows properties when something is
  selected, and settings when nothing is.

Panel sizes persist across restarts.

Native integration covers a splash window and the application menu. It also
covers an optional menu bar or tray icon, notifications, and an update check.
A dock badge tracks real application state.

## Consume the shell frame

This file is the only prose the tarball carries. Every path below under the docs
directory names a file in the repository rather than in your `node_modules`, and
each one is readable at
<https://github.com/stuffbucket/maximal-electron/tree/main/docs>. The types are
the other half: every export ships a `.d.ts` whose comments say what a prop is
for and why it exists.

The package is `@stuffbucket/maximal-electron`, on the GitHub Packages npm
registry:

```json
"@stuffbucket/maximal-electron": "^0.0.5"
```

Installing from that registry needs an `.npmrc` and a token, for a public
package as much as a private one. The git ref and the release tarball still
work and need neither:

```json
"@stuffbucket/maximal-electron": "github:stuffbucket/maximal-electron#<ref>"
"@stuffbucket/maximal-electron": "https://github.com/stuffbucket/maximal-electron/releases/download/v0.0.5/stuffbucket-maximal-electron-0.0.5.tgz"
```

`dist/` is built by a lifecycle script rather than committed, and npm runs a
different one for each form. A `codeload.github.com` archive URL runs neither,
so that form is unsupported and refuses to install. Read
[docs/consuming.md](./docs/consuming.md), which states the token cost and the
migration from the old unscoped name.

Every supported form exposes the main-process lifecycle at
`@stuffbucket/maximal-electron/main`, the secured host window at
`@stuffbucket/maximal-electron/host`, and the generic renderer frame at
`@stuffbucket/maximal-electron/renderer`. The renderer entry exports the layout
— `ShellLayout`, `TitleBar`, `TabBar`, `NavRail`, `Canvas` — a control
vocabulary from `Button` and `Card` through `Dialog`, `Menu` and the form
fields, the terminal components with the transport that wires them, and two
hooks. It does not export the reference application, the agent, the sample
data, or the capture fixture. `docs/embedding.md` groups the whole surface, and
`RENDERER_SURFACE` in `scripts/export-checks.mjs` is the list
`npm run verify:exports` holds the built entry to.

The tarball also carries `.vite/build/main.js`, because npm packs whatever
`main` names and Electron needs that path to run this repository as an
application. It is not an export: `exports` declares no `.`, so importing the
package by its bare name fails, and the file loads a chunk the tarball does not
carry.

`runMain(runtime, options)` runs a main process on this shell's lifecycle: the
profile directory, the single instance lock, the window, the quit policy, and a
deferred shutdown. Every application-specific value is a callback in `options`,
whose shape is versioned. This application's own `src/main/index.ts` runs on it.
See [docs/embedding.md](./docs/embedding.md).

The package declares no runtime dependencies. Every package an export imports is
an optional peer, so installing it for `@stuffbucket/maximal-electron/host` adds nothing
to `node_modules` beyond the package itself. Install the peers for the entries
you use:

| Entry | Peers |
| --- | --- |
| `@stuffbucket/maximal-electron/main` | `electron` |
| `@stuffbucket/maximal-electron/host` | `electron` |
| `@stuffbucket/maximal-electron/preload` | `electron` |
| `@stuffbucket/maximal-electron/host/terminal` | `node-pty` |
| `@stuffbucket/maximal-electron/renderer` | `react`, `react-dom`, `ghostty-web`, `lucide-react`, `react-resizable-panels`, `@radix-ui/react-collapsible`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-radio-group`, `@radix-ui/react-tabs`, `@radix-ui/react-tooltip`, `@radix-ui/react-visually-hidden` |
| `@stuffbucket/maximal-electron/verify` | none |
| `@stuffbucket/maximal-electron/verify/shell-variables` | none |

npm says nothing about a missing optional peer at install time. The failure
lands later: a bundler stops on the unresolved import and names the package,
and a main-process entry throws when it loads. `npm run verify:exports` parses
the rows above and compares each one against the packages that entry point's
built import graph reaches, so a peer the table leaves out and a peer the table
invents both fail the check. `react-dom` is the one name no import reaches: a
React component does not import a renderer, the consumer mounting these
components needs one, and `scripts/peer-table.mjs` names it as the single
exception rather than allowing any.

Import the structural styles separately:

```ts
import {
  Canvas,
  NavRail,
  ShellLayout,
  TabBar,
  TitleBar,
} from '@stuffbucket/maximal-electron/renderer';
import '@stuffbucket/maximal-electron/renderer/styles.css';
```

The stylesheet ships no palette and scopes every rule under `.sb-shell`.
`ShellLayout` applies that root class. Apply it yourself when composing the
smaller exports directly. Import the components without it and the markup is
unstyled; import it and define nothing and the surfaces draw nothing. Define
these semantic variables on `:root` or `body`:

| Variable | Contract |
| --- | --- |
| `--shell-background` | Window chrome and side-panel surface. |
| `--shell-canvas` | Main document surface and active tab. |
| `--shell-raised` | Tooltip and other floating surfaces. |
| `--shell-text` | Primary foreground. |
| `--shell-text-muted` | Secondary foreground and inactive controls. |
| `--shell-text-subtle` | Tertiary labels and counts. |
| `--shell-border` | Dividers and quiet outlines. |
| `--shell-hover` | Hovered controls. |
| `--shell-active` | Pressed or nested hover controls. |
| `--shell-accent` | Selection, focus, and resize feedback. |
| `--shell-accent-muted` | Selected-control background. |

Thirty-three more variables have structural fallbacks in the CSS, and two are
read by JavaScript rather than by any rule. `docs/shell-variables.md` holds the
whole contract, derived from the stylesheet and checked against it in both
directions. Set the ones your design system disagrees with.
`@stuffbucket/maximal-electron/verify/shell-variables` exports the derivation so an
application can assert its own adapter against the stylesheet it installed.

Those eleven are the whole of what the shell needs from you. `ShellLayout`'s
root is fixed to the viewport, so it fills the window with no document reset of
your own; set `--shell-position: static` to lay the shell out inside a container
you have given a height to instead.

`:root` or `body` rather than your own container, because `Dialog`, `Menu` and
`IconButton`'s tooltip do not render where they are written. Each portals above
the page, so it lands outside whatever element you put `.sb-shell` on. The
components handle the class themselves — a surface with no `ShellLayout` above
it mounts into a `div.sb-shell` the package appends to `body`, so the rules
match either way — but that element inherits from `body`, and a property
defined only on your container never reaches it. `docs/embedding.md` has the
measurements.

Status colour is yours to map. `StatusChip`, the status dot, `NavRail` items,
`Banner` and `Callout` all put their state on `data-status`, and the shipped
stylesheet maps no value of it, because a status vocabulary belongs to the
application. Pass a status and every state draws the same neutral fill until you
write the rules:

```css
.sb-shell .chip[data-status='failed'] { --shell-status: #f87171 }
.sb-shell .chip[data-status='done']   { --shell-status: #4ade80 }
```

`--shell-status` is the label colour, `--shell-status-muted` the fill. Three
consumers in a row passed a status, saw a grey pill, and reported that the
colour worked, so this is stated rather than left to be discovered.

`IconButton` renders a tooltip, so it needs a `Tooltip.Provider` from
`@radix-ui/react-tooltip` above it. `ShellLayout` supplies one. Compose
`IconButton` outside it — or `Banner` with `onDismiss`, which draws one — and
the button is absent rather than broken.

`ShellLayout` takes no children. `left`, `main`, `right` and `status` are named
props, plus an optional `top` and `bottom`, and `left` is a function of the
collapsed state because `ShellLayout` owns that state and `NavRail` needs it.
[docs/embedding.md](./docs/embedding.md) assembles a whole three-panel
application — nav rail, canvas, inspector, tabs, status bar — in one snippet.

`NavRail` is a list of labelled collapsible groups, not a flat icon strip. A
`NavRailSection` carries a heading that collapses the entries under it, and a
`NavRailEntry` carries an icon, a label, a count and an optional status. So a
rail of a Projects group and an Agents group is two array entries and one
element, with no list markup and no stylesheet of the caller's own. Three
consumers in a row read the types, concluded the component could not do it, and
rebuilt it by hand, so this is stated here as well as in the `.d.ts`.

`Canvas` is a `role="listbox"`, so every item must render exactly one element
carrying `role="option"` and `aria-selected`, and it must be what `renderCard`
or `renderRow` returns rather than something inside a wrapper. `Card` and `Row`
are that element. In return the canvas owns the keyboard: one tab stop rather
than one per tile, arrow keys between options, Enter and Space to activate. It
writes `tabIndex` on the elements the caller returned, so a consumer supplies
no `tabIndex` and no key handler, and an option does not have to be a button to
be reachable. Selection stays the consumer's, in `selectedId`, and does not
follow focus. [docs/embedding.md](./docs/embedding.md) is the contract in full.

`Callout` is the box that asks for a decision: a titled region with an outline,
a body of your markup, and a row of actions. It is not a `Card` — `Card` and
`Row` are one selectable option in a listbox, and take `selected` and
`onSelect` — and it is not a `Banner`, which is a strip in `ShellLayout`'s top
slot that reports rather than asks. Three consumers in a row built this shape
out of raw CSS for an approval prompt, so it is named here as well.

```tsx
<Callout status="blocked" title="Approval needed" actions={
  <>
    <Button size="sm">Deny</Button>
    <Button size="sm" variant="primary">Allow once</Button>
  </>
}>
  <span>The agent wants to run a command outside the workspace.</span>
  <code className="field__value">npm run package</code>
</Callout>
```

`TitleBar` accepts caller-owned `leading` and `actions` nodes. Direct `TitleBar`
and `TabBar` consumers provide `tabIdBase` and use `getTabTriggerId` and
`getTabPanelId` on their document tabpanels. `ShellLayout` creates that
association from `layoutId`. It also accepts the same title bar regions and an
optional panel-toggle subscription adapter, so host IPC stays in the consuming
application.

Run `npm run build:package` after changing an exported source file. Run
`npm run verify:exports` to rebuild, inspect the complete renderer import graph,
and verify that every export target appears in `npm pack`.

## Package the terminal

`@stuffbucket/maximal-electron/host/terminal` and
`@stuffbucket/maximal-electron/renderer` give a working terminal and leave two
packaging traps behind.

- `ghostty-web` inlines its WebAssembly as a data URL and fetches it at startup.
  The content policy needs `'wasm-unsafe-eval'` in `script-src` and `data:` in
  `connect-src`, or the terminal renders nothing.
- `node-pty` is native. Keep it out of the bundler, and unpack its whole
  prebuild directory rather than only `*.node`. On macOS the shell is started by
  `spawn-helper`, which has no extension and is executed from outside the
  archive.

The wire between the two halves is exported rather than hand-written.
`createTerminalTransport` builds the renderer transport from your own `invoke`,
`on` and channel names, and `registerTerminalChannels` answers those channels
from a `TerminalHost`. Neither picks a name. `docs/embedding.md` has both calls.

`@stuffbucket/maximal-electron/verify` exports those assertions as a function
to run against a built application. `docs/architecture.md` has the call.

## Your own icon

The dock, taskbar, window, and menu bar icons all come from one directory.
`STUFFBUCKET_ICON_DIR` says which one, so a fork brands its build without
editing the shell.

```bash
STUFFBUCKET_ICON_DIR=~/brand/icons npm run package
STUFFBUCKET_ICON_DIR=~/brand/icons npm start
```

The directory must carry all six names. `npm run icons` writes them, and honours
the same variable, so it can seed a new set.

| File | Used for |
| --- | --- |
| `icon.icns` | The macOS bundle icon. |
| `icon.ico` | The Windows executable icon. |
| `icon.png` | 512 square. Linux, the dock, the taskbar, and the window. |
| `tray.png` | 32 square, full colour. The Windows and Linux tray. |
| `trayTemplate.png` | 16 square, alpha only. The macOS menu bar. |
| `trayTemplate@2x.png` | 32 square, alpha only. The same, on a retina display. |

`forge.config.ts` reads the variable at build time and fails the build when a
name is missing. `src/main/native/icons.ts` reads it again at run time, which is
what makes an unpackaged `npm start` on macOS show the icon: **a development run
takes its dock icon from Electron itself**, and no amount of packaging changes
that, so `app.dock.setIcon` is the only way to see it before a build.

There is no channel for this. The renderer cannot set an icon, because a
filesystem path taken from a renderer and loaded as an image is an arbitrary
file read. The icon belongs to whoever launches the application.

A consumer depending on this shell as a package passes `icon` to
`createHostWindow` instead, and sets `packagerConfig.icon` in their own Forge
configuration.

## Demos

The application can drive itself and record the result. `demo/` holds the mp4s
and stills that produces.

```bash
npm run package
npm run record                  # drive the app, then cut the video
npm run compose -- workflow     # re-cut, without touching the app
```

Nothing in the output is a mock. The window is the window `npm start` opens,
the terminal runs a real shell, and the overlay talks to a real model through
the real approval gate. So a change that breaks the interface breaks the
recording, and a demo cannot quietly go stale.

Recording is two steps. **Capture** drives the application and keeps every
frame. **Compose** cuts those frames into a video. An edit file says what plays,
in what order, how long each beat holds, and where it freezes.

That split is what makes the timing workable. A capture takes about 45 seconds.
A re-cut takes about 6, and needs no build and no application.

See [docs/recording.md](./docs/recording.md).

## Release

Push a tag. The npm tarball lands on a draft release, and one job publishes it.

```bash
git tag -a v0.1.0 -m "Release 0.1.0"
git push origin v0.1.0
```

**There is no installer.** No MSI and no dmg. `npm run package` produces an
unsigned `.app` and an unsigned `win32` directory, `ci.yml` runs it on both
platforms, `npm run verify:package` proves the result is correct, and `npm run
smoke:packaged` launches it. Nothing wraps it. `docs/release.md` says why, and
what a fork adds to change that.

Nothing here is signed, and **no Apple credential belongs in this repository**.

Read [docs/release.md](./docs/release.md) and
[docs/signing.md](./docs/signing.md).

## Known gaps

Stated here rather than discovered later.

- **No installer, on either platform.** A release carries the library tarball
  and nothing else. See `docs/release.md`.
- **No auto-update.** There is no delivered artifact for an updater to replace.
- **Nothing is signed.** macOS Gatekeeper refuses an unsigned bundle it did not
  build, and Windows SmartScreen warns on first run.
- **The overlay agent has shell access when tools are on.** That is what makes
  it a coding agent. It asks before it runs anything that can change the
  machine, and the "Ask before running" setting controls how much it asks.
  Turn the tools off entirely with the "Agent tools" switch.
- **The summon accelerator is not a double tap of Ctrl.** Electron cannot bind
  a bare modifier without a native monitor.
- **The concierge model downloads on first use.** About 610 MB, once, into the
  user data directory. The package stays smaller and the model can be upgraded
  without a new build, but a first run with no network and no proxy cannot
  answer.
- **Placeholder icons.** `scripts/gen-icons.mjs` draws them. Replace the output
  with designer assets before a public release, or point
  `STUFFBUCKET_ICON_DIR` at your own set.

## Fork it

Read [.claude/skills/port-to-project/SKILL.md](./.claude/skills/port-to-project/SKILL.md).

The short version: rename the app, and point `STUFFBUCKET_ICON_DIR` at your own
icons. If you distribute an application rather than a library, adding a maker
and a release job is your first change.

## Credits

The release mechanics and the agent harness follow two existing projects.

- `openai/codex` contributes the `tag-check` gate, the tag-triggered release,
  the prescriptive `AGENTS.md`, and the self-contained skill format. It
  contains no Electron; only these patterns transfer.
- `stuffbucket/maximal` contributes the draft-then-publish release shape, the
  design token scale, and the layout-verification discipline in
  `.claude/skills/verify-ui/SKILL.md`.

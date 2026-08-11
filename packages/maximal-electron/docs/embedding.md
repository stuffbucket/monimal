# Embedding this shell

This shell is a package another application composes. This document is the
contract for that: what a consumer imports, what it passes, and what changes
under it without warning.

`maximal/client` is the consumer this was built for. It composes the shell from
its own `src/main/shell.ts`, spawns its own service, and owns its own renderer.
Nothing about that application appears here, and nothing about it may: a port
number, a home directory variable, a control path, or a provider name in this
repository is a defect, not a convenience.

## The exports

| Specifier | What it is |
| --- | --- |
| `./main` | `runMain`, the main-process lifecycle |
| `./host` | `createHostWindow`, one secured window |
| `./preload` | `exposeBridge`, the generic renderer bridge |
| `./host/terminal` | `TerminalHost` and `registerTerminalChannels`, the pty manager and its wiring |
| `./renderer` | The React control surface: layout, controls, the terminal, and the hooks under them |
| `./renderer/styles.css` | The structural stylesheet. It ships no palette |
| `./verify` | Packaging checks a consumer runs against its own build |

All of it is a `tsc` emit, not a bundle: `npm run build:package` runs `tsc`
twice and copies the stylesheet. A consumer imports source-shaped ES modules
and bundles them itself, so its own externals, its own Electron version, and
its own tree shaking apply. `npm run verify:exports` proves each target exists,
that `npm pack` includes it, and that `./main` declares the names below.

## `runMain(runtime, options)`

`runMain` is `./host` plus a lifecycle. It owns the profile directory, the
single instance lock, opening and reopening the window, the quit policy, and
the deferred shutdown. It decides nothing about the application it hosts.

```ts
import { app } from 'electron';
import { RUN_MAIN_OPTIONS_VERSION, runMain } from '@stuffbucket/maximal-electron/main';

await runMain(
  { app },
  {
    version: RUN_MAIN_OPTIONS_VERSION,
    discoverDaemonUrl: () => supervisor.start(),
    window: ({ daemonUrl }) => ({
      preloadPath: join(__dirname, 'preload.js'),
      title: 'Consumer',
      width: 1280,
      height: 820,
      loadRenderer: (window) => void window.loadFile(page),
    }),
    beforeShutdown: () => supervisor.stop(),
  },
);
```

`runtime` carries `app`, an optional `platform`, and an optional
`crashReporter`. Injecting the runtime rather than importing it is what lets
the unit suite drive the whole lifecycle in plain Node, without an Electron
process.

### The order

1. `userDataDirectory` is applied. It has to precede the lock, because Chromium
   derives the lock from the profile directory.
2. `collectCrashDumps` starts the crash reporter, if it is on. It has to follow
   the profile: Crashpad reads `userData` once, when it starts.
3. The single instance lock is taken. Without it, `runMain` quits this process
   and resolves with no window, and no handler is registered.
4. `whenReady`.
5. `discoverDaemonUrl` runs once. Its result is normalized and put on the
   context.
6. `onReady` runs, with the context. Register channels here: it precedes the
   first window, so nothing the renderer calls is missing when it loads.
7. `window(context)` is asked for options, and the window opens.

`onActivate` then runs on every activation — a dock click, a menu bar click, a
second launch. `runMain` opens a replacement window when none is left, and
`onWindowCreated` runs for every window it opens.

### The options

| Field | Default | What it does |
| --- | --- | --- |
| `version` | required | `RUN_MAIN_OPTIONS_VERSION`. Anything else throws |
| `window` | required | Options for each window, given the context |
| `userDataDirectory` | Electron's own | Profile directory |
| `singleInstance` | `true` | Take the single instance lock |
| `collectCrashDumps` | `false` | Write a local minidump for every process the shell owns |
| `keepRunningWithoutWindows` | `() => false` | Survive the last window on every platform |
| `discoverDaemonUrl` | none | An origin to resolve before the first window |
| `onReady` | none | After discovery, before the first window |
| `onActivate` | none | Every activation, with the surviving window |
| `onWindowCreated` | none | Every window the shell opens |
| `onWindowAllClosed` | none | The last window closed, with the quit decision |
| `beforeShutdown` | none | Release what the application owns |

`keepRunningWithoutWindows` is a callback rather than a value because the
answer changes while the application runs: this shell reads a preference the
user can toggle. macOS keeps an application alive without windows regardless.

`collectCrashDumps` is off by default and needs `runtime.crashReporter` when it
is on, or `runMain` throws rather than starting nothing in silence. A crash
reporter is process-wide, so starting one inside somebody else's application is
their decision and not this shell's, and a consumer that already runs one would
otherwise get a second. Nothing is uploaded either way: there is no
`submitURL`, no endpoint, and no credential. See `docs/architecture.md` for
where the dumps land and what covers them.

`beforeShutdown` returning a promise defers the quit until it settles, and the
quit that follows does not run it again. Returning nothing lets the quit
through untouched. This shell has an embedded model that aborts the process if
its worker outlives the Node environment; `docs/agent.md` has that account.

`discoverDaemonUrl` is deliberately blunt about what it hands back: a
normalized absolute URL with no trailing slash, on `context.daemonUrl`. How it
reaches the renderer is the consumer's decision, because the mechanism belongs
to the preload it wrote. The shell does not inject it, does not proxy it, and
does not know what speaks on it. A relative or empty value fails there, where
the message can name the callback, rather than as a blank window.

`onWindowAllClosed` receives the decision rather than the inputs to it, and it
runs before the shell acts. An application that reacts to the last window
closing — this one pulls its dock icon out — therefore never recomputes the
policy and never depends on where its own listener sits in the order. It
observes; `keepRunningWithoutWindows` is what changes the answer.

## Registering your own handlers

`runMain` takes `app` rather than owning it, so a consumer can call `app.on`
for anything the options do not cover. Two listeners on one event are fine.
Guessing at the ordering is not, so this is what the shell has already done on
each event it listens to.

| Event | Registered | State when a consumer's listener runs |
| --- | --- | --- |
| `second-instance` | after `whenReady` | The shell activates: a surviving window is passed to `onActivate`, or a replacement window is opened |
| `activate` | after `whenReady` | The same |
| `window-all-closed` | before `whenReady` | The shell may already have called `app.quit()`, depending on registration order. Use `onWindowAllClosed` instead, which is called before the decision is acted on |
| `before-quit` | before `whenReady` | The shell may already have called `preventDefault` and started `beforeShutdown`, depending on registration order |

A listener registered before `runMain` runs first; one registered after it
resolves runs second. Both of the events where that difference is observable
have an option, and the option is the supported route.

## Versioning

`options` carries `version`, and `RUN_MAIN_OPTIONS_VERSION` is exported next to
`runMain`. A call site written against another shape throws by name at the
first line of `runMain` instead of reading a field that moved.

Package semver was the alternative and does less: a consumer pinning this
repository by git ref, which the one real consumer does, gets whatever the ref
holds with no version to check. A `runMainV1` export was the other, and it
multiplies entry points for a shape that will mostly gain optional fields.

Adding an optional field does not change the version. Renaming or removing one,
or changing what an existing field means, does. The old version then throws
rather than reading a field that is no longer there.

## What is not here

`src/main/index.ts` runs on `runMain`, which is the point: a seam this
repository's own application does not use is exercised by nothing anybody runs,
and it drifts. `npm run test:e2e` drives that application, and it now drives
the bridge with it.

There is no renderer-side client for the bridge. `resolveBridge` in
`src/renderer/lib/resolve-bridge.ts` answers "is a bridge here", and it is not
exported. A consumer writes `typeof window.myApp?.openExternal === 'function'`,
which is one line and needs no package.

## The preload bridge

`@stuffbucket/maximal-electron/preload` is the seam issue #17 asks for: one
namespaced global, generic native powers, `{ok}` envelopes, working under
`sandbox: true`. `maximal/client` wrote three methods of it by hand because
this export did not exist.

```ts
// the consumer's own preload entry, bundled by the consumer's own bundler
import { exposeBridge } from '@stuffbucket/maximal-electron/preload';

exposeBridge({ namespace: 'myApp' });
```

```ts
// the consumer's main process
window: ({ daemonUrl }) => ({
  preloadPath: join(__dirname, 'preload.js'),
  bridge: { capabilities: ['openExternal', 'versions'], serviceOrigin: daemonUrl },
  // …
}),
```

```ts
// the consumer's renderer
const bridge = (window as { myApp?: Bridge }).myApp;
if (bridge?.openExternal) {
  const result = await bridge.openExternal('https://example.com');
  if (!result.ok) console.warn(result.code, result.message);
}
```

`namespace` has no default. A key this package picked would be one every
consumer collides on, and issue #22 asks for it caller-set.

### The capabilities

| Capability | Channel the host handles | Argument |
| --- | --- | --- |
| `openExternal` | `shell:open-external` | `{ url }` |
| `versions` | `app:versions` | none |
| `checkForUpdate` | `update:check` | none |

Those channel names are literals in `src/preload/capabilities.ts`, not an
import of `src/shared/ipc.ts`. A bridge that imported this shell's contract
would put this repository's own application on the export graph, and
`npm run verify:neutral` fails on exactly that. The duplication owes a check
and has one: `tests/bridge-capabilities.test.ts` asserts every channel the
bridge names is one this shell answers.

`serviceOrigin` is a value rather than a channel. `runMain` already resolves
`discoverDaemonUrl` before the first window, so the origin exists by the time
`window(context)` is called and there is nothing to round-trip. It arrives as
`bridge.serviceOrigin`, normalized, or `null`. A scheme other than `http` or
`https` is refused rather than injected.

### Feature detection

A method the host did not declare is **absent**, not present and failing. The
whole feature test is `typeof bridge.openExternal === 'function'`, and
`bridge.capabilities` lists what the host declared.

The declaration travels through `webPreferences.additionalArguments`, which
Electron appends to the renderer's `process.argv` and which a sandboxed preload
reads. `createHostWindow` writes it from `options.bridge`, and the preload
parses it back.

This is not a version handshake, and that is deliberate. A version number is a
second thing to keep in step with the first, and it drifts the moment a host
implements four capabilities and reports three. Here the host states which
handlers it registered, once, in the same object that opens the window. A
capability a host forgets to declare has no method, which is visible on the
first call rather than at the first release that changed the number.

Probing by calling was the alternative and is worse: `openExternal` cannot be
probed without opening something. A `bridge:capabilities` channel was the other,
and it is a channel that may itself be unimplemented, which is the same problem
one level down.

Filtering is one-way. `declaredCapabilities` keeps only names this build knows,
so a newer host talking to an older bridge loses a method rather than gaining a
broken one.

### Envelopes, not rejections

Every method resolves. None rejects.

```ts
type Envelope<T> =
  | { ok: true; value: T }
  | { ok: false; code: 'unavailable' | 'refused' | 'failed'; message: string };
```

A rejection crosses `contextBridge` as a copied `Error` with its class gone, so
a caller cannot tell "no handler" from "the handler said no" without reading
the message as prose. And a caller who forgets `catch` gets an unhandled
rejection, which a packaged renderer with no DevTools shows nobody. An envelope
is a value, and a discriminated union makes the caller discriminate.

`unavailable` is a channel no handler answers. `refused` is a handler that
threw. `failed` is the bridge refusing before the call left the renderer. A
capability that was never declared produces none of the three, because there is
no method to call.

The envelope is made in the preload, not in the host. A consumer writes
ordinary `ipcMain.handle` that returns a value or throws, and the bridge wraps
it. Nothing about envelopes reaches the main process.

### `sandbox: true`

`createHostWindow` sets it and will not stop. It constrains this seam in two
ways worth stating rather than discovering.

A sandboxed preload cannot `require` a package. Its `require` reaches a handful
of Electron and Node built-ins and nothing in `node_modules`, so
`require('@stuffbucket/maximal-electron/preload')` from a preload file does not
work and cannot be made to. **The consumer bundles this module into their own
preload entry.** That is the one thing they must still do themselves, and it is
why `preloadPath` stays a path they supply: the shell never chooses the file,
only what the file is told.

A sandboxed preload does get `process.argv`, which is what carries the
declaration. That is asserted rather than assumed —
`e2e/preload-bridge.spec.ts` reads `window.stuffbucket.capabilities` out of the
real application's renderer, in a window with `sandbox: true`.

### What replaces what

This shell's own `src/preload/index.ts` calls `exposeBridge`. It passes
`extend` for its own twenty channels, which are this application's and no
consumer's business, and the generic surface underneath is the exported one.
So the export is not a second implementation that can drift from the one this
repository runs: it is the one this repository runs.

`extend` exists because `contextBridge.exposeInMainWorld` allows one call per
key. A consumer wanting only the generic surface omits it.

## The renderer surface

`./renderer` is the largest export, and the only one a consumer composes rather
than calls once. Four groups.

| Group | What is in it |
| --- | --- |
| Layout | `ShellLayout`, `TitleBar`, `TabBar`, `NavRail`, `Canvas`, and the tab helpers beside them |
| Controls | `Button`, `IconButton`, `Card`, `Row`, `Toolbar`, `ViewModeSwitch`, `StatusChip`, `EmptyState`, `InspectorPanel`, `Banner`, `Callout`, `Dialog`, `Menu`, `TextInput`, `Textarea`, `Select`, `Switch`, `Checkbox`, `RadioGroup`, `Field`, `FormField` |
| Terminal | `TerminalView`, `TerminalTabs`, `createTerminalTransport`, `detachedSessions`, `readTerminalTheme`, `SHELL_TERMINAL_PROPERTIES` |
| Hooks | `useShellTabs` for a tab strip's state, `useThemePreference` for the `data-theme` attribute |

That table is prose and can drift. `RENDERER_SURFACE` in
`scripts/export-checks.mjs` is the list nothing may drift from:
`npm run verify:exports` compares it against the built entry in both
directions, so a name added to `src/renderer/index.ts` and left off the list
fails, and so does a name on the list that the entry does not export.

The export does **not** carry the reference application. `App.tsx`, the sample
data, the settings surfaces and the capture fixture are this repository's own,
and `npm run verify:neutral` fails when one of them reaches the export graph.

`readTerminalTheme` takes the custom properties to resolve as an argument, and
`SHELL_TERMINAL_PROPERTIES` names the three in the `--shell-*` namespace that
`docs/shell-variables.md` documents. `terminalTheme` and `TERMINAL_TOKENS` in
`src/renderer/lib/theme.ts` are this application's own pair and read
`--bg-canvas`, `--text-primary` and `--accent`. They are deliberately not
exported: a consumer resolving them against a `--shell-*` adapter would get an
empty theme and the emulator's defaults, with nothing raised.

### The stylesheet ships no palette, and the components have none either

This is the part a consumer discovers late, so it is stated first.
`./renderer/styles.css` is structural. It sets layout, spacing, state and
shape, and it declares no colour, no type and no size of its own. Every one of
those reads a `--shell-*` custom property that the host defines.
`tests/package-styles.test.ts` asserts the file declares no token, so this is a
property of the build rather than a convention.

Two failures follow, and neither one throws.

- **A consumer who imports the components and not the stylesheet gets
  unstyled markup.** The components carry class names and no rules of their
  own. Nothing warns: React renders, and the result is a stack of undecorated
  elements.
- **A consumer who imports both and defines nothing gets a transparent
  shell.** The eleven `required` properties have no fallback in any rule, so a
  surface draws nothing and text inherits whatever sits behind it. It renders,
  and it renders wrong, which is the failure mode `docs/shell-variables.md`
  exists to surface.

```ts
import {
  Canvas,
  NavRail,
  ShellLayout,
} from '@stuffbucket/maximal-electron/renderer';
import '@stuffbucket/maximal-electron/renderer/styles.css';
```

Every rule is scoped under `.sb-shell`. `ShellLayout` applies that root class;
a consumer composing the smaller exports directly applies it themselves.

### A worked composition

The `.d.ts` comments describe one component each. This is the assembly: a nav
rail on the left, a canvas of selectable runs in the middle, an inspector on
the right, document tabs, and a status bar.

It is `e2e/fixtures/demo-shell/DemoApp.tsx` with the fleet data and the
terminal taken out. That fixture reaches this package through the same
`exports` map a registry install resolves, and `npm run verify:fixture-imports`
fails if it ever reaches into `src/` instead, so an example derived from it
cannot be wrong about the API.

```tsx
import {
  Canvas,
  Card,
  EmptyState,
  Field,
  FormField,
  InspectorPanel,
  NavRail,
  Row,
  ShellLayout,
  StatusChip,
  TextInput,
  Toolbar,
  useShellTabs,
  type Tab,
  type ViewMode,
} from '@stuffbucket/maximal-electron/renderer';
import '@stuffbucket/maximal-electron/renderer/styles.css';
import './shell-variables.css';
import { Bot, FolderGit2 } from 'lucide-react';
import { useState } from 'react';

interface Run {
  id: string;
  task: string;
  project: string;
  status: 'running' | 'blocked' | 'done';
}

const RUNS: Run[] = [
  { id: 'run-101', task: 'refactor auth', project: 'api', status: 'running' },
  { id: 'run-102', task: 'flaky test triage', project: 'web', status: 'blocked' },
];

const SECTIONS = [
  {
    id: 'projects',
    label: 'Projects',
    items: [
      { id: 'api', label: 'api', count: 1 },
      { id: 'web', label: 'web', count: 1 },
    ],
  },
  {
    id: 'agents',
    label: 'Agents',
    items: [{ id: 'all', label: 'All runs', count: RUNS.length }],
  },
];

const INITIAL_TABS: Tab[] = [
  { id: 'run-101', title: 'refactor auth', status: 'running' },
];

export function App() {
  const [view, setView] = useState('all');
  const [mode, setMode] = useState<ViewMode>('grid');
  const [selectedId, setSelectedId] = useState<string>();
  const [filter, setFilter] = useState('');

  const { tabs, activeTab, setActiveTab, openTab, closeTab } = useShellTabs(
    INITIAL_TABS,
    (existing) => ({
      id: `tab-${String(existing.length + 1)}`,
      title: 'New run',
    }),
  );

  const runs = RUNS.filter(
    (run) =>
      (view === 'all' || run.project === view) && run.task.includes(filter),
  );
  const current = RUNS.find((run) => run.id === selectedId);

  return (
    <ShellLayout
      layoutId="fleet"
      tabs={tabs}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      onCloseTab={closeTab}
      onNewTab={openTab}
      left={(collapsed) => (
        <NavRail
          sections={SECTIONS}
          current={view}
          onSelect={setView}
          collapsed={collapsed}
          icon={(entry) => (entry.id === 'all' ? Bot : FolderGit2)}
        />
      )}
      main={
        <>
          <Toolbar title="All runs" mode={mode} onModeChange={setMode} />
          <Canvas
            items={runs}
            mode={mode}
            selectedId={selectedId}
            empty={<EmptyState icon={Bot} message="No runs in this view." />}
            renderCard={(run, selected) => (
              <Card
                modifier="run-card"
                status={run.status}
                selected={selected}
                onSelect={() => setSelectedId(run.id)}
              >
                <StatusChip status={run.status} label={run.status} />
                <span className="card__name">{run.task}</span>
                <span className="card__sub">{run.project}</span>
              </Card>
            )}
            renderRow={(run, selected) => (
              <Row
                modifier="run-row"
                selected={selected}
                onSelect={() => setSelectedId(run.id)}
              >
                <span className="row__name">{run.task}</span>
                <span className="row__sub">{run.project}</span>
              </Row>
            )}
          />
        </>
      }
      right={
        <InspectorPanel title={current ? 'Run' : 'Fleet'}>
          {current ? (
            <>
              <Field label="Project" value={current.project} />
              <Field label="Status" value={current.status} />
            </>
          ) : (
            <FormField label="Filter" hint="Matches the task name.">
              {(field) => (
                <TextInput {...field} value={filter} onChange={setFilter} />
              )}
            </FormField>
          )}
        </InspectorPanel>
      }
      status={<span>{current ? current.task : 'No run selected'}</span>}
    />
  );
}
```

Five of those shapes are worth a sentence, because the snippet says what to
write and not why.

- **`ShellLayout` takes no children.** Every region is a named prop, so the
  layout owns where a region goes and the caller owns what is in it. `left` is
  a function rather than a node because `ShellLayout` owns whether the left
  panel is collapsed, and `NavRail` needs that answer.
- **`layoutId` is the persistence key.** `ShellLayout` namespaces the panel
  sizes it writes to `localStorage` under it, so two shells in one application
  must not share one.
- **`Card` and `Row` are one component under two names**, and that component is
  a selectable option rather than a container. Both require `selected` and
  `onSelect`, and neither lays its children out: pass `modifier` and style that
  class yourself.
- **`Canvas` is a listbox, and what `renderCard` returns is an option.** The
  next section is the contract, and it is short.
- **`FormField` takes a function, not a node.** It owns `id`,
  `aria-describedby` and `aria-invalid`, and hands them to the control it
  wraps, which is the whole reason to reach for it rather than a label of your
  own.

`main` takes any node, so a terminal goes there on the same footing as the
canvas. The fixture swaps `TerminalTabs` in when the active tab is a terminal;
"Wiring a terminal" below is the transport that feeds it.

Two things the example cannot supply for a consumer. The specifier is
`@stuffbucket/maximal-electron/renderer`, because the package declares no `.`
export and an import of the bare name does not resolve. And
`shell-variables.css` is the consumer's own file: `docs/shell-variables.md`
lists the eleven properties that carry no fallback, and the shell draws nothing
until they exist. Define them on `:root` or `body`, for the reason the next
section measures.

### The canvas owes a keyboard model, and asks for a role in return

`Canvas` renders `role="listbox"` around whatever `renderCard` and `renderRow`
return. That role is a promise to a screen reader user about the markup inside
it and about which keys work, and the component used to make it while
implementing neither half. Issue #171.

**One rule for a consumer.** Each item renders exactly one element carrying
`role="option"` and `aria-selected`, and that element is what the render
function returns, not something inside a wrapper. `Card` and `Row` are that
element already, so a consumer who passes them has already met it.

Everything else is the canvas's, over elements it did not render. It finds the
options in the DOM after each render and writes their `tabIndex`, so a consumer
adds no `tabIndex` and no key handler:

| Key | What the canvas does |
| --- | --- |
| Tab | Reaches the selected option, or the first when nothing is selected, and leaves the listbox on the next press. The other options carry `tabIndex = -1`. |
| Arrows | Move focus one option, clamped at both ends. All four move linearly in item order, because this is a `listbox` and not a `grid`. |
| Enter, Space | Click the focused option, after cancelling the default action so a `<button>` option does not also fire its own click. |

Which option Tab reaches is read from `aria-selected` in the markup rather than
from `selectedId`, because the attribute is what the role requires and the DOM
is where the consumer's answer to it lands.

Two consequences worth stating.

**Selection does not follow focus.** `selectedId` is the consumer's state and
the canvas has no route into it other than the option's own click handler, so
arrowing moves focus and nothing else. Enter or Space is what selects.

**The option does not have to be a button.** A `<div role="option">` is
focusable by nothing and activated by no key on its own, and the canvas
supplies both, so the ARIA-literal reading is now operable rather than dead.
That failure was the reason `Card` is a `<button>` carrying `role="option"`,
and that tile is still the one to reach for — it draws itself, and a pointer
needs its click handler either way.

A key arriving from a control *inside* an option is left alone, so a button or
a field nested in a tile keeps every key of its own. A tile wrapped in a layout
element is not a direct child, so it is neither a valid listbox child nor
something the canvas will touch: it falls back to whatever tab stops the markup
already had, and axe reports the structure.

`src/renderer/components/Canvas.stories.tsx` drives all of this in a real
browser. `Keyboard` asserts where focus lands and counts activations, between
two other tab stops so that "one tab stop" is a claim about what Tab skips.
`PlainOptions` is the whole grid built from `<div role="option">` with no
button in it.

### The surfaces that portal

`Dialog`, `Menu` and the tooltip inside `IconButton` do not render where they
are written. Each one is a Radix portal, and a Radix portal with no `container`
mounts on `document.body`, which is outside `.sb-shell` wherever the consumer
put it. Applying the class by hand does not reach them: the portalled subtree is
a sibling of the container, not a descendant.

That is not a cosmetic failure. Measured in a browser, on a page carrying only
`@stuffbucket/maximal-electron/renderer/styles.css` and the eleven required
properties, a standalone `Dialog` on `document.body` computed
`position: static`, `width: 1280px`, `background-color: rgba(0, 0, 0, 0)` and
`border-radius: 0`, over a scrim that computed `position: static` and painted
nothing — an ordinary block in the page flow. Radix meanwhile applied everything
a modal does: twelve tab presses never left the dialog, and
`aria-hidden="true"` was set on the element holding the rest of the application.
The behaviour was modal and the appearance was not, and a keyboard user was
trapped in something that looked like a paragraph.

So the components do not take the Radix default. `ShellLayout` publishes its own
root element through a context, and a component that finds no shell above it
builds one: a `div.sb-shell[data-sb-shell-portal-root]` appended to
`document.body`, created once per document and reused. Composed or standalone,
a portalled surface is inside an element the stylesheet is scoped to. Neither
half is a public export — there is nothing for a consumer to wire.

One consequence a consumer has to know. **Define the `--shell-*` properties on
`:root` or `body`, not only on the element you put `.sb-shell` on.** The portal
root is a child of `body`, so it inherits from `body` and not from your
container. With the properties on `:root` a standalone dialog computed
`position: fixed`, `width: 520px`, the declared `--shell-raised` and
`border-radius: 14px` over a scrim at `rgba(0, 0, 0, 0.34)`. With them on the
container only, the same dialog was still fixed, centred, sized and scrimmed,
and drew `background-color: rgba(0, 0, 0, 0)`, because `--shell-raised` is one
of the eleven that carry no fallback. That is the transparent-shell failure
`docs/shell-variables.md` describes, not a new one, but a portal is where it
appears first.

`tests/portal-container.test.ts` holds the check, and `ShellLayout.stories.tsx`
holds the browser half of it under `npm run storybook:check`.

`docs/shell-variables.md` holds the whole contract, and this document does not
restate it. It says which properties are required, which carry a fallback in
the rule that reads them, which two JavaScript resolves rather than any rule,
and why there is no defaults layer.
`@stuffbucket/maximal-electron/verify/shell-variables` derives that contract
from the stylesheet a consumer installed, so an application asserts its own
adapter against the file it has rather than against a table somebody copied.

### The peers

Every package `./renderer` imports is an optional peer, and npm says nothing
about a missing one at install time. `Dialog`, `Menu` and `RadioGroup` reach
Radix packages the layout components do not, so a consumer who was already
importing `ShellLayout` gains three. README.md carries the whole row, and
`npm run verify:exports` compares it against the import graph the built entry
reaches, so the table cannot invent a peer or omit one.

## Wiring a terminal

`TerminalView` takes its transport as a value, so it knows nothing about an IPC
contract and a consumer supplies their own. Writing that transport was the
consumer's job until now: five request methods, two event subscriptions, and
the id filtering between them. Every consumer writes it the same way, and one
of them writes it wrong.

Two exports do it instead. `createTerminalTransport` from `./renderer` is the
renderer half. `registerTerminalChannels` from `./host/terminal` answers it
from a `TerminalHost`. Neither picks a channel name, for the reason
`exposeBridge` takes its `namespace` from the caller: a name this package chose
is a name every consumer with a contract of their own has to work around. Issue
#22.

```ts
// the consumer's renderer, over the preload they exposed themselves
import {
  createTerminalTransport,
  TerminalView,
} from '@stuffbucket/maximal-electron/renderer';

const transport = createTerminalTransport({
  invoke: (channel, request) => window.myApp.invoke(channel, request),
  on: (event, listener) => window.myApp.on(event, listener),
  channels: {
    spawn: 'term:spawn',
    write: 'term:write',
    resize: 'term:resize',
    terminate: 'term:kill',
    list: 'term:list',
    data: 'term:data',
    exit: 'term:exit',
  },
});

<TerminalView id="one" transport={transport} disposition="detach" />;
```

`invoke` and `on` are the consumer's own. `exposeBridge` does not supply them:
its capabilities are three named native powers, and a request channel is not
one of them. A consumer exposes their own pair through `extend`, or through a
preload of their own, and passes it here. This shell does the first, in
`src/preload/index.ts`.

```ts
// the consumer's main process
import { app, ipcMain } from 'electron';
import {
  registerTerminalChannels,
  TerminalHost,
} from '@stuffbucket/maximal-electron/host/terminal';

const host = new TerminalHost({
  homeDirectory: app.getPath('home'),
  defaultShell: process.env['SHELL'] ?? '/bin/zsh',
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
  },
});
```

Four things about that pair are worth stating rather than discovering.

**The two halves name a different number of channels.** The transport takes
seven and the registration takes five. `data` and `exit` are pushed by the
host, so a `TerminalHost` reports them through `emit` and `onExit`, which the
consumer sends on whatever the host's own window send looks like. Nothing here
sends for them: `./host/terminal` imports no `electron` and has no
`webContents` to reach.

**The names are typed against the caller's own contract.**
`TerminalChannels<C, E>` takes the caller's channel union and event union, so
`TerminalChannels<IpcChannel, IpcEvent>` makes a channel that contract does not
declare a compile error rather than a silent no-op. `TerminalRequestChannels<C>`
is the five-name half `registerTerminalChannels` takes.

**`registerTerminalChannels` takes a resolver as well as a host.** Its `host`
parameter accepts a `TerminalHost` or a function of the invoke event. A
consumer with one manager passes the manager. A consumer that keys one per
window passes the function, which is what this repository does: a session
belongs to a window, and `src/main/ipc.ts` resolves the manager from
`event.sender`. A request that resolves to no manager is dropped, and `list`
answers with no sessions.

**Its `ipcMain` parameter is structural, not an `electron` import.**
`TerminalIpcMain<E>` names the one method the registration calls, so
`./host/terminal` still loads no `electron`. That is what keeps the module
inside the unit suite, and inside the criterion `scripts/mutation-scope.mjs`
applies; it is deferred there rather than mutated, under #125. Passing
Electron's own `ipcMain` satisfies the parameter, and `E` is inferred from it.

The rule `exposeBridge` states holds here too. `src/renderer/lib/bridge-terminal.ts`
calls `createTerminalTransport` and `src/main/ipc.ts` calls
`registerTerminalChannels`, so the export is not a second implementation that
can drift from the one this repository runs: it is the one this repository
runs. Neither half imports the other, and neither may, so
`tests/terminal-channels.test.ts` is the check that duplication owes: it drives
both halves and asserts they name the same set.

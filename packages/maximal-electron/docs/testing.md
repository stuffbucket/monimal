# Testing

`docs/architecture.md` lists the three layers and what each covers. This
document holds the rules an agent needs when writing or reading a test here.

## Tests run in a random order

Both suites shuffle. A suite that only passes in declaration order is hiding
shared state. These specs share one Electron application, which makes that easy
to do by accident. It has already happened here once.

- **No test may depend on another.** Set up what you need inside the test.
- `e2e/harness.ts` exports `resetShell`, called from `beforeEach`. Extend it
  when you add state that leaks between tests.
- Both suites print a seed. `VITEST_SEED` and `E2E_SEED` replay a failing order.
- `E2E_SHUFFLE=0` restores declaration order while debugging.

Known cost: the end-to-end tests all register from one call site, so the
reporter shows the same source line for each. Names stay unique, and `--grep`
still works.

## Mutation testing

`npm run mutate` reports what the tests actually catch, which coverage does not.
**It breaks below 100.** It is three commands, and the two either side of
Stryker exist because a percentage on its own is a weak claim: it says nothing
about how many mutants there were, which files produced them, or what did the
killing.

| Step | What it decides |
| --- | --- |
| `scripts/mutation-scope.mjs` | Which modules Stryker should sweep, from a criterion |
| `stryker run` | The score, against `break: 100` |
| `scripts/mutation-report.mjs` | Whether the run measured what it claims to have measured |

A surviving mutant is a real gap. It found one here: `src/renderer/lib/data.ts`
scored 0 with 77 untouched mutants, because it had no unit tests at all.

### Which modules to sweep: a criterion, not a hand-list

`mutate` in `stryker.conf.json` is a list, but it is no longer maintained by
hand. `scripts/mutation-scope.mjs` derives the set it should hold: **every file
under `src/` and `scripts/` whose import closure reaches neither `electron` nor
React for a value.** Anything that does needs a real Electron runtime or a
browser, not Node, and Stryker cannot run it at all.

The criterion counts value imports only. `import type { BrowserWindow }` does
not put a module out of reach, because TypeScript erases it and the emitted
module never loads Electron. `src/host/main-options.ts` is the worked example,
and it is mutated.

A file the criterion selects that is on neither `mutate` nor the `DEFERRED` map
fails the check. That is the whole point: #102 records two modules landing with
fixture tests and no mutation coverage while the headline stayed 100.00, because
nobody remembered to name them.

`DEFERRED` is the backlog, one entry per file with the issue that closes it, and
#125 holds the measurement: applying the criterion to everything scores **38.44
over 4391 mutants**, of which 2449 have no coverage at all. Moving a file off
that map means getting it to 100 first.

### What the score does not say

Three things move Stryker's denominator without moving its percentage, and
`scripts/mutation-report.mjs` reads the JSON report back to catch each one.

- A mutant that **crashes the runner** is scored `RuntimeError` and leaves the
  denominator entirely. It is not a false kill — Stryker keeps it out of the
  score rather than counting it — but nothing failed the build over it either.
  See #116.
- A mutant nothing imports is scored `NoCoverage`.
- A file that quietly drops off `mutate` produces no mutants, and its absence
  looks exactly like success.

So the check asserts the shape of the run: every kill names a test that
reported, every file on the list produced at least one mutant, the total is at
or above `MUTANT_FLOOR`, and nothing ended in `RuntimeError`, `NoCoverage` or a
timeout. `IGNORED_CEILING` holds the suppression count, so a fourth
`// Stryker disable` has to be added on purpose.

Raise `MUTANT_FLOOR` when the count rises. A fall is the defect it exists to
catch, and the one exception is code deleted on purpose: say which deletion
paid for the new number, in the constant's comment and in the pull request.

### Reaching 100 after you add code

The threshold is 100, so a new module has to get there before it lands. A
survivor is one of exactly three things, and **"documented-equivalent" as a
catch-all is not acceptable**:

1. **Killable.** Write the test, and show the mutant going Survived to Killed.
   Most survivors are this. If a mutant lives, ask what behaviour it changed
   and whether anything asserts that behaviour.
2. **Dead.** Delete the code, or encode the impossibility in the type system.
   `noUncheckedIndexedAccess` forces a fallback on every index read, and a
   fallback that can never run is dead code that reads as untested. `cycle` in
   `data.ts` and `firstLine` in `ffmpeg.ts` both exist to remove one. Prefer
   this to a suppression.
3. **A deliberately-retained equivalent, with a written proof** over the
   reachable input domain. Use `// Stryker disable next-line <Mutator>: why`,
   and state the evidence, not the conclusion. There are three in the
   repository. Read them before you write a fourth, and raise
   `IGNORED_CEILING`.

The rule comes from `stuffbucket/maximal-core`'s testing strategy, which states
it better than anything written here before.


Never lower the threshold to make a change fit.

## Property testing, over one module

`fast-check` runs over the numeric core of `src/renderer/lib/contrast.ts`, and
nowhere else. It answers the question mutation testing cannot: Stryker mutates
the code that exists, so it proves every syntactic variant is caught by some
test, and it can never find an input nobody wrote a test for. `parseHex`,
`luminance`, `contrastRatio` and `meets` all run over a domain far larger than
the points `tests/contrast.test.ts` pins by hand.

Three rules come with it.

- **The seed is fixed, and `FAST_CHECK_SEED` moves it.** Stryker maps tests to
  mutants from a dry run and reruns the covering tests once per mutant. A suite
  that draws different inputs on the second run can report a mutant as
  surviving for a reason that has nothing to do with the mutant, and
  `npm run mutate` breaks below 100. Exploration is something a person does by
  moving the seed, not something a gate does by accident.
- **A property over an empty set asserts nothing.** The same rule as a check
  with no scope. A property whose body returns early for most inputs counts the
  runs that reached the assertions and fails when that count is zero;
  `checkPalette`'s accounting property counts the pairs it saw checked and the
  pairs it saw skipped, because a generator that only ever produced unreadable
  colours would leave half of it unexercised.
- **A property that has never shrunk to a failure is a declaration.** Break the
  implementation, record the counterexample fast-check prints, and put it in
  the pull request. #132 carries two.

Do not extend it to a domain the tests already enumerate. The rejection below
holds, and it is the reason this section names one module.

## The packaged application answers for itself

`npm run test:e2e` drives the unpackaged build, because
`EnableNodeCliInspectArguments: false` stops Playwright attaching to a packaged
one. That fuse stays as it is. Until now nothing launched the artifact a user
installs, and two defects shipped inside it: #86 and #88. `verify-package.mjs`
reads the archive listing, which finds a file that is absent and not one that
is present where the loader cannot reach it.

`npm run package && npm run smoke:packaged` closes it, on macOS and on Windows.
`scripts/smoke-packaged.mjs` copies the package out of this checkout —
`scripts/packaged-app.mjs` does that, and issue #149 is why — then launches
`Stuffbucket.app/Contents/MacOS/Stuffbucket`, or `Stuffbucket.exe`, with
`--self-check=terminal` and a token. The application opens a shell through
`TerminalHost`, the same class the terminal uses, makes it print the token,
writes one line, and exits with a code. `src/main/native/self-check.ts` holds
the argument protocol, and `tests/self-check.test.ts` pairs it with the
driver's copy of the strings.

Three properties are what stop it passing for nothing:

- **The token is random per run.** It reaches the driver only through a shell
  that ran a command, so a launch that opens no shell cannot produce one.
- **The command carries the token in two halves.** A pty echoes what is written
  to it, so a command containing the whole token would satisfy the assertion
  from that echo, with nothing having run. `printf '%s%s\n' 01234567 89abcdef`
  joins them under a POSIX shell. `cmd.exe` has no `printf` and its `echo` puts
  a space between two arguments, so the caret does the joining instead:
  `echo 01234567^89abcdef`. `cmd.exe` strips the caret while parsing the line,
  which leaves the halves apart in the command text and joined in the output.
- **Every run reproduces #88.** The driver moves the one native file the
  terminal cannot resolve without out of `app.asar.unpacked` and launches
  again. That run has to fail, and it has to fail by reporting the shell rather
  than by dying before the check. Then the file goes back.

The file is `spawn-helper` on macOS and `conpty.node` on Windows.
`conpty.dll` and `OpenConsole.exe` sit beside `conpty.node` in the same
prebuild directory and are **not** on this path: `node-pty` leaves
`useConptyDll` off, so `conpty.cc` takes `CreatePseudoConsole` out of
`kernel32` and never opens the DLL. Moving either of them aside on a Windows
runner leaves the check green, which is what established that rather than the
issue text, which named `OpenConsole.exe`.

The check runs before `whenReady` and opens no window, so it needs no window
server and no signed binary. `package (macos-latest)` and
`package (windows-latest)` both run it.

### The second self check: llama.cpp out of process

`--self-check=llama` launches the same binary again. It forks the engine as a
`utilityProcess`, makes it load `node-llama-cpp` out of `app.asar.unpacked`,
and then makes it fault in native code. A pass needs both halves: the library
resolved from the child, and the main process outlived the fault well enough to
print a line. `src/main/native/llama-protocol.ts` holds the strings and
`tests/llama-protocol.test.ts` pairs them with the driver's copy, as the
terminal half does. Issue #133.

**Unlike the terminal check, this one waits for `whenReady`**, because
`utilityProcess.fork` throws before the app is ready. It still takes no single
instance lock, so the wait costs only the ready event.

Its negative control moves the `@node-llama-cpp` scope aside and requires the
same launch to fail. Failing is not enough on its own: the control asserts the
failure names `did not load llama.cpp`, which is the branch reached only after
the engine started. Without that, an engine that never forked at all produced
the same two green lines — the "failed for the wrong reason" case at the end of
`.claude/skills/write-a-check/SKILL.md`, caught by re-running the break rather
than by reading the code.

The fault name is pinned per platform, and both have now been seen. `SIGSEGV`
is asserted by name on macOS, against the bare signal number Electron reports;
`access violation` is asserted on Windows, against the status code. What is
asserted on both is that the supervisor recognised a fault at all: a code
`llama-protocol.ts` cannot name reads as "exited with code N" and fails the
check with the number in the log.

The engine faults with Electron's `process.crash()` rather than with
`process.abort()`. Node defines `ABORT_NO_BACKTRACE()` as `_exit(134)` on
Windows, so an abort there is a clean exit that no crash handler sees, and the
Windows half of `verify:crash-artifact` was measuring a process that had not
crashed. Issue #156.

This is the first thing in the repository ever to load the packaged llama.cpp.
It failed on its first run, and `docs/architecture.md` records what it found.

What it leaves uncovered: no window, no renderer, and no IPC. It proves a shell
spawns inside the package, not that anything renders. It says nothing about the
linux package, nothing about a signed or notarised bundle, and on Windows
nothing about an installed tree, because this repository ships no installer.
Run it on the package Forge produces, which on macOS carries an ad-hoc
signature that `codesign --verify` already rejects because packager rewrites
`Info.plist` afterwards. Signing happens later, in stuffbucket/macos-runner,
and moving a file inside a bundle that has been signed properly would break its
seal.

## User interface changes

Green unit tests are necessary but not sufficient for a layout change.

Assert **computed** layout in a real engine, and look at the screenshot. See
`.claude/skills/verify-ui/SKILL.md`. This rule comes from maximal's
`ui-layout-verification` skill, which exists because two real regressions
shipped past a green suite.

Use `capture` from `e2e/harness.ts` rather than `page.screenshot`. macOS stops
giving an occluded window frames. The plain call then hangs until its timeout.
That reproduced against the overlay under seed 587000642. `capture` reads the
renderer through the debugger, which does not care what is in front.

### A declared focus trap is not a walked one

`role="dialog"`, `aria-modal`, and an inert background declare a modal to
assistive technology. None of them enforces one, and axe reports no violation
against a dialog focus escapes from on the third Tab press, because it reads
the declaration. A `.click()` proves less again: `inert` blocks a real pointer
and a real key without blocking a programmatic call.

So the overlay has two scenarios rather than one. The first reads the
attributes. The second presses Tab past the end of the card, then Shift+Tab,
and reads `document.activeElement` after every press — not a `focusin`
listener, because focus leaving an untrapped dialog lands on `document.body`
and that fires no `focusin` at all. It counts what Tab can reach before it
walks, and fails on zero: a trap over an empty card is an empty scope. See
#131.

### The agent scenarios script the model

Four scenarios drive the overlay's agent: the theme concierge in
`e2e/concierge.spec.ts`, and the answer, the approval gate, and Escape's
ordering in `e2e/shell.spec.ts`. All four needed a model, so all four skipped in
CI, which has none. Every green run in this repository's history was green
without the approval gate having been exercised once. That is #25, and it is the
same defect as an empty scope: a suite that reads as broader than it is.

`e2e/model-server.ts` supplies the model. It is an HTTP server on a loopback
port that speaks the two endpoints discovery uses for Ollama, and the spec
points the application at it with `STUFFBUCKET_PROVIDER=ollama` and
`STUFFBUCKET_PROVIDER_URL`. `docs/agent.md` holds what those two can and cannot
do; the short version is that neither goes near the gate.

Everything downstream of the token stream is real: pi-ai's HTTP client and SSE
parsing, pi-agent-core's tool loop, `beforeToolCall`, the risk classification in
`approval.ts`, the IPC events, and the card. Only the generator is scripted.

Three rules come with it.

- **A scripted reply cannot prove a tool ran.** The server chooses what comes
  back, so an assertion that the answer contains a marker passes with the shell
  never touched. Both bash scenarios write a file in a temporary directory
  through `tee` and assert against the filesystem: present after an allow,
  absent after a deny, and absent while the question is still on screen. That
  last one is what fails if a gate ever shows its card after starting the
  command.
- **Assert which backend answered.** `requireScriptedBackend` compares the full
  `ProviderStatus` against the scripted model's distinctive name, so a real
  Ollama on a developer's machine cannot satisfy the scenario by accident, and a
  run that reached no backend fails rather than passing over nothing.
- **The script matches the prompt with a regular expression.** It covers the
  plumbing and the gate. It says nothing about whether a real model picks the
  right tool out of a natural request, and nothing automated covers that on a
  runner with no model. `e2e/embedded.spec.ts` is the one scenario that asks a
  real model to choose, and it needs weights, so it stays out of the default
  suite.

### A still is not an oracle

`demo/stills/*.png` are artifacts to look at. Do not diff them for equality and
read the result as proof a change was neutral.

They are bistable. Running `npm run stills` three times over identical code
produced state A once and state B twice, differing by 179,000 pixels — around
four percent of the frame — in the canvas region of `01-projects` and
`03-multi-agent-tabs`. A separate 5,024-pixel floor is the macOS traffic lights,
which are coloured or grey depending on whether the window was key. A third,
worth 938 pixels, is the focus ring on `[data-testid="mode-grid"]` in
`test-results/shell.png`, which sits or does not depending on what the run
touched last.

This was learned the expensive way: a pixel difference was attributed to a CSS
change, bisected to a single rule, and that rule then turned out to match zero
elements in the fixture under a DOM probe. The instrument was the variable. The
938-pixel ring cost two package builds the same way, after the paragraph above
was already written.

For a renderer change, the evidence is a computed-layout assertion in a real
engine, and for a stylesheet change, a text diff of the built CSS in
`.vite/renderer/*/assets/*.css`. Both are deterministic. The images are for a
human to look at afterwards.

## The suite stays off the screen

A run drives a real application on the developer's desktop. Left alone, the
overlay paints over their full-screen editor and takes the keyboard, once per
scenario. So a test run parks its windows off the side of the display.

- `isE2EQuiet` and `quietBounds` in `src/main/native/preferences.ts` decide
  this. Quiet is the default. `STUFFBUCKET_E2E_VISIBLE=1` shows a run.
- **Move windows, never hide them.** `setOpacity(0)` also makes a run invisible,
  and it stops the compositor producing content. Every reference screenshot came
  back blank white while the suite stayed green.
- Both windows set `backgroundThrottling: false`. An off-screen window reads as
  occluded to macOS, and Chromium then throttles the renderer to that same blank
  result.
- `capture` fails when an image falls under `MIN_BYTES_PER_PIXEL`, in
  `e2e/screenshot.ts`. That guard exists because the blank captures above looked
  exactly like success. It measures compressed bytes per pixel rather than a
  byte count, because an absolute floor is a pixel-density constant and failed
  real Windows screenshots.
- **A quiet run takes no focus and puts no icon in the dock.** `focusWindow` and
  `setDockVisible` both return early. Nothing under test asserts either, because
  Playwright dispatches input through the debugger rather than the window
  server.

### No specification needs a real frame

`e2e/*.spec.ts` never calls `capture`. Every assertion goes through a Playwright
locator, `getComputedStyle`, or `getBoundingClientRect`, none of which need the
window composited. Only `*.stills.ts` and the recorder need real pixels, and
both are outside `playwright.config.ts` and outside CI.

So the suite that runs constantly does not need to be seen. If it is visible on
your desktop, that is a leak worth fixing rather than a requirement.

### The overlay is the worst of it

Everything that makes the overlay good at being an overlay makes it hostile to
the machine running the suite. It sits above full screen applications, follows
the user across spaces, covers the whole display, and takes key input. A run
then flashes over whatever the user is doing and pulls focus out of their
editor, once per scenario.

None of that is needed to test it. Playwright dispatches input through the
debugger rather than the window server, and `capture` reads the renderer rather
than the screen. So `applyStacking` in `src/main/windows/overlay.ts` quiets it
under `STUFFBUCKET_E2E`: the window still shows, still reports visible, and
still lays out exactly as it does in production.

## Three directories say "demo"

They are not the same thing, and the names are a trap.

| Path | What it is |
| --- | --- |
| `demo/` | Output. Committed stills, mp4 files, and the `edits/*.json` that cut them. |
| `e2e/demo/` | The recorder. Generic capture, compose, and encode machinery. |
| `e2e/fixtures/demo-shell/` | The fixture itself: the fake agent fleet and the components that render it. Its own renderer entry point, excluded from the package. |

The fixture may import from `src/`. The product may not import from `e2e/` —
ESLint enforces that, because one import the wrong way puts the fixture back
into the bundle a user installs.

`e2e/demo/*.demo.ts` are timelines, not tests. Four configurations match four
suffixes: `.demo.ts` records, `.compose.ts` cuts, `.stills.ts` photographs,
`.spec.ts` gates. Do not merge them.

## The capture fixture is not always built

`npm run package` builds `demo_window` alongside the application, and
`forge.config.ts` then excludes it from the package. `verify-package.mjs`
asserts that exclusion, which is why the default builds it: a check that the
fixture is absent proves nothing if the fixture was never made.

`STUFFBUCKET_SKIP_FIXTURE=1` drops it. CI sets that on the end-to-end job only,
where no spec reaches the fixture and `verify:package` does not run. Leave it
unset anywhere `npm run stills` or `npm run record` follows.

## Techniques rejected, with the reason

Each of these was investigated against this repository and turned down. They
are recorded because the argument is the expensive part, and because a
technique with no stated rejection gets proposed again every six months.

Each one would also run, print green, and check less than what is already
here. That is worse than not having it, because a green run reads as verified.

- **Do not diff `demo/stills` for equality**, in Playwright's
  `toHaveScreenshot` or anything else, and call it a regression gate. A pixel
  diff reads as "layout unchanged" on a still that is bistable for reasons
  unrelated to the change under review. That is the empty-scope failure wearing
  a different tool: a check that returns green because it quietly stopped
  checking the thing that matters. See "A still is not an oracle" above.
- **Do not put Storybook in CI**, through the test runner or its successor the
  Vitest addon. Both turn every story into a gating test, which reopens the
  choice `docs/storybook.md` already made and defended: a workshop tool does
  not gate a pull request, and a story broken by a refactor is allowed to rot
  until somebody opens it. The newer tool is the same decision by another name.
- **Do not adopt Playwright component testing** as a second mounting harness.
  The components worth protecting are the ones with `play` functions — the
  roving keyboard navigation on the tab strip and the title bar, and the
  generic dialog pattern. Porting each specific assertion into the end-to-end
  suite that already runs closes the same gap without a second framework that
  knows how to render them.
- **Do not add a coverage percentage gate on top of `npm run mutate`.** Line
  coverage answers "did this execute", which a 100 mutation score subsumes and
  exceeds. It is a second number to chase carrying less information than the
  first. It could mean something on the modules Stryker cannot reach, but that
  is a different scope, and even there it proves execution rather than
  correctness.
- **Do not turn on Stryker's incremental mode.** It works, and its own
  documentation is explicit that it can carry a stale "killed" result forward
  when a change falls into one of its blind spots: an environment change, a
  dependency bump, or a runner that reports coverage per file rather than per
  test location, which Vitest does. A mode that can report 100 against data it
  did not re-run is the same failure in a faster package. The minute this step
  costs is the honest price of a gate that means what it says.
- **Do not run `fast-check` over a domain the tests already enumerate.**
  `escapeAction` takes two booleans and its whole input domain is four values.
  Generating inputs for that is exhaustive testing done slower, with a
  dependency to show for it. The numeric core of `src/renderer/lib/contrast.ts`
  is the one place a continuous domain makes it pay, and it is the only place
  the dependency is used. See "Property testing, over one module" above.

### Infrastructure rejected for the same question

A run drives a real application on the developer's desktop, and the answer was
two guards in this repository rather than a machine. These were the
alternatives.

- **A separate macOS Space is not reachable.** `NSWindow` exposes a collection
  behaviour for a window the process already shows, and nothing in AppKit lets
  a process open a window on a Space it is not on. Every tool that does this
  reaches a private, undocumented API, and some of those commands need System
  Integrity Protection turned off. That is not a foundation for a test suite.
- **A container or a Linux virtual machine tests the wrong platform.** Every
  option available here runs a Linux guest only. The overlay's non-activating
  panel, the dock, and the packaging assertions are all macOS behaviour a Linux
  guest cannot exercise at all, so this trades "off the desktop" for "untested
  on the platform most of the native code targets".
- **A virtual display driver changes nothing that matters.** It adds a monitor
  inside the session the developer is already logged into. It is a fancier
  version of `quietBounds`, at the cost of a third-party dependency, and it
  leaves the dock and the activation alone because it is the same user.
- **Offscreen rendering was not tried, and is not free.** An offscreen window
  is always frameless, so the traffic lights the stills exist partly to show
  would never appear, and it needs a second window-construction path kept in
  step with the real one. Whether the debugger capture path can read an
  offscreen surface at all is unknown.

A second macOS user account, logged in through Fast User Switching, is the one
alternative that was not ruled out: it has its own fully composited session,
independent of the primary user. It was never tried here, and it stopped being
worth trying once `focusWindow` and `setDockVisible` learned to return early.
Treat it as a spike rather than a fix if the question comes back.

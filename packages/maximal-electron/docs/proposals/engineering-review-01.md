# Engineering review 01

The first pass over this repository, after the batch of work that merged on
5 August. It covers `AGENTS.md`, `docs/`, the twenty-four merged pull requests,
the open issues, the verification scripts, and `tests/contrast.test.ts`.

## What the evidence said

The repository has shipped two false passes, and both had the same shape. A
grep for error strings matched nothing and reported three `play` functions as
passing when one had failed. `checkPalette` returned only the pairs it could
judge, so a palette written in `oklch()` produced an empty list that read as
success. In each case the logic was right and the scope was wrong: the check
looked at a set that turned out to be empty and called that a pass.

Reading the rest of the checks with that in mind, the same shape appears in
several more places. An ESLint block scoped to `**/*.ts` had never applied a
rule to a `.tsx` component. A selector scan that only recognises lines starting
with `.` or `*` judges no other shape. A stylesheet excluded from a tripwire by
filename stops being excluded correctly as soon as there are two files on that
side. A verifier that reads `dist/` reads whatever was last committed there.

So the three checks below are all about scope, and each one carries a floor:
an assertion that it looked at more than nothing.

## What changed

### The package stylesheet contract

`tests/package-styles.test.ts`, with `tests/stylesheets.ts` shared with
`tests/contrast.test.ts`.

`structural.css` is the stylesheet a consumer installs. It defines no palette:
it reads the `--shell-*` namespace, and `README.md` holds the table that tells
a consumer which of those they must define. Nothing checked that table, and
nothing checked that the file styles the classes the exported components
render.

The token half is the `REQUIRED_TOKENS` tripwire applied to the consumer seam.
Both sides are read from the files, so the table cannot be right today and
wrong after the next component.

The class half found two live defects. `nav__break` arrived with the navigation
rail in #36 and was styled only in `shell.css`, which does not ship. A consumer
importing `NavRail` got an unstyled span, and the collapsed rail's spacing was
wrong. `icon-button--danger` had never been in the package stylesheet at all,
so `IconButton` with `danger` set drew a plain icon button. Both are fixed
here, with fallbacks so a consumer who names no danger colour is no worse off
than before.

`tests/contrast.test.ts` no longer skips `structural.css` by name. It
classifies tokens by namespace, which is the distinction the filename was
standing in for, and a new assertion states that no stylesheet reads both
namespaces. That is what makes the partition total rather than incidental.

### `dist/` freshness

`scripts/verify-exports.mjs`, and the script now runs in CI.

`dist/` is a build artifact that is also committed, and `.gitignore` lists it.
Once a file is tracked the ignore stops applying, so a build rewrites tracked
files and nothing says so. Every check in that script — the export names, the
import graph, the packed paths — reads whatever was last committed.

It was stale. The tab strip merged and nobody rebuilt, so the published
`./renderer` export sat one merged pull request behind `src/`. Nothing in CI
ran `verify:exports` at all.

The check reports both directions: a tracked file the build modified, and a
file the build wrote that git does not track. The second matters because
`.gitignore` keeps a new file out of `git status`, so the obvious check would
have missed it.

Issue #33 proposes untracking `dist/` and building at pack time. This check
prints a skip line and stops mattering once that lands.

### Playwright teardown

An ESLint rule in `eslint.config.mjs`, on `e2e/**` with `harness.ts` exempt.

`closeApp` exists because the embedded model crashed on quit through four
consecutive green runs. A crash during teardown happens after the last
assertion, so Playwright reports the run as passed; the only evidence was in
the operating system's crash reports. `closeApp` reads the exit code and the
signal and throws on either.

It was then not used by `e2e/demo-stills.stills.ts`, which called
`app.close()`. That is the stills configuration, which is both the one nobody
watches and the one issue #24 says is already nondeterministic. Fixed, and the
rule stops it coming back.

## What did not change, and why

**`AGENTS.md`.** No edit. Every incident this pass found is now enforced by a
check or already covered by #44, which is in flight. A rule that says "close
through `closeApp`" costs a line on every future turn and buys nothing an
ESLint rule does not already buy. The file was cut to 135 lines on purpose and
the bar for putting a line back is that nothing else can carry it.

**Storybook and `storybook:check` stay out of CI.** The documented reason is
that a workshop should not gate a pull request, and that a panel nobody can get
to zero is a panel nobody reads. Both still hold. #36 shipped three known ARIA
violations behind a check that does not gate, which is an argument for fixing
#38, not for moving the check.

**The stills.** #24 is open and the bistability is unfixed. Nothing here is a
check for it, because the honest check is ten consecutive identical runs and
that is the issue's own done-condition.

**`--delete-branch` closing a stacked pull request.** #43 merged, its head
branch was deleted three seconds later, and #44 — which was based on it —
closed rather than retargeted. It cannot be reopened. This is a GitHub
behaviour, not a repository one: nothing in this tree can observe it, there is
no setting that changes it, and the only defence is the sentence #44 already
adds to `AGENTS.md`.

**Concurrent worktrees.** Three agents merged inside 180 seconds and left
`main` with a failing unit test. The answer is not a convention about who
touches which file; it is running CI against the state a merge produces.
Filed as issue #52.

## Filed

| Issue | Milestone | What |
| --- | --- | --- |
| #51 | v0.0.2 | `structural.css` can ship an unscoped selector past the check meant to stop it |
| #52 | v0.0.1 | CI never runs against the state a merge produces |
| #53 | v0.0.1 | `CONTRAST_PAIRS` is hand-maintained, so a new pair is unchecked |

## Proposals

`docs/proposals/` held nothing at the time of this pass, on `main` or on any
branch or worktree. The four research documents described as in progress — Zed
theme consumption, build velocity, verification technique, exemplary Electron
repositories — do not exist yet. Zed theme consumption already has issue #42 on
v0.0.2, so a proposal on it should either close as covered or say what #42
leaves out.

## Next time

The recurring failure signature here is a check whose scope is wrong rather
than whose logic is wrong. Four of them are now closed. The ones left are:

- **`verify-docs.mjs` walks a corpus it does not floor.** Rename `docs/` and it
  verifies README and AGENTS alone, reports the smaller count, and exits zero.
  Assert that each declared root exists.
- **`storybook-check.mjs` gives up on axe after twelve attempts and returns an
  empty violation list.** A story that never lets axe run reads as clean.
- **`verify-exports.mjs` matches re-exports with a regex against a literal list
  of eight names.** A re-export written any other way is invisible, and the
  "is generic" walk is a list of forbidden filename patterns.
- **`renderedClasses` in `tests/stylesheets.ts` is a regex over source text.**
  It reads `className` written as a string or a template literal. A class
  computed some other way is not seen. That is a floor on what the class
  tripwire can promise, and it should be said out loud rather than discovered.

The other thing worth a pass: nothing bounds the dependency closure of an
export. Issue #31 says `./host` needs only `electron` and pulls the whole
application tree. That is measurable, and a number in a test would hold it.

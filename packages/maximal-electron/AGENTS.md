# AGENTS.md

Instructions for coding agents working in this repository. Read this before you
change anything. `CLAUDE.md` points here.

This file holds the rules that apply on every change. Everything else is in a
linked document, and the link is the instruction to go and read it before
working in that area. If a rule here looks arbitrary, the reason is in the
linked document.

## Commands

| Task                                    | Command                                                                                                               |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Lint                                    | `npm run lint`, `npm run lint:fix`                                                                                    |
| Types                                   | `npm run typecheck`                                                                                                   |
| Unit tests                              | From the monorepo root, `pnpm test`; see [`docs/testing.md`](docs/testing.md)                                         |
| Terminal unit tests                     | `pnpm --filter @maximal/maximal-electron run test:terminal`                                                       |
| Mutation tests                          | `pnpm --filter @maximal/maximal-electron run mutate`                                                              |
| Terminal mutation tests                 | `pnpm --filter @maximal/maximal-terminal run mutate`                                                              |
| Look at a component                     | `npm run storybook`                                                                                                   |
| Check every story                       | `npm run storybook:check`                                                                                             |
| Check the palette                       | `npm run check:contrast`                                                                                              |
| Verify the exports                      | `npm run verify:exports`                                                                                              |
| Verify the shell stays agnostic         | `npm run verify:neutral`                                                                                              |
| Verify the docs                         | `npm run verify:docs`                                                                                                 |
| Verify every workflow still runs        | `npm run verify:workflow-health`                                                                                      |

Run `npm run lint:fix` after you change code. Do not ask first.

Run `pnpm --filter @maximal/maximal-electron run typecheck` and the native
workspace tier from [`docs/testing.md`](docs/testing.md) before you report a
change as done. Run the pinned-dependency Docker rerun from the primary checkout.

## Never

Each of these is load-bearing. Do not relax one to make a change fit.

- **Never add an API key**, or any credential. Discovery finds a provider on
  localhost. A key in this repository is a defect, and no Apple credential
  belongs here.
- **Never weaken `contextIsolation: true`, `nodeIntegration: false`, or
  `sandbox: true`** on any window.
- **Never widen the `shell:open-external` allow-list** beyond `http`, `https`,
  and `mailto`. `setWindowOpenHandler` denies, and `will-navigate` blocks
  cross-origin navigation. Both send the URL to the real browser instead.
- **Never lower the mutation threshold.** `pnpm --filter
@maximal/maximal-electron run mutate` breaks below 100.
  It also breaks when a module the criterion selects is on neither the mutate
  list nor its deferred list, and when the mutant count falls. See
  `docs/testing.md`.
- **Never round-trip a manifest through a serializer to edit one field.**
  `json.load` then `json.dumps` on `package.json` rewrites key order, escaping,
  wrapping and the trailing newline, so a one-line version bump arrives as a
  46-line diff and the real change is invisible in review. It happened on the
  v0.0.6 cut.
- **Never bump the version with a global find and replace either, and not with
  `npm version`.** Both were measured and both are wrong here.
  `npm version <v> --no-git-tag-version` expands this repository's compact
  `peerDependenciesMeta` entries from one line each to three, which is the same
  reformatting in a different place. A global replace of the version string
  repins an unrelated dependency whose pin is the same text, as it did to
  `package-lock.json`'s `node_modules/tunnel` at `0.0.6`; `pnpm-lock.yaml` is
  equally full of version strings. Replace the exact line — one, in
  `package.json` — and assert the replacement count. `pnpm-lock.yaml` does not
  record the root package's version, so it needs no bump. Issue #167.

## Report what you verified

State the command you ran and what it printed. If you did not run something, say
so. If a step was skipped or a test failed, say that first.

Green unit tests are not sufficient for a layout change, and a screenshot is
not an oracle. See `docs/testing.md` before you claim a visual change is
neutral.

### A check must fail when it has nothing to check

Six checks here have passed while examining an empty set, and one of them
shipped a broken terminal. A check you add or change reports how many things it
examined and fails on zero. `scripts/check-scope.mjs` is the runner that does
it: `check(ok, message, { count, of })` prints the count beside the message and
fails on zero whatever `ok` says. It throws without a scope, so the convention
is not something to remember.

`tests/check-scope.test.ts` discovers every `verify:*` and `check:*` script from
`package.json` and requires it to use the runner. A script not on it yet is
named there with the issue that will move it, and the list may only shrink.

Commit your own work first, then break it on purpose and put the failure
message in the pull request. See
`.claude/skills/write-a-check/SKILL.md`.

## Writing code

- Target under 300 lines for a module, excluding tests. Past roughly 400 lines,
  add a new module instead of growing the file.
- Match the density and idiom of the surrounding code.

### Comments

The default is no comment. A comment earns its place by recording one thing the
code cannot: a constraint from outside the file that the shape obeys.

These rules cover docstrings too. A docstring is a comment with a doc page
attached, and the long ones here grew because that was forgotten.

- **Do not restate code.** A comment that says what the next line says creates
  two things to keep in step, and they drift.
- **Keep a comment shorter than the code it explains.** One or two lines above a
  rule, up to about five above a function. Past that the explanation is a
  document, so put it in `docs/` and leave one line pointing there. A ten line
  block over a one line rule is the case this is written for.
- **State the constraint, not the story.** "macOS throttles an occluded
  renderer" earns its line. Retelling how that was discovered does not. No
  measurements, no counts of what went wrong, no account of who believed what:
  name the issue number and let the issue hold it.
- **Leave the alternatives out.** The code is what is done. A comment arguing
  against what is not done — "the obvious approach loses because", "do not use X
  here" — asks a reader to hold a design that does not exist. If the rejected
  option matters, it belongs in the commit message or the issue.
- **Do not narrate the change.** The code is the current state, not a history.
  Anything of the form "changed from X" or "used to be Y" belongs in the commit
  message.
- Every comment costs attention on every future read, not only the one where it
  was useful. Delete one that has stopped paying.

Comments are 24 percent of `src` and 102 blocks run past eight lines, which is
issue #55. Prose explaining a rationale is the bulk of it. When a comment starts
to argue, stop writing and open an issue.

## Writing prose

Keep sentences short. Do not use contractions. Name the component that acts,
rather than writing a passive that leaves the actor out: `pty.ts` coalesces
output, rather than output is batched.

There is no automated style check. Style here needs judgement, and the one tool
that was tried could not tell a rule from a description. `npm run verify:docs`
checks names, not prose.

## Releases

This package is private to the monorepo and does not own the repository release
process. The desktop application release belongs to the repository root; see
`docs/release.md` for the package boundary and platform notes.

## Where the rest of the rules are

Read the linked document before working in that area. Each one holds rules, not
only background.

| Area                                                                  | Document                  |
| --------------------------------------------------------------------- | ------------------------- |
| Host APIs, renderer components, terminals, build output               | `docs/architecture.md`    |
| The exports a consumer imports, `runMain`, the `options` shape        | `docs/embedding.md`       |
| The `--shell-*` contract the renderer package reads from its host     | `docs/shell-variables.md` |
| Random order, mutation testing, layout evidence, the off-screen suite | `docs/testing.md`         |
| Stories, the a11y run, what is deliberately not in CI                 | `docs/storybook.md`       |
| Private package and application ownership boundary                    | `docs/release.md`         |
| The workspace consumers and exported surface                          | `docs/consuming.md`       |
| The workflows, run health, and the merge race                         | `docs/ci.md`              |
| Code signing                                                          | `docs/signing.md`         |
| What is planned and what is deliberately not                          | `docs/roadmap.md`         |

Skills carry the walk-throughs. Read `.claude/skills/`. A list written out here
goes stale; the one this replaces named three of the five that existed.

## Package boundary

This package MUST NOT contain an Electron application entry point, Forge
configuration, product preload, product renderer composition, application
branding, or packaged-application test harness.

Application lifecycle and packaging MUST live in `apps/desktop`.

Native terminal packaging checks MUST remain exported through `./verify` so the
application that owns the artifact can validate it.

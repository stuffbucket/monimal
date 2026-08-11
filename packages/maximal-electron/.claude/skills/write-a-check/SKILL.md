---
name: write-a-check
description: Add or change a verification script, a test tripwire, or a CI assertion without shipping a check that passes while examining nothing
---

# Write a check

This repository has one recurring defect. A check has correct logic and empty
scope, so it passes while measuring nothing. It has happened six times. One of
them shipped a broken terminal to users in `v0.0.2`.

Read this before you add a check, and before you change the scope of one that
exists.

## The six

| # | The check | Why the scope was empty | What it cost |
| --- | --- | --- | --- |
| 1 | A grep for an error string in the demo capture log | The string never appeared, and no match read as success | Three `play` functions reported passing when one had failed |
| 2 | `checkPalette` in `scripts/check-contrast.mjs` | It returned only the pairs it could parse, and a palette in `oklch()` parsed to none | An empty list read as a clean palette |
| 3 | `scripts/verify-exports.mjs` | It listed its targets by hand | A new export was never checked |
| 4 | `check(findUnpacked('*.node').length > 0, …)` | node-llama-cpp's binary satisfied it | `spawn-helper` stayed inside `app.asar`, and the packaged terminal on macOS never worked. Fixed in #88 |
| 5 | `contentSecurityPolicyChecks` in `scripts/terminal-package.mjs` | The only caller passes no policy, so the branch never runs | The shipped policy has never been measured. Open as #92 |
| 6 | `LLAMA_LIBRARIES.flatMap(findUnpacked).length > 0` | Two patterns flattened into one array, asserted non-empty | Losing all seven `libggml*` files passes. Open as #92 |

Instance 6 sits eight lines below a comment that describes instance 4 as the
lesson learned. Prose next to the code did not stop it.

## Three obligations

### Report how many things you examined

`scripts/check-scope.mjs` is the runner. `check(ok, message, { count, of })`
prints the count beside the message, and fails on zero whatever `ok` says:

```
  ok   every documented script is in package.json  [58 `npm run` mentions]
 FAIL  :root is legible  [nothing to check: 0 pairs judged]
```

It throws when a caller states no scope, so the third argument is not a
convention anyone has to remember. `of` is a noun the caller picks, because the
sets differ: a file scan counts files, a selector parser counts selectors, a
package check counts targets. One abstraction over all three would fit none.

`tests/check-scope.test.ts` reads `package.json`, takes every `verify:*` and
`check:*` script, and requires each to use the runner. A script not moved over
yet is named in `PENDING` there with the issue that will move it, and the test
fails if an entry stops being true. A new check script is caught the day it is
added, because it is in neither set.

One count per assertion, not one per script. Instance 6 was a script with a
correct total that hid a per-pattern zero.

### Fail on zero

An assertion over a collection needs a floor on the collection. Write the floor
as a separate failure with its own message, so the output distinguishes "this
was wrong" from "there was nothing to look at".

`@stuffbucket/maximal-electron/verify` does this at the seam a consumer
touches: the
first two returned checks are floors on the file lists, because a consumer who
points the verifier at the wrong directory would otherwise get a green run.

### Break it on purpose, and say so

Every defect above was found by running something, and none by reading it.
#88 made nine checks fail deliberately and found that the new `spawn-helper`
assertion would have failed every Linux release, because `pty.cc` uses the
helper only under `__APPLE__`. #87 made six fail deliberately. The first real
run of `release.yml` found #86.

The recipe is the same each time.

1. Commit your own work. Otherwise `git add` sweeps it into the commit that
   carries the break, and undoing the break takes it too.
2. Make the condition the check exists for true. Delete the file, strip the
   token, rename the artifact.
3. Run the check. Record the message it printed.
4. Undo the break by one of the two methods below, run it again, record the
   pass.
5. Put both messages in the pull request body.

For a packaging check, mutate the built package rather than the source, because
that is the artifact the check reads:

```bash
npm run package
rm out/*/Electron.app/Contents/Resources/app.asar.unpacked/**/libggml-base.dylib
npm run verify:package
```

A check you have not seen fail is a claim, not a check.

#### Undo the break without discarding your own work

Undoing by path discards by path. Checking out a path, restoring a path,
cleaning with force, and a reset in hard mode all replace the whole file, so the
injected line and every other uncommitted edit in that file go together. Two
agents reached for one of those in a single day, and the second lost its own
edits to `.github/workflows/release.yml`. Use one of these instead.

- **Commit the break, then revert the commit.** Commit the injection on its own,
  then `git revert --no-edit HEAD`, or move the ref back with
  `git reset --keep HEAD~1`, which refuses rather than discards. The break is
  never uncommitted, so undoing it cannot reach anything else.
- **Or delete the injected text with a targeted edit.** Keep the exact string
  you inserted, and remove exactly that string.

Either way, finish with `git status --porcelain` and read the output. Empty
means the tree matches the commit. One agent ran the second recipe through a
whole round of deliberate failures this way, one porcelain run after each
revert. Another agent's targeted edit silently did not run, because the string
it matched also appeared in an upload step: the edit failed, the tree stayed
broken, and the porcelain line was the only thing that noticed. Without it that
agent would have pushed the injected break. The verification step is not
ceremony.

## The related failure: a check that never runs

Three of the four jobs in `release.yml` had never once completed successfully,
and only a dispatch found that out. That is the same defect one level up: the
scope is the set of runs, and it was empty. Those three jobs were the
installers, and they were eventually deleted rather than fixed.

`docs/ci.md` holds the rule for anything added to a workflow. It must be
possible to run before a tag, and it must fail when it has nothing to do. The
dry run exists for the first half and `dry-run-artifacts` for the second.

## Still unfloored

- The five `verify:*` scripts named in `PENDING` in `tests/check-scope.test.ts`
  print bare `ok` lines. Their scopes are unstated, so an empty one is still
  invisible.

## What a scope does not catch

A scoped-rename change broke `git archive --prefix`, and the check reported one
of three assertions as passing. It had a scope, the scope was not zero, and it
failed for the wrong reason. Counting the set an assertion ran over says
nothing about whether the assertion measures what its message claims. That is a
separate defect, and nothing here addresses it.

### A scope that is honest and still misleading

`npm run verify:docs` reported `205 backticked paths` while collecting only the
paths under a declared source root. Two deliberate breaks passed: a build
output path, and a module name written relative to `src/main`. Neither matched
a root, so neither was counted, and the number was true about what the check
examined and silent about what it declined. #152.

So a check that narrows its input states what the narrowing dropped, and states
it as a number. `verify:docs` prints the paths it declined beside the paths it
checked, the way it prints out-of-scope `npm run` mentions after #126. An
answer you could not compute must not read as one you did.

## Where this is written down

`AGENTS.md` carries the one-line rule. `docs/ci.md` carries the workflow half.
[`docs/proposals/engineering-review-01.md`](../../../docs/proposals/engineering-review-01.md)
holds the account of instances 1 to 3, and
[`docs/proposals/README.md`](../../../docs/proposals/README.md) indexes it
alongside the second review.

Both are markdown links rather than bare backticked paths, so a reader can
follow them. `docs/proposals/` is exempt from name checking, which makes a link
from a document somebody opens the only thing that keeps a proposal reachable.
`docs/roadmap.md` carries the other one.

Renaming either file fails `npm run verify:docs` twice, on the link and on the
backticked path inside it. Both rules were run against a rename to confirm that,
rather than assumed.

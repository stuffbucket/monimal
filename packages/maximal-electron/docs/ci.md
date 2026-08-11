# Continuous integration

Three workflows build. `ci.yml` is the blocking gate, `release.yml` builds and
ships a tag, and `merge-preview.yml` tests what a merge would produce. One
more builds nothing: `workflow-health.yml` reads whether the others still run
at all. Each is described in its own header.

## What each one runs

| Workflow | Trigger | What it is for |
| --- | --- | --- |
| `ci.yml` | pull request, push to `main` and `release/**`, or a dispatch | Lint, types, unit and mutation tests, a git-ref install, packaging, the packaged smoke test and the end-to-end suite on macOS and Windows |
| `merge-preview.yml` | push to `main` and `release/**` | Replays every open pull request against the new tip |
| `release.yml` | tag `v*.*.*`, or a dispatch to rehearse or to retry | The draft release, the tarball, the registry publish, publish |
| `workflow-health.yml` | daily, a pull request, or a dispatch | Reads every workflow's run history and files one issue when one has never run, has stopped running, or fails every time |

This repository ships no installer. `npm run package`, `npm run
verify:package` and `npm run smoke:packaged` still run in `ci.yml`, because
packaging is a property of the shell and it is where the defects were found.
What was removed was the MSI and the dmg built on top of it, and
`windows-msi-dev.yml` with them. See `docs/release.md`.

## The two caches

`actions/setup-node` with `cache: pnpm` caches npm's own tarball cache, so a
registry package does not download twice. Electron's binary is not a registry
package: it is fetched from GitHub through `@electron/get`, into a directory
that library manages itself, and nothing cached it until #129.

**It is not the install that downloads it.** Electron 43 ships no `postinstall` at
all. `node_modules/electron/index.js` fetches the binary the first time
something resolves the executable path, and here that is
`electron-forge package`. #129 opened on the assumption that every job paid for
the download; the first run of the check below found the `lint, types, tests`
job's cache root empty after the install, which is what disproved it. So the cache
is restored in the four jobs that package — `package` and `end-to-end` on both
hosts — and in no others.

There are two downloads, not one. `install.js` reads `electron_config_cache`
for its cache root; `@electron/packager` calls `@electron/get` without one and
takes the default. CI therefore does **not** pin the variable: pinning it would
move one download and leave the other in the default directory, so the cached
path would hold half of what the job fetched and still look populated.

The default is `env-paths('electron').cache`, which is
`~/Library/Caches/electron` on macOS, `~/.cache/electron` (or `XDG_CACHE_HOME`)
on Linux, and a `Cache` folder under `%LOCALAPPDATA%\electron` on Windows.
`scripts/electron-cache.mjs` computes it, and
[`.github/actions/electron-cache/action.yml`](../.github/actions/electron-cache/action.yml)
asks the script for it with `--path` rather than writing the three paths into
YAML. The check reads the same function, so the directory that is cached and
the directory that is asserted cannot drift apart.

**The key carries the Electron version**, read out of `package.json`, so a
version bump misses rather than restoring the wrong binary. It deliberately
does not carry a lockfile hash: this cache holds Electron and nothing else, and
a hash would throw it away on every unrelated dependency bump. Underneath,
`@electron/get` puts each version in its own hashed directory and names the file
`electron-v<version>-<platform>-<arch>.zip`, so a stale binary cannot be served
even when a key collides.

`release.yml` does not use it. `package-tarball` never packages, so it never
resolves the binary either.

### What it has been measured to save, which is nothing yet

The first three runs missed every time: a cache written under
`refs/pull/<n>/merge` is invisible to `refs/heads/release/**`, so the pull
request that added it and the push that merged it each had to write their own.
The first run in the steady state hit on all four packaging jobs.

At that hit, `npm run package` came in at 19 s and 15 s on the two macOS jobs
against pre-change medians of 30 s and 22 s, and at 42 s and 35 s on the two
Windows jobs against 38 s and 39 s. Two down, one flat, one up, on one run each,
against a step whose spread over five pre-change runs is ten seconds wide. The
restore itself costs three to four seconds per job.

**So the saving is inside the noise on the evidence there is.** The arrangement
is correct and cheap, and that is not the same as it paying. Re-measure over a
week of runs, and take it out if the four jobs still do not separate. Issue #129
carries the run ids.

### Why there is a check on it

A cache is exactly the shape of defect this page is about. Put it in a job that
never resolves Electron and the root stays empty, `actions/cache` saves an empty
directory, and every later run restores it and reports a hit while nothing is
cached. Nothing in the log says so.

So every job that uses the action runs `npm run verify:electron-cache`, **after
`pnpm run package`** rather than after the install, because packaging is the step
that fills the cache. It counts the files under the root, fails on zero, and
asserts that the download for this runner's platform and architecture is there
at the version `node_modules/electron` actually installed.

It also reads the cache **key** out of the action's own YAML and asserts it
names the runner operating system, the architecture, and the Electron version.
That is the cause rather than the symptom: a key that stops naming the version
restores the previous binary, and the first run that could notice is the one
after the mistake. The contents cannot carry that assertion, because a
developer's shared cache root legitimately holds several Electron versions and
a CI cache holds one.

It fails rather than reporting the run unverified. Every condition it asserts is
one those four jobs always meet, so a zero there is a real defect and not a
question the check could not answer.

## The problem this page exists for

Every defect in the release pipeline so far was a job that had never executed.
The `v0.0.2` train hit three: an XML comment that stopped `wix build` producing
an MSI, `npm pack` into a directory nobody created, and a download that cannot
resolve a draft release. The unit suite was green throughout. A check that only
runs behind a tag is a check nobody has run.

So the rule for anything added here is that it must be possible to run it
before a tag, and it must fail when it has nothing to do.

The first complete dry run found another, one level down: `wix build` harvested
zero files, said so as a warning, and produced an MSI that installed an empty
directory. Issue #86. That MSI is gone now, and the rule it produced is not:
a step that finds nothing fails rather than reporting success.


## The packaged smoke test

`npm run smoke:packaged` is the newest job step and is written to that rule. It
runs in `package (macos-latest)` and `package (windows-latest)`, after
`verify:package`, and it launches the application it just built — from a copy
of the package outside this checkout, because `out/` is inside one and a
package that resolves into the repository above it is not the package a user
installs. Issue #149. Its own floor is a second launch with a native file moved
aside, which has to fail: the step cannot report success without having started
a shell inside the package. `docs/testing.md` describes it.

The file is `spawn-helper` on macOS and `conpty.node` on Windows. The vehicle
on Windows is the packaged directory, `out/Stuffbucket-win32-x64`, rather than
an installed tree, because the MSI is gone. The command differs too: `cmd.exe`
has no `printf`, so the two halves of the token are joined by the caret
`cmd.exe` strips while parsing the line.

## The four install paths


A consumer installs this package one of four ways, and npm runs a different
lifecycle script for each. `npm pack` and a registry publish run `prepack`. A
git dependency runs `prepare`. An `https://` source archive runs neither. A
registry install runs none of them and needs none: the archive it serves was
built by `prepack` at publish time, which is what makes the registry the
supported path. `stuffbucket/maximal` pins the git form today:

```
"@stuffbucket/maximal-electron": "github:stuffbucket/maximal-electron#<ref>"
```

`v0.0.2` shipped with the build in `prepack` alone. Installing that tag by git
ref produces a package holding the licence, the readme, and the manifest, and
no `dist/` at all. Nothing here noticed, because `verify:exports` runs
`npm pack` and walks the other path.

`npm run verify:git-install` walks the git path. It installs this package into
a scratch directory, resolves every entry in `exports` from inside that
directory, and asserts each target is a file that exists. Resolution alone is
not enough: `import.meta.resolve` answers from the manifest and never touches
the disk, so every specifier of the broken `v0.0.2` "resolved". It then checks
the installed renderer entry against the approved component surface and walks
its import graph, which is the same pair of questions `verify:exports` asks of
the local build; `scripts/export-checks.mjs` holds both, so the two paths share
one definition of what an export has to satisfy.

It runs in three places, because the ref it installs is the whole point:

| Where | Ref |
| --- | --- |
| Locally, with no arguments | `git+file:` onto this checkout at `HEAD`, so it needs no network and no push |
| `ci.yml`, the `git-install` job | The pushed head of the branch under review, as `github:owner/name#sha` |
| `release.yml`, in `package-tarball` | The commit being released, beside the tarball that is about to be attached |

The local default is what makes it runnable before cutting. The CI job is what
makes a regression fail before it lands rather than after a consumer installs
it.

### The archive path, which cannot be made to work

The unsupported form is a `codeload.github.com/.../tar.gz/<sha>` URL, which npm takes
for a packed tarball. It is the repository tree, and `dist/` is not in the
tree, so the install produces a package whose exports name files that are not
there — with exit 0. `stuffbucket/maximal` pinned one, and it worked only
because that commit predates #70 and still carried a committed `dist/`.

No lifecycle script can build it, so the answer is to refuse it.
`scripts/check-install.mjs` runs at `postinstall`, which npm does run for every
install form, and exits 1 when an export names a file the install does not
carry. The same `verify:git-install` run archives the ref under review with
`git archive` — what codeload serves — installs that archive, and asserts the
failure carries that refusal. "npm exited non-zero" alone would pass on a
network error, so the refusal text is the assertion. Issue #100, and
`docs/consuming.md` is the consumer-facing version.

### The fixture that installs nothing, and is still a consumer

`e2e/fixtures/demo-shell/` is the shell the recordings and the README stills
are cut from, and `docs/recording.md` calls it the first consumer of the
renderer package. It is a consumer only while its imports resolve through the
`exports` map. Every import in it read `../../../src/` instead, which resolves
through nothing a third party has, so the fixture proved less than it claimed
and looked identical either way. Eight names the fixture needed were missing
from the exports map, and nothing said so.

`npm run verify:fixture-imports` reads every source file under the fixture,
denies a specifier that reaches outside it, and denies one that names a subpath
the manifest does not export. It prints the files it declined beside the ones it
read, because a scan that narrows its input and does not say what it dropped
reads as coverage it does not have.

It runs in the `static` job of `ci.yml`, before `pnpm test` and `pnpm run mutate`
rather than beside `verify:exports` at the end. The two ask the same question
from opposite sides, so the reading order argues for pairing them. The cost
argues louder: this one reads the checkout and nothing else — no install step
it depends on, no build, no `dist/`, no Electron binary — so it answers in a
second, and the minutes after it are minutes not spent on a tree that already
fails.

## The release rehearsal, and the retry

`release.yml` runs on a tag push and on a dispatch. What a run may do is one
expression, and both halves are required:

```
github.ref_type == 'tag' && (github.event_name == 'push' || inputs.publish == true)
```

A dispatch against a branch fails the first half whatever input it passes, so
no input makes a branch publishable. A dispatch against a tag with `publish`
left at its default fails the second, and rehearses. Run it from the Actions
tab against any branch.

A rehearsal does everything a tag does, except attach and publish:

- `tag-check` takes the tag from `package.json` rather than the ref, and still
  checks the format.
- `package-tarball` runs `npm run verify:exports`, packs, and installs the
  commit by git ref.
- `publish-package` runs `npm run verify:publish` against the packed archive,
  then `scripts/publish-package.mjs --mode rehearse`, which is
  `npm publish --dry-run` with an invalid token. Nothing is uploaded.
- `publish` does not run at all.

`dry-run-artifacts` is what stops a rehearsal being green for nothing. Every
attach step is skipped, so the run would otherwise end without producing
anything and still pass. That job downloads the tarball by name and asserts
exactly one arrived and is non-empty.

It survived the removal of the installers rather than going with them. The
tarball is now the only artifact, which makes it look redundant with
`if-no-files-found: error` on the upload, and it is not. That setting proves a
file existed in the producing job's working directory. It says nothing about
whether the name resolves on the download side, which is the failure #81 was,
nor about whether the file that crossed the boundary has any bytes in it.

`DRY_RUN` is the shell-visible form of the same expression, negated, used
inside `tag-check`. Job and step conditions spell the expression out, because
the `env` context is not available to a job-level condition, and
`tests/workflows.test.ts` pins the two to the same string.

### Why a dispatch can publish at all

It could not, until #162. The rule was "a dispatch run is always a dry run",
and it held because no input existed to make one publish.

That made a tag push a one-shot fuse. A tag is immutable, so a run that does
not complete spends the version, and the remedy was to bump the patch and cut
again. On 2026-07-29 an Actions outage held `tag-check` in the queue from
18:47:28 and cancelled it at 19:02:30 with no runner ever assigned; every
downstream job was skipped. `stuffbucket/maximal-core` lost `v0.4.4` in the
same hour, on the same fifteen-minute queue timeout: the tag is correct, and
nothing was built or published against it. Neither repository had done anything
wrong, and both had to burn a version.

So the tag is a pointer, and publishing is an operation invoked against it:

```
gh workflow run release.yml --ref v0.0.5 -f publish=true
```

Every job is re-runnable against a tag that already exists. `release` reuses a
draft it finds. `package-tarball` attaches under `--clobber` while the release
is a draft, reports `ALREADY ATTACHED` when the asset is already on a published
release, and fails only in the state no retry can repair — published, and
missing the asset, which is the HTTP 422 case. `publish` reads `isDraft` before
flipping it. `publish-package` reports `ALREADY PUBLISHED` rather than a 409.

`verify:tag` does not stand in the way. It refuses a ref whose earlier runs
built a **different** commit, and every retry of a tag builds the same one.

The workflow that runs is the one at the dispatched ref, so this reaches a tag
only if the tag carries it. `v0.0.5` is the first that will.

### The rail that replaced the old one

The old rule was a comment. What replaces it is three things that run:

- `tests/workflows.test.ts` compares the exact expression, not a substring, on
  every step that creates, moves, or publishes anything. `github.ref_type ==
  'tag'` alone would satisfy a `contains` test while letting any dispatch of a
  tag publish.
- `scripts/publish-decision.mjs` refuses `--mode publish` on a non-tag ref
  independently of the workflow file, and `tests/publish-decision.test.ts`
  walks a table of ref shapes over it. The rail is executable, not only
  readable.
- `--ref-type` comes from `GITHUB_REF_TYPE`, which the runner sets and a
  workflow input cannot reach.

`npm publish` appears in no workflow. Every registry call goes through
`scripts/publish-package.mjs`, and a test asserts that, because a step that
spelled the command out would carry none of the above.

### Idempotency, and the `nothing to check` rule applied to a publish

`scripts/publish-package.mjs` asks the registry what it holds before it uploads
anything, and prints one line naming the outcome:

```
PUBLISHED          @stuffbucket/maximal-electron@0.0.5 at …: this run uploaded it.
ALREADY PUBLISHED  @stuffbucket/maximal-electron@0.0.5 at …: this run uploaded nothing.
```

Both are exit 0, and a reader can tell them apart. An operation that did
nothing must not read like one that did something, which is the rule the scoped
checks apply to an empty set, one level up.

`npm view` reports three things and two of them look alike. A version that is
present prints itself. A version absent from a package that exists prints
nothing and still exits 0. A package that does not exist at all exits non-zero
with `E404`. Anything else — a 401, a proxy — is unreadable, and an unreadable
probe must not read as absent: that is the difference between "upload this" and
"we could not tell". An unreadable probe still attempts the upload, and a 409
from that attempt is reported as `ALREADY PUBLISHED`, because the probe and the
upload are two calls and the registry can change between them.


## The tag gate, and the setting it cannot replace

`tag-check` runs `npm run verify:tag` after it matches the tag against
`package.json`. That refuses a tag that is not above every tag that exists, and
refuses a ref that has already been built at another commit — the second is
what `v0.0.2` was, and the workflow runs on a tag ref survive the tag being
deleted, which is what makes them readable at all.

It runs before a tag as well as on one. With no `--sha` it takes the version
from `package.json`, checks the ordering, and says that the run history was not
read, which is the rule at the top of this page applied to itself.

What it cannot do is stop the tag moving in the first place. That needs a
repository ruleset with a `tag` target, which no pull request can create and
which does not exist. Creating it is an owner action in repository settings,
and nothing in this repository checks that it stays: a required check no pull
request can turn green is a merge freeze, not a gate, and the repository
settings are deliberately not mirrored here.

## Whether the workflows themselves still run

`triage.yml` fired on every issue event and failed on every one of its 88 runs.
`watch-rulesets.yml` had never run once. Two workflows broken in opposite
directions, and neither was noticed for months, because a workflow that gates
nothing is red only in the Actions tab and nobody opens the Actions tab. Issue
#153.

`triage.yml` is gone. It called a reusable workflow in `stuffbucket/repoman`,
which is private and owned by a user account rather than an organization, and
Actions can only share a private reusable workflow within an organization. So
the call could not resolve and the run died before it created a job — which is
why all 88 failures carry no log. No setting on either repository would have
fixed it.

`npm run verify:workflow-health` is the general answer. It discovers the
workflow list from `.github/workflows/` — never from a constant, because a
hand-list is how a new workflow escapes and three escaped one in a single day —
reads each one's recent runs from the Actions API, and asserts two things per
workflow: that GitHub holds runs of it, and that its recent runs are not
uniformly failing.

### What "recently" means, and when it means nothing

A rule that flags `release.yml` every quiet week is a rule somebody deletes, so
the window comes out of the workflow's own triggers rather than out of a table.

| Trigger | Window | Why |
| --- | --- | --- |
| `schedule` | twice the cron interval | GitHub delays a scheduled run under load, so one missed interval is not evidence and two is |
| `push`, `pull_request`, `merge_group`, `issues` and the rest of repository activity | a fortnight | These fire here several times a day. A fortnight of silence means the trigger stopped matching |
| A tag push, a dispatch, or a call from another repository | none | There is no cadence to be late against |

The third row is the point. `release.yml` runs on `v*.*.*` and on a dispatch,
and a month with no release is a month with no release. The check **declines**
the recency assertion there rather than passing it, and prints how many it
declined. `verify:docs` reported a true count of what it examined while saying
nothing about what it dropped (#152); an answer nobody computed must not read
as one that was.

The same applies to the failure rate. Fewer than three conclusive runs supports
no verdict — one red run is a flake — so the check says so and counts it.
Uniform failure means zero successes, not a percentage: `ci.yml`,
`release.yml` and `merge-preview.yml` all mix red and green today, and a
threshold tight enough to catch a bad week would be red on all three.

### The states, which are four and not two

Exit 0 healthy, 1 a finding, 2 the check could not run, 3 unverified. A
workflow with no runs is `never-run`, not a failure rate of zero: it has been
observed neither to work nor to break, and the reader's next move differs. When
GitHub has no record of the file at all — which is what a 404 on the runs
endpoint means — the finding says so, because that is the whole diagnosis for
`watch-rulesets.yml`. **GitHub registers a workflow from the default branch**,
so a file that lives only on a release branch is unreachable by `schedule` and
by `workflow_dispatch` until the release folds into `main`.

### Where it runs, and what it gates

Nothing about run history gates a pull request. A pull request cannot fix a
hundred-percent failure rate in a workflow it does not touch, and a workflow a
pull request adds has no runs at all until it merges, so a required check here
would be a merge freeze whose only remedy is deleting the check. That is #139's
rule: gate what a pull request can enforce, report what it cannot.

The objection to that is the one this page opened with — a non-gating check is
exactly what nobody looked at for seventy-five runs. The answer is that the
output is not a red tick in a tab. `workflow-health.yml` files **one issue**,
refreshes it while the gap persists, and closes it on the next clean run, the
way `watch-rulesets.yml` already does. Seventy-five red runs produced no
issues.

The half a pull request does own is gated, and fails everywhere including on a
pull request: exit 2, which is the check itself being blind. Its rules stopped
detecting a dead workflow, or the directory scan found no workflows, or the API
answered nothing. A watcher that cannot see is the defect this exists to end,
so it is not allowed to be quiet about itself.

It runs on `pull_request` as well as daily, with no `paths` filter. That is not
only for coverage: a schedule fires only from the default branch, so a workflow
added on a release branch cannot run until the release folds — which is the
`watch-rulesets.yml` defect exactly. The pull request trigger fires where the
file actually lives, so the job had run before it merged. Shipping an unrun job
to solve the unrun-job problem would be its own joke.

**What it does not close.** A watcher cannot report its own silence. If
`workflow-health.yml` is deleted or disabled, nothing files the issue saying
so. The `pull_request` trigger narrows the hole — the job runs on every pull
request, so a break is visible within one — and does not shut it.

## The merge race

`ci.yml` runs on a pull request head merged with the base **as it was when that
run started**. Once the base moves, the green check on the pull request is a
statement about a state that no longer exists.

That is how `main` acquired a failing test. One pull request added a check that
reads every stylesheet, another added a stylesheet three seconds later, and
each was green against a `main` that did not contain the other.

`merge-preview.yml` closes the general case. After a push to `main` or a
release branch it lists every open pull request targeting that branch, checks
out the head, merges the new tip, runs lint, types, and the unit tests, and
reports the result as a `merge-preview` commit status on the pull request head.
It blocks nothing. It puts the answer where the merge decision is made.

What it costs: one runner per open pull request per push, for the fast half of
`ci.yml`. Packaging and the end-to-end suite are left out.

What it does not close: a race shorter than the run. Two merges 180 seconds
apart is exactly that case, and only a queue serialises it.

### The neutrality guard

`npm run verify:neutral` runs in the `static` job and answers whether this
shell knows anything about the application it hosts. Issue #16 asks for it, and
a named consumer waits on it.

Two checks, because two things go wrong.

`scripts/neutrality.mjs` parses every TypeScript source under `src` with the
compiler API and denies a specifier that reaches `maximal`,
`maximal-core`, or `@stuffbucket/maximal-core`. A parse rather than a grep,
because `require.resolve`, `createRequire(import.meta.url)('…')`, an aliased
`createRequire`, `import.meta.resolve`, and a type-position `import('…')` each
launder an import past a text search. A specifier the parse cannot read — one
built from a variable — fails too, because that is the one shape it cannot
judge.

The second check scans for the terms in `FORBIDDEN_TERMS`, which defaults to
`maximal`, `maximal-core`, and `copilot`. The boundary treats `_` and `-` as
separators, so `MAXIMAL_BASE` matches where `\b` would not.

**The scope is decided, not inherited.** Every file under `src`, plus
`README.md`, which is the only prose npm puts in the tarball. `docs/` is out:
it is this repository's own record, written throughout by comparison with the
repository this one was extracted from, and no consumer installs it. The guard
asserts that boundary rather than assuming it, so a manifest that starts
packing documentation fails.

One exemption, stated once: a term inside a `stuffbucket/…` slug names a
repository rather than depends on one, and this repository is called
`maximal-electron`. An npm scope is not a slug, so `@stuffbucket/maximal-core`
in a string is still reported.

Two files carry a narrow exemption with the reason inline, both waiting on
issue #22. Each exemption is checked three ways: the file must exist, it must
still contain a match, and it must be absent from the export graph. A fixed
file therefore cannot keep its exemption, and no exemption can ever cover a
file a consumer installs.

Every part of this has a floor, because a scan of nothing reports a clean tree.
The run parses a built-in fixture of all ten laundering forms and stops before
touching the tree if it does not catch every one.

## The two settings, and why neither is enabled

Both change how merging behaves for everyone, so both are the repository
owner's call. Neither is enabled. `ci.yml` carries the `merge_group` trigger so
that enabling the first is a settings change and not a code change.

**A merge queue on `main` and each `release/**` branch.** GitHub builds the
prospective merge result, runs `ci.yml` against it, and merges only if it
passes. This closes the race completely, including the 180 second one.

The cost: no pull request merges directly any more. Every merge enters a queue
and waits for a full `ci.yml` run against the queued state, which is the
package and end-to-end matrix on macOS and Windows. That turns a merge from an
immediate action into a wait of several minutes, and a queue entry that fails
is ejected and has to be re-queued. With three agents working in separate
worktrees, which is the normal case here, throughput is the queue's rate rather
than the number of agents.

**Branch protection with "require branches to be up to date before merging".**
Cheaper to run and it also closes the race, by refusing a merge whose head does
not contain the base tip.

The cost: it serialises merges by hand. Every pull request must be updated
after every other merge lands, and each update re-runs `ci.yml` on the pull
request. With three concurrent pull requests, landing the first invalidates the
other two, so the same work happens as with a queue but a person or an agent
drives it. It also requires the full branch protection ruleset, which forces
decisions about who may push to `main` that are not otherwise on the table.

The recommendation is to leave both off and keep `merge-preview.yml`, until the
same failure happens twice more or the merge rate rises enough that a queue
pays for itself.

## The workflow files are tested

`tests/workflows.test.ts` parses every file in `.github/workflows` and asserts
what a compiler would if YAML went through one:

- Every artifact a job downloads by name is uploaded by name in the same
  workflow. This is how the tarball reaches `dry-run-artifacts`, and a rename
  on one side would otherwise leave a download that finds nothing.
- Every `npm pack --pack-destination` step creates the directory first.
- `publish` needs `package-tarball` and nothing else. See `docs/release.md` for
  why that is deliberate.
- Every step in `release.yml` that creates, uploads to, or edits a release
  carries the whole rail, compared as a string rather than by substring.
- The rail names a tag ref, and the `publish` input is a boolean that defaults
  to false. Both halves, asserted separately.
- `DRY_RUN` is that rail negated, so the shell-visible form and the conditions
  cannot disagree.
- No workflow calls `npm publish`. Every registry call goes through
  `scripts/publish-package.mjs`, and each invocation states its mode and
  carries the rail that mode requires. A release can be redone. A version in a
  registry cannot.
- `publish-package` asks for `packages: write`, and a run that is not
  publishing rehearses instead.
- Every `needs` names a job that exists.

Each rule also asserts that it found something to check, because a rule that
matches nothing passes.

There is no YAML linter in CI. `actionlint` catches more than these rules do,
including a broken expression, and it is worth running locally.

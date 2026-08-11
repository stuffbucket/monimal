# Repository settings

Two protections this repository depends on live in GitHub's settings, not in
this tree. No pull request can create one, and no pull request would notice one
being deleted. This page is what each one is for, what the owner has to do, and
what the checks here can and cannot see.

`scripts/rulesets.mjs` holds the machine-readable form of everything below.
When a decision here changes, change it there in the same pull request.

## The gap that is open now

There is no ruleset with a `tag` target. `git push --delete origin v0.0.5`
succeeds today, and so does a force update. `npm run verify:rulesets` reports
that, and has reported it since it was written.

It already cost something. `v0.0.2` was cut at `e983b74`, the release run
failed, #80 fixed it, and the tag was deleted and re-pushed onto `441df8a`
eight minutes later. Two release runs sit on the ref `v0.0.2` at two different
commits. The release was still a draft, so nothing published moved and the cost
was nil. The next one is not free: `stuffbucket/maximal` installs this package
as `github:stuffbucket/maximal-electron#<ref>`, and a lockfile records the
commit the tag resolved to. A moved tag changes what a consumer installs
without changing anything the consumer can see.

### What the owner has to do

One ruleset. It cannot be created from a pull request, and no credential that
could create it belongs in this repository.

Through the UI, at
[Settings → Rules → Rulesets](https://github.com/stuffbucket/maximal-electron/settings/rules):

1. **New ruleset → New tag ruleset.**
2. Name it `tags-immutable`. The check matches on that name.
3. Enforcement status: **Active**. Not "Evaluate": a ruleset in evaluate mode
   records what it would have blocked and blocks nothing.
4. Target tags → **Add target → Include by pattern**, pattern `v*`.
5. Bypass list: **leave it empty**. A history protection with an exemption is
   not a history protection, and nothing here needs to move a tag.
6. Rules: tick **Restrict deletions** and **Block force pushes**.
7. Create.

The same thing through the API, from a machine already logged in with `gh`:

```bash
gh api --method POST repos/stuffbucket/maximal-electron/rulesets \
  --input - <<'JSON'
{
  "name": "tags-immutable",
  "target": "tag",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": { "ref_name": { "include": ["refs/tags/v*"], "exclude": [] } },
  "rules": [{ "type": "deletion" }, { "type": "non_fast_forward" }]
}
JSON
```

Then run `npm run verify:rulesets`. It exits 0 and prints `PROTECTED` for all
three rulesets when the token can read the bypass lists, and exits 3 printing
`UNVERIFIED` when it cannot. See the three states below.

## What is enforced today

| Ruleset | Target | Rules | What breaks without it |
| --- | --- | --- | --- |
| `main-no-force-delete` | branch, `~DEFAULT_BRANCH` | `deletion`, `non_fast_forward` | `main` can be deleted or force-pushed, and the history a released tag points into can be rewritten under consumers who already resolved it |
| `main-require-pr` | branch, `~DEFAULT_BRANCH` | `pull_request` | Every gate in `ci.yml` is advisory again: a red pull request, or no pull request at all, can land on `main` |
| `tags-immutable` | tag, `v*` | `deletion`, `non_fast_forward` | **Not created.** A published tag can be deleted or moved |

### Deliberately not asserted

Each of these would be a tightening, and a floor that demands one turns a
legitimate settings decision into a red run. They are recorded here so that the
absence is a decision rather than an oversight.

- **`required_status_checks` on `main`.** No ruleset requires a check today, so
  `ci.yml` blocks nothing by itself. Adding it means choosing which contexts
  are required, which is a separate decision with its own cost.
- **`release/**` branches.** Both branch rulesets are scoped to the default
  branch. A release train accumulates merges for days and is force-pushable.
- **`allowed_merge_methods`.** `main-require-pr` permits merge, squash and
  rebase. Nothing here derives anything from the commit subject, so no gate
  depends on the choice.
- **Review counts.** `required_approving_review_count` is 0. Raising it is a
  tightening; pinning it here would fail on the day someone does.

## The check, and the three states it reports

`npm run verify:rulesets` compares the live rulesets to `EXPECTED` in
`scripts/rulesets.mjs`. Every assertion is a floor: a weakening fails, a
tightening passes. Bare existence is worthless, because a ruleset can be
present and gutted — enforcement flipped to evaluate, every rule removed. A
byte-exact snapshot is worse, because it reddens on every legitimate change and
a check that cries wolf gets deleted.

It reports one of three states per ruleset, and never merges two of them:

| State | Meaning | Exit |
| --- | --- | --- |
| `PROTECTED` | Every assertion was computed and every one holds | 0 |
| `UNPROTECTED` | A protection is missing or weaker than the floor | 1 |
| `UNVERIFIED` | Nothing was found weakened, and an assertion could not be computed at all | 3 |

A fourth exit, 2, means the rulesets could not be read at all, or that the check
itself went blind. Silence has to be earned rather than defaulted to, so an
unreadable run files an issue rather than passing.

Four codes rather than pass and fail, because three of these are not "fine" and
only one of them is a defect. A caller that treats 0 as verified is then
correct, which it would not be if `UNVERIFIED` also exited 0.

### The assertion that is usually unverifiable

`bypass_actors` is returned only to a caller that can read repository
administration. Measured on this repository: an unauthenticated read of
`/repos/stuffbucket/maximal-electron/rulesets/20486838` answers 200 with the
rules and conditions intact and the `bypass_actors` key absent entirely. A
workflow `GITHUB_TOKEN` cannot be granted administration — there is no such key
in a workflow's `permissions:` block.

So its absence is reported as unverified and never as a finding. An answer
nobody could compute must not render as one that was.

It is verifiable in exactly one place: a developer's machine. The check reads
`RULESET_TOKEN`, then `GH_TOKEN`, then `GITHUB_TOKEN`, and failing all three
the token `gh auth login` already holds. No credential is added to this
repository, and none should be: the scheduled run can never see this, and an
alert that fires every day is an alert nobody reads.

### Where it runs, and why it does not gate a merge

`watch-rulesets.yml` runs it daily and files one issue titled *A repository
ruleset is below the floor*, refreshing that issue while the gap persists and
closing it on the next clean run.

It is not a required check, and that is the argument this whole page turns on.
The `tags-immutable` assertion is red until the owner creates the ruleset. A
required check that no pull request can turn green is not a gate; it is a merge
freeze whose only available remedy is deleting the check, which is the failure
`.claude/skills/write-a-check/SKILL.md` exists to prevent, one level up.

So the split is: **gate what a pull request can enforce, report what it
cannot.** The half a pull request can enforce is `npm run verify:tag`, and that
one blocks.

## The tag gate, which is blocking

`npm run verify:tag` runs in `tag-check` in `release.yml`, before the rest of
the pipeline spends a minute. It refuses a tag that has already been cut, or
that is not above every tag that exists.

The record it reads is the workflow runs on the tag ref. A tag deletion erases
the ref and nothing else, so the runs survive it — `refs/tags/v0.0.2` still
lists both, at `e983b74` and `441df8a`. That is the one fact a re-cut cannot
hide from, and asking whether the tag exists would not have caught the incident
at all, because the tag was deleted first.

Two rules:

- **This ref has never been built at another commit.** Any earlier run on the
  ref with a different head commit means the tag moved.
- **The tag is above every tag that exists.** A version is cut once and only
  forwards.

Both stay quiet for a re-run of a failed job on the same tag at the same
commit, which is routine and legitimate.

On a dispatch run there is no tag, so only the ordering is checked, the run
history is reported as not evaluated rather than as clean, and the conclusion
says so. A release branch sits at the shipped version until the bump, so a dry
run finding its own tag is the normal state; it is reported as a note and not a
failure, because a dry run cuts nothing.

This gate does not replace the ruleset. It refuses to *build* a moved tag. Only
the ruleset refuses to *move* one, and the moved `v0.0.2` was already on the
remote for eight minutes before any job read it.

## Both checks fail when they have nothing to check

Each reports every assertion through `scripts/check-scope.mjs`, which prints the
size of the set beside the message and fails on zero whatever the assertion
said. So a run that reads no rulesets fails three assertions with
`nothing to check: 0 live rulesets` rather than passing on the logic, and an
emptied `EXPECTED` fails the one assertion that remains.

Both also run a control they must fail, before any I/O. `verify:rulesets`
evaluates `EXPECTED` against a gutted copy of every ruleset it expects — right
name, wrong enforcement, wrong target, no rules, a bypass actor — and stops if
any comes back clean. `verify:tag` replays the `v0.0.2` incident and a backwards
cut, and stops if either goes undetected.

`verify:tag`'s floors on scope are positive controls rather than count
thresholds, because a legitimate zero exists: a first release has no other tag.
A tag push, however, always has its own tag and its own workflow run, so their
absence means a list was not read. On a dry run the run history cannot be read
at all, so that assertion is not registered and the output says the history was
not evaluated. An assertion nobody could compute must not be recorded as one
that passed.

See [`.claude/skills/write-a-check/SKILL.md`](../../.claude/skills/write-a-check/SKILL.md)
for why every one of those sentences is there.

## Neither module is mutated yet

`scripts/rulesets.mjs` and `scripts/tag-history.mjs` are on the `DEFERRED` map
in `scripts/mutation-scope.mjs`, against #125, with every other check module in
`scripts/`. Their surviving mutants are almost all `StringLiteral` over the
prose an operator reads, and moving a file off that map means getting it to 100
first. `docs/testing.md` holds the rule.

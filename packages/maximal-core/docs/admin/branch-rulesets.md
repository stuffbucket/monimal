# Branch rulesets on `main`

What `main` enforces and why each piece is there. Live state is authoritative —
this file describes the policy; `bun run rules:check` reads the repository.

```sh
bun run rules:check            # verify the live rulesets against the recorded floor
gh api repos/stuffbucket/maximal-core/rulesets   # the raw truth
```

## What is enforced

Two repository rulesets, both `active`, both targeting `~DEFAULT_BRANCH`.

### `main-require-pr`

| Rule | Setting | Why |
|---|---|---|
| `pull_request` | 0 approvals, no code-owner review, **squash only** | Nothing reaches `main` except through a PR. Squash-only because the PR *title* is the squash subject; a merge commit's subject is not the title. |
| `required_status_checks` | `test`, `windows` | The two merge-blocking checks. Both jobs live in `ci.yml`. |
| | `strict_required_status_checks_policy: true` | The branch must be **up to date with `main`** before it can merge. |
| | `do_not_enforce_on_create: true` | Creating a branch is not a merge; this keeps branch creation from needing checks that have not run yet. |

**A required check names a workflow JOB ID, not a workflow.** Rename the `test`
job in `ci.yml` and the required `test` check never reports — GitHub then blocks
every PR forever with nothing red to point at. `check-rulesets.test.ts` holds a
parity test over that mapping, and it runs on every PR (`test:ops`), so a rename
fails there first.

**Two workflows must not share a job name, and two do.** The match is by name,
so `tooling-ci.yml`'s `test` job reports into the same required `test` context
as `ci.yml`'s, and the last run to complete is the one the merge button reads —
a green run of the wrong workflow can stand in for a red run of the right one.
`tooling-ci.yml` is path-filtered to `scripts/ops/**` and `package.json`, so it
only materialises on a PR touching those. It is left as-is rather than renamed
because that job is the only thing making `typecheck:ops` blocking, and adding a
new context to the ruleset is a settings change no PR can make: **if you rename
it, add the new name to `main-require-pr` in the same change.** The collision is
recorded in `KNOWN_CONTEXT_COLLISIONS` and a *second* one fails the parity test.

**Why strict-update rather than a Merge Queue.** GitHub's Merge Queue is
unavailable on a user-owned repository. Requiring the branch to be up to date is
the substitute: only one PR can be simultaneously up-to-date and green, so PRs
serialise naturally and the classic "both green, merged broken" cannot happen.
The cost is that every PR behind another needs a rebase — `gh pr update-branch`,
or the *Update branch* button. This is repoman's ADR-0007, adopted here without
its other half: `app-repoman` auto-rebases queued PRs in the repos it manages,
and it does not manage this one, so the rebase is yours to run.

`ci.yml` still carries a `merge_group:` trigger. It is inert while no queue
exists and correct if one is ever enabled.

### `main-protect-history`

`deletion` and `non_fast_forward`, with **no bypass actors at all** — the branch
cannot be deleted or force-pushed by anyone, including an admin. Nothing needs
to: all changes land through merged PRs.

## There is no bypass

**Both rulesets are expected to carry `bypass_actors: []`.** Nothing reaches
`main` outside a pull request.

Removing the bypass is therefore a **strengthening**. Under the direct-push flow
some commits reached `main` with no `test` or `windows` run against them.

So: **a bypass actor reappearing on `main-require-pr` is drift.** `bun run
rules:check` reports one as a finding, with the reason — but only when it can
see the key at all, see *What this cannot verify*.

## Verifying it

`scripts/ops/check-rulesets.ts` holds the expectation as a typed constant and
compares it to the live API. Same argument as `scripts/check-deps.ts` for why
the record lives in the gate rather than in a JSON sibling: an external
expectation file is one more thing that can drift from what it describes.

Every assertion is a **floor** — a weakening fails, a tightening passes. It
asserts existence, `active` enforcement, the target branch, each rule type, each
of the required contexts (as a *subset*, so an added required check is fine),
the strict-update policy, squash-only merges, and that neither ruleset
has a bypass actor. It deliberately does **not** assert ruleset ids, timestamps,
or review counts: pinning those turns every legitimate settings change into a
red build, and a check that cries wolf gets deleted.

It runs from `watch-branch-rules.yml`, daily. It needs the network and it cannot
sit in `check:deep`, which must work offline. On drift it files or refreshes one
idempotent `ruleset-drift`-labelled issue and closes it on the next clean run —
the same shape as `watch-external-drift.yml`, and for the same reason: a
scheduled job that fails a build teaches people to ignore a red X on a branch
they did not touch.

The **offline** half runs on every PR: `check-rulesets.test.ts` (via `test:ops`)
proves each required context is a real job id in a workflow that fires on
`pull_request`.

## What this cannot verify

- **`bypass_actors`, on most runs.** GitHub returns that key only to a caller
  that can read repository administration. Measured: an unauthenticated read of
  this public repo returns 200 with rules and conditions intact and the key
  *absent entirely*; and a workflow `GITHUB_TOKEN` cannot be granted
  administration at all — there is no such key in a workflow `permissions:`
  block. The check therefore reports an absent key as **unverified**, never as a
  finding, and does not escalate it: an alert that can never clear is an alert
  nobody reads. It is verified when a human runs `bun run rules:check` locally:
  the token comes from `RULESET_WATCH_TOKEN`, `GH_TOKEN` or `GITHUB_TOKEN`, and
  failing all three from `gh auth token`, because a `gh auth login` session keeps
  its token in the CLI's own config and exports nothing to the environment — so
  without that last fallback the local run, the only run that can see this at
  all, silently reports it unverified. A scheduled run can also see it if a
  `RULESET_WATCH_TOKEN` secret is set (none is configured today). A bypass actor
  added back would let somebody push to `main` unnoticed. Run
  `bun run rules:check` locally when the
  ruleset changes.
- **A private repository.** The ruleset endpoints return 403 on a private repo
  without GitHub Pro. The rulesets keep applying; the check just stops being
  able to read them. That is exit 2 — "nobody can currently tell" — and it files
  an issue rather than passing, because silence has to be earned.
- **Rulesets other than the two named**, and settings outside rulesets
  (repository merge-method toggles, Actions permissions, secrets).
- **Whether anyone acts on the issue.** Detection is where this stops, by
  design, exactly like the external-drift watcher.

## See also

- [`scripts/ops/check-rulesets.ts`](../../scripts/ops/check-rulesets.ts) — the
  expectation, and the argument for every line drawn above
- [`docs/admin/external-drift-watch.md`](external-drift-watch.md) — the watcher
  shape this one copies

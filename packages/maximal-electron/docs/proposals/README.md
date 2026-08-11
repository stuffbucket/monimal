# Proposals

Research lands here. A proposal argues for names that do not exist yet, which is
why `scripts/verify-docs.mjs` exempts this directory: running a name check over
an argument for something unbuilt produces failures that say only "this has not
been built".

That exemption has a price, and this file pays it. A proposal is checked by
nothing, so it has to be reachable by a reader instead. `docs/roadmap.md` links
here, and `.claude/skills/write-a-check/SKILL.md` links to the review below.
Those two links are what stops this directory going quiet again.

## The rule

A proposal exists to produce tracked work. Two things follow.

**File the issues before opening the pull request, and name them in the
document.** The two proposals that paid for themselves did exactly that. The
five that did not each ended in a recommendation addressed to nobody, and
several buried a real finding in a section titled "what I could not verify".

**A proposal with no disposition after the next release is cut gets deleted.**
The argument survives in git history. Unreachable prose that nobody acted on
costs more attention than it returns.

## What is here

| Document | Backs | Read it when |
| --- | --- | --- |
| [`engineering-review-01.md`](engineering-review-01.md) | #51, #52, #53, and three checks in #54 | You are adding a check, or reading `.claude/skills/write-a-check/SKILL.md`, which cites this as the account of false-pass instances one to three |
| [`zed-themes.md`](zed-themes.md) | #42 | Anyone starts on Zed theme ingestion. The schema, the mapping table, and the two dead ends are already verified against live sources |

The second engineering review is not a document. It landed as #103, which
promoted the empty-scope rule into `AGENTS.md` and moved the detail into
`.claude/skills/write-a-check/SKILL.md`. A review that changes files does not
need a file of its own, and that is the shape to copy: review 01 is here only
because the skill that cites it needs somewhere to point.

## Disposition

First measured on 6 August 2026 after `v0.0.3` shipped, and resolved by #101 on
the `v0.0.5` train. "Produced" meant an issue or a pull request that names the
document, or that the document names as its own output. Citing an issue that
already existed did not count.

| Document | Lines | Resolved as |
| --- | --- | --- |
| `engineering-review-01.md` | 159 | **Kept.** It produced three issues and three checks, and the write-a-check skill cites it. Now linked, so `verify:docs` fails if it moves |
| `zed-themes.md` | 473 | **Kept.** It backs #42, which is open on `v0.0.6`. A proposal behind a live issue is not orphaned. Linked from #42 |
| `sibling-needs.md` | 219 | **Deleted.** Its central fact went false and its repin recommendation was a hazard, both already carrying a correction banner. The one surviving finding is #135; its reading of #17 is a comment there |
| `tests-off-the-desktop.md` | 265 | **Deleted.** Its recommendation shipped in #63, and `docs/testing.md` now carries the finding and the rejected infrastructure |
| `velocity-build.md` | 272 | **Deleted.** Two findings shipped as `STUFFBUCKET_SKIP_FIXTURE` and `verify:exports` in CI. The rest is #129 and #130 |
| `velocity-verification.md` | 264 | **Deleted.** Filed as #131 and #132; its work on #24 and #25 is a comment on each; its five rejections are in `docs/testing.md` |
| `electron-field-guide.md` | 410 | **Deleted.** Its top recommendation shipped as `.github/workflows/triage.yml`, four rows served issues since closed, and the remainder is #133 and #134. That workflow has since been removed in turn: it called a reusable workflow in a private user-owned repository, which Actions cannot resolve, so it failed on all 88 of its runs without ever creating a job. See #153 |

Nothing was deleted without its content going somewhere first. If a finding is
missing from an issue or a document, that is a defect in #101's resolution, not
a decision.

# Repoman Triage Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore reliable issue-open triage in all three public repositories and polling fallback for events GitHub suppresses.

**Architecture:** Keep a small self-contained event workflow in each public repository because public repositories cannot call the private repoman reusable workflow. Keep repoman's existing installation-driven poller unchanged; extend its GitHub App installation access instead of inventing a second allowlist.

**Tech Stack:** GitHub Actions, `gh` CLI, GitHub App installation.

## Global Constraints

- Use the active `stuffbucket` GitHub identity for outward actions.
- Local workflow changes and outward App/issue mutations are separate tasks.
- The local workflow receives only `issues: write`; do not add checkout, inherited secrets, App keys, or third-party actions.
- Do not make repoman public, create a workflow repository, change polling code, or edit `managed-repos.json` for triage coverage.
- Keep updates terse and report exact verification performed.

---

### Task 1: Replace broken triage calls in maximal and maximal-core

**Files:**
- Modify: `/Users/brian/github/stuffbucket/maximal/.github/workflows/triage.yml`
- Modify: `/Users/brian/github/stuffbucket/maximal-core/.github/workflows/triage.yml`

**Interfaces:**
- Consumes: GitHub `issues` events and repository `GITHUB_TOKEN`.
- Produces: Idempotent `needs-triage` labeling and one explanatory comment when neither routing label exists.

- [ ] **Step 1: Record the failing baseline**

For each repository, inspect one known failed triage run or run metadata and record that it fails before creating a job because the public repository references a private reusable workflow. Do not retry the broken workflow.

Expected baseline: the existing event path does not execute a triage job.

- [ ] **Step 2: Replace maximal's reusable call with a local job**

Retain `issues: [opened, reopened, edited]` and replace the job body in `maximal/.github/workflows/triage.yml` with:

```yaml
permissions:
  issues: write

jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - name: Apply triage label
        env:
          GH_TOKEN: ${{ github.token }}
          ISSUE_NUMBER: ${{ github.event.issue.number }}
        run: |
          set -euo pipefail
          routed="$(
            gh issue view "$ISSUE_NUMBER" \
              --repo "$GITHUB_REPOSITORY" \
              --json labels \
              --jq 'any(.labels[]; .name == "needs-bot" or .name == "needs-triage")'
          )"
          if [[ "$routed" != "true" ]]; then
            gh issue edit "$ISSUE_NUMBER" \
              --repo "$GITHUB_REPOSITORY" \
              --add-label "needs-triage"
            gh issue comment "$ISSUE_NUMBER" \
              --repo "$GITHUB_REPOSITORY" \
              --body 'Auto-tagged `needs-triage`. Add `needs-bot` to route this through repoman, or another label to indicate manual triage.'
          fi
```

Keep the existing workflow name and remove comments claiming delegation to private repoman.

- [ ] **Step 3: Apply the identical job to maximal-core**

Use the same trigger, permissions, job name, script, and comment in `maximal-core/.github/workflows/triage.yml`. Duplication is intentional: it avoids a fourth repository or public action for a small stable workflow.

- [ ] **Step 4: Validate both workflow files**

Run:

```bash
actionlint /Users/brian/github/stuffbucket/maximal/.github/workflows/triage.yml
actionlint /Users/brian/github/stuffbucket/maximal-core/.github/workflows/triage.yml
```

Expected: both pass with no output.

- [ ] **Step 5: Commit independently in each repository**

In `maximal`:

```bash
git add .github/workflows/triage.yml
git commit -m "fix(ci): restore issue triage events"
```

In `maximal-core`:

```bash
git add .github/workflows/triage.yml
git commit -m "fix(ci): restore issue triage events"
```

### Task 2: Add the same event path to maximal-electron

**Files:**
- Create or modify: `/Users/brian/github/stuffbucket/electron/.github/workflows/triage.yml`

**Interfaces:**
- Consumes and produces the same behavior as Task 1.

- [ ] **Step 1: Preserve current uncommitted Electron work**

Create an isolated worktree from the intended Electron base. Do not edit the dirty primary checkout or move its stashes/unpushed branches.

- [ ] **Step 2: Add the local workflow**

Create or replace `.github/workflows/triage.yml` with the same workflow name, `issues` trigger, `issues: write` permission, and local `gh` job from Task 1. Do not retain a reference to:

```yaml
uses: stuffbucket/repoman/.github/workflows/triage-reusable.yml@v1
```

- [ ] **Step 3: Validate the workflow**

Run:

```bash
actionlint /Users/brian/github/stuffbucket/electron/.github/workflows/triage.yml
```

Expected: no workflow syntax/schema errors. A shellcheck SC2016 info finding on the intentionally single-quoted Markdown comment body is accepted; changing it to double quotes would execute the backtick-delimited text.

- [ ] **Step 4: Commit the Electron change**

```bash
git add .github/workflows/triage.yml
git commit -m "fix(ci): restore issue triage events"
```

### Task 3: Restore polling prerequisites

**Files:**
- No local files.
- Outward actions: GitHub labels and GitHub App installation access.

**Interfaces:**
- Consumes: existing repoman scheduled/manual polling workflow.
- Produces: all three repositories visible to the poller with required routing labels.

- [ ] **Step 1: Confirm the outward-action scope**

Before mutation, report the exact actions:

```text
- create needs-triage and needs-bot labels in maximal-core if absent
- grant app-repoman installation access to maximal-core and maximal-electron
- retain existing maximal access
```

Do not alter App permissions beyond those already required for issue triage.

- [ ] **Step 2: Provision missing maximal-core labels**

Using the `stuffbucket` identity, create only absent labels:

```bash
gh label create needs-triage --repo stuffbucket/maximal-core --description "Awaiting triage" --color D4C5F9
gh label create needs-bot --repo stuffbucket/maximal-core --description "Route through repoman" --color 0E8A16
```

If a label already exists, leave its current description/color unchanged rather than forcing cosmetic drift.

- [ ] **Step 3: Expand GitHub App repository access**

In the existing `app-repoman` installation settings, add:

```text
stuffbucket/maximal-core
stuffbucket/maximal-electron
```

Keep `stuffbucket/maximal`. Do not add repository secrets or private keys to product repositories.

- [ ] **Step 4: Verify repository visibility without changing polling code**

Manually dispatch the existing repoman poll workflow and confirm its logs show all three repositories or corresponding backstop activity. Expected: the poller can inspect issues in maximal, maximal-core, and maximal-electron.

### Task 4: Verify event and polling paths end to end

**Files:**
- No local files.
- Outward actions: temporary GitHub issues created and closed for verification.

**Interfaces:**
- Produces: evidence that event triage is immediate/idempotent and polling recovers a missed event.

- [ ] **Step 1: Verify the event path in each repository**

For each repository, create one disposable issue without routing labels. Confirm:

```text
- exactly one successful triage workflow run
- needs-triage is applied
- exactly one explanatory comment is added
```

Edit the issue once. Confirm the rerun succeeds without adding another comment. Close the disposable issue.

- [ ] **Step 2: Verify polling fallback**

Reuse each disposable issue from Step 1 after its event-path check: remove `needs-triage`, leave it open, and confirm it has neither `needs-bot` nor `repoman:internal`. Label removal does not match this workflow's `opened`, `reopened`, or `edited` triggers. Manually dispatch repoman's poll workflow.

Expected:

```text
- needs-triage appears on all three issues
- the poller records backstop activity
- a second poll makes no further changes
```

The polling path is not required to add the event workflow's explanatory comment.

- [ ] **Step 3: Record evidence and remove fixtures**

Record workflow run URLs and issue URLs in the implementation PRs, then close all disposable issues. Do not leave test issues in the active queue.

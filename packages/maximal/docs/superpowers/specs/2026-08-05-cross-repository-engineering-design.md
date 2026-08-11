# Cross-Repository Engineering Operating Design

**Status:** Approved design; implementation not started  
**Date:** 2026-08-05  
**Repositories:** `stuffbucket/maximal`, `stuffbucket/maximal-core`, `stuffbucket/maximal-electron`

## Purpose

Turn three independently healthy but poorly coordinated repositories into one reliable delivery system without forcing them onto identical toolchains or creating a fourth repository prematurely.

The operating system must prevent three observed failure classes:

1. A producer is green while the assembled product is stale or incompatible.
2. A documented rule is not wired into authoring checks, CI, or repository governance.
3. Cross-repository work has no accountable owner, exact artifact, or closure condition.

## Decision

Use **enforced federation**.

- Each repository retains its implementation, toolchain, tests, and release model.
- `maximal-core` owns proxy, control-plane, and published export contracts.
- `maximal-electron` owns reusable shell, IPC, packaging, and desktop-security contracts.
- `maximal` owns product composition and required compatibility verification across exact producer artifacts.
- `maximal#417` remains the product-level integration epic.
- A GitHub Project may provide a cross-repository dependency view after project access is explicitly authorized.
- Do not create `maximal-engineering` until shared executable assets need independent versioning or no product repository is a legitimate owner.

## Why the alternatives were rejected

### Policy-first cleanup

Templates, agent rules, and cadence are useful but insufficient. The repositories already contain examples of stale generated artifacts, vacuous checks, untested merge states, advisory gates, and consumers pinned to old or raw producer revisions. More prose would preserve those false-green states.

### Central engineering repository now

A fourth repository would add another issue taxonomy, triage surface, milestone model, and place for state to drift. It would not repair broken repoman routing, missing compatibility checks, or unenforced repository gates.

Reconsider a central repository when at least one condition is true:

- Shared compatibility workflows or schemas require independent versioning.
- Multiple integration products consume the same producer set.
- No product repository can legitimately own the compatibility matrix.
- Organization-wide policy code or attestations require independent ownership.
- The dependency graph routinely spans four or more repositories and a Project can no longer express it.

## Work classification

Do not combine effort, scheduling, and blast radius in one label. Every issue uses two required axes.

### Compatibility

- **Internal:** no public or cross-repository seam changes.
- **Additive contract:** extends a seam while preserving supported consumers.
- **Breaking contract:** removes or changes a supported behavior, type, protocol, artifact, or security invariant.

### Urgency

- **Routine:** normal queue.
- **Release-blocking:** blocks a named release or train.
- **Security:** requires expedited handling and a human decision owner.

Estimated size is optional and never bypasses compatibility verification.

## Issue and dependency model

Use one issue of record in the repository that owns the changed seam. Create one linked adoption issue in each affected consumer.

The issue of record contains this structured contract:

1. **Producer artifact:** repository and exact tag, SHA, package, or digest.
2. **Affected consumers:** repository and accountable owner for each.
3. **Compatibility:** additive or breaking, including supported old/new combinations.
4. **Proof:** exact producer checks and real-consumer checks required.
5. **Rollout:** merge and release order, deadline, and blocking state.
6. **Rollback:** producer revert or consumer pin, with decision owner.

A producer unit test or synthetic downstream fixture is not real-consumer verification. Consumer issues must link back to the producer issue and cannot close without evidence against the exact candidate.

## Integration architecture

`maximal` is the integration repository because it assembles `maximal-core` and `maximal-electron` into the user-facing product.

Its required integration lane will verify:

- Frozen installation of the nested client.
- Client typecheck, tests, build, and package.
- The exact `maximal-core` package or binary candidate.
- The exact versioned `maximal-electron` package candidate.
- Sidecar startup and ready-line behavior.
- Public and control listener separation.
- Authentication and control protocol behavior, including current migration seams.
- Shutdown and occupied-port behavior.
- Packaged sidecar and shell contents on supported platforms.
- Security invariants inherited from the shell.

Contract-class producer changes must trigger or call a trusted consumer compatibility workflow. Evidence records producer SHA, consumer SHA, artifact digest, and check URL.

## Security priority: external URL boundary

The first implementation item closes a confirmed protocol-validation gap.

Current behavior permits a configured or compromised device-flow authority to return an arbitrary `verification_uri`; the maximal client forwards it through IPC to `shell.openExternal` without runtime scheme validation. The reusable Electron host also forwards popup and cross-origin navigation URLs without applying its existing safe-protocol predicate.

This is not classified as unauthenticated remote code execution. The highest-confidence path requires control of the configured device-flow response, local core, or renderer. It is nevertheless a renderer-to-main/OS boundary violation.

Required remediation:

- Validate the client IPC argument at the main-process sink; the device-flow channel permits `https:` only.
- Require HTTPS in device-code and auth-status runtime schemas as defense in depth.
- Apply the Electron repository's safe URL predicate to host and reference-window external-open sinks.
- Prevent unsafe cross-origin navigation without forwarding it to the OS.
- Test unsafe schemes through each real handler, not only through the standalone predicate.
- Expose the validator through a supported package seam only if consumers genuinely need it; otherwise duplicate the narrow sink validation with an explicit contract test.

## Agent and review model

### Execution

- One implementation agent owns one issue in an isolated worktree.
- The agent reads the repository's primary instruction file and topical documentation.
- It runs repository-native fast checks after edits and deep or boundary checks before completion.
- Parallel agents handle independent workstreams, not recursive delegation of the same issue.
- Updates are terse: changed state, decision, blocker, or evidence only.

### Consequence tiers

- **T0 — trivial:** non-policy prose, typo, formatting, or independently generated refresh; native checks only.
- **T1 — ordinary:** local implementation or test change; one fresh-context independent review.
- **T2 — boundary:** contracts, security, persistence, workflows, releases, dependency pins, UI layout, IPC, lifecycle, or cross-repository work; independent boundary and evidence review.
- **T3 — exceptional:** credentials, irreversible state, disputed premise, or repeated high-severity failure; stop autonomous execution and surface the decision to the user.

A documentation change that alters architecture, testing, release, security, workflow, or source-of-truth claims is not T0.

### Reviewer contract

The reviewer:

- Is not the implementation agent or its continuation.
- Starts from the acceptance contract and base-to-head diff, not the author's rationale.
- Remains read-only during the finding pass.
- Reconstructs the behavioral claim independently.
- Reports file/line, violated invariant, concrete failure scenario, and verification method.
- Does not block on style preferences without a violated project rule.

Two failed repair attempts trigger premise review or human arbitration. A third speculative patch is not the default response.

## Evidence model

Every T1 or T2 change reports:

- Base and head revision.
- Changed files.
- Compatibility, urgency, and consequence classifications.
- One-sentence behavioral claim.
- Affected boundary and source of truth.
- Exact checks run and exit status.
- Focused positive and negative evidence.
- Residual uncertainty.

Evidence must exercise the claimed boundary:

- Core exports use the real package and export map.
- Lifecycle changes use process-level E2E checks.
- Client integration uses exact producer artifacts.
- UI layout uses real-browser or packaged evidence, not DOM-only tests.
- Installer or machine-state work uses isolated VM evidence.
- Generated artifacts prove freshness from their source.

## Toolchain policy

Harmonize command interfaces and safety controls, not implementations.

Shared expectations:

- `lint` means whole-repository lint.
- `test` exists and runs the ordinary unit suite.
- `typecheck` performs the default static type check.
- `check:fast` is the short authoring loop.
- `check:deep` is the pre-review repository-native gate.
- Runtime/package-manager versions are explicit.
- CI uses frozen installs, least-privilege permissions, cancellation, and timeouts.
- Write-scoped and third-party actions use immutable references where practical.
- Dependency and security automation exists in every repository.

Intentional differences remain:

- Bun for `maximal` and `maximal-core`; npm for `maximal-electron`.
- Repository-specific release systems.
- Electron's mutation and cross-platform package gates.
- Core's downstream export and lifecycle gates.
- Maximal's integration, UI, and product packaging gates.

## GitHub and repoman coordination

The immediate routing defect is operational, not aspirational:

- Public repositories call a private reusable triage workflow that cannot resolve.
- Only `maximal` receives polling-backstop coverage.
- `maximal-core` and `maximal-electron` are not consistently provisioned or covered.

Repair as one coordinated work item:

- Use a pinned public reusable workflow or inline the small event workflow.
- Add all three repositories to polling fallback.
- Provision consistent routing labels.
- Verify issue-open events create successful runs in all three repositories.
- Keep polling as a backstop rather than the primary path.
- Correct workflow input type mismatches.

A Project is a view over implementation issues, not a replacement issue database. It should expose producer ref, compatibility, consumer owners/issues, verification, release state, dependencies, and rollback readiness.

## Release readiness

Keep each repository's release machinery. Apply a common compatibility gate:

- Milestone or train work is complete or explicitly deferred.
- Each affected consumer verified the exact producer candidate.
- Required merge-produced state is green.
- Package, binary, installer, or rendered checks passed as applicable.
- Rollback identifies a known prior tag or pin.
- User, operator, and migration documentation is current.

Normally release a producer, then update consumer pins. Candidate artifacts are tested before either release is declared ready.

## Failure handling and exceptions

- Contract gates fail closed when required evidence cannot run.
- A repeated CI or review failure after two attempts escalates the premise.
- Emergency bypasses record the executing agent/session, reason, rollback, and dated corrective work item; no fictional human owner is required.
- Public release, ruleset, Project, label, issue, and workflow mutations are explicit outward actions.
- Daily coordination is an automated exception digest, not a status meeting.
- Use event-triggered review for breaking contracts, blocked releases, security work, and overdue consumer adoption.
- Hold one short weekly dependency review while the repository split stabilizes; increase cadence only if measured blocked time justifies it.

## Implementation order

### P0 — stop active failure paths

1. Close the external-URL boundary in `maximal` and `maximal-electron` with focused tests.
2. Repair repoman triage and polling coverage across all three repositories.
3. Add required `maximal/client` integration CI and exact-artifact compatibility checks.
4. Make required checks fail closed for contract changes and release cuts.

### P1 — make delivery repeatable

5. Publish the reusable Electron shell as an immutable, tested artifact rather than a raw normal-operation commit pin.
6. Add compact issue/PR contract and evidence templates.
7. Add or correct rulesets and merge-produced-state checks.
8. Close CI hygiene gaps: frozen installs, least privilege, cancellation, immutable action pins, core E2E, and generated-artifact freshness.

### P2 — remove avoidable drift

9. Normalize command meanings and explicit runtime pins.
10. Add dependency automation and repository-appropriate security scanning.
11. Remove inert release configuration and obsolete tracked artifacts after verifying ownership.
12. Add a Project view after project scope is explicitly authorized.

### Later automation

- Producer-to-consumer compatibility dispatch.
- Compatibility summaries generated from actual pins and artifacts.
- Linked-issue state aggregation.
- Release-readiness aggregation.
- Advisory change classification, promoted to enforcement only after measuring false positives.

## Success measures

Within the first implementation wave:

- Unsafe URL schemes are rejected at every main-process sink.
- Issue-open triage succeeds in all three repositories, with polling fallback verified.
- No client integration change merges without client CI.
- A contract change records and verifies exact producer and consumer revisions.
- Required checks run on merge-produced state where supported.
- CI and review claims name evidence actually produced.

Over the next release cycle:

- Zero releases ship with an unverified producer/consumer combination.
- Zero contract issues close before linked consumer verification.
- Median blocked handoff age declines.
- Repeated CI-fix loops stop at two attempts and surface premise failures.
- Repository-specific deep checks remain trustworthy and maintainable.

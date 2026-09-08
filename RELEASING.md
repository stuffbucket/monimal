# Releasing

Owner of the release requirements and process.

This repository produces two artifacts, both attached to a **draft** GitHub
Release and both containing the same notarized, **stapled** `Maximal.app`: a
signed macOS `.dmg`, and a `.zip` of the bundle. Windows and Linux are not in
scope yet.

## The split

No Apple credential is in this repository, and none passes through its CI. The
private `stuffbucket/macos-builder` owns the only self-hosted macOS runner and
every Apple secret; this repository only asks it to build a tag.

| Owned here | Owned by the builder |
| --- | --- |
| [`.macos-builder/config`](.macos-builder/config) — what to build, what to call it, and which entitlements profile signs it | Every `codesign` call, `hdiutil` dmg, `notarytool`, `stapler`, `sha256` |
| [`.macos-builder/build.sh`](.macos-builder/build.sh) — builds the `.app`, and nothing else | Uploading both assets onto the draft release |
| [`.github/workflows/release.yml`](.github/workflows/release.yml) — tag → draft → dispatch → wait → verify | The Developer ID keychain, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` |

**This repository never signs anything.** The producer runs with the builder's
signing keychain LOCKED and `SIGN_IDENTITY` set to the ad-hoc identity `-`, so
it could not use the Developer ID even if it tried. It is never handed `APPLE_*`
or `KEYCHAIN_PASSWORD` either. Apple ID signing and notarization MUST run through
`stuffbucket/macos-builder`.

An Electron bundle nests four Helper apps and the Electron Framework, and a
bundle must be signed as a *directory* so the seal covers its `Info.plist` and
structure. The builder does that with `sign_walk = bun-runtime` in
[`.macos-builder/config`](.macos-builder/config): it signs every nested code
item deepest-first with that profile, then seals the outer bundle. The client
picks the profile **by name**; it cannot supply a path, so it cannot widen what
it is signed with.

This changed with the builder's producer-isolation work. It previously signed
inside-out here, via `@electron/osx-sign` during `electron-forge package`. That
is why `forge.config.ts` has no `osxSign` block: under the current contract it
would fail, and failing is the intended outcome for a producer that tries to
sign.

`packages/maximal/.macos-builder/` is **not** part of this. It is a vendored
fixture for the standalone `maximal` repository, targeting a different layout,
and the builder never reads it. See [SOURCES.md](SOURCES.md).

## Cutting a release

A release tag MUST match `vMAJOR.MINOR.PATCH` with an optional SemVer
prerelease suffix: dot-separated nonempty `[0-9A-Za-z-]` identifiers whose
numeric identifiers have no leading zero. Build metadata is not accepted. It
MUST point at a commit contained in `main` or a `release/*` branch. The
`verify` job checks both before any builder dispatch.

```sh
git switch main && git pull
git tag -a v0.5.0-rc.1 -m "v0.5.0-rc.1"
git push origin v0.5.0-rc.1
```

That is the whole trigger. The tag is the single owner of the version:
`packages/maximal/client/package.json` stays at `0.0.0` and the producer stamps
`${TAG#v}` into it at build time, so there is no manifest to bump and no way for
a tag and a bundle version to disagree. A released version MUST come from the
tag and MUST NOT be committed to the manifest; `scripts/release/contract.sh`
checks the tagged manifest in the release preflight and its self-test runs in
the ordinary PR gate.

`release.yml` then, in order:

1. **verify** — tag shape (ours *and* the builder's), the tag is contained in
   `main` or a `release/*` branch, the root CI workflow completed successfully
   on that exact commit, and `.macos-builder/config` agrees with
   `forge.config.ts` about the bundle id.
2. **draft** — creates the draft release, or reuses an existing one. Any tag
   with a hyphenated suffix is marked prerelease.
3. **dispatch** — asks the builder to build the tag. Gated on the `release`
   environment, so it waits for a reviewer.
4. **collect** — waits up to an hour for every asset the contract implies, then
   checks each checksum, a size floor, the UDIF `koly` trailer, and — through
   the zip, the only artifact Ubuntu can see inside — that the `.app` carries a
   stapled notarization ticket.

The assertions in steps 1 and 4 live in [`scripts/release/`](scripts/release/),
not inline in the workflow, so `scripts/release/selftest.sh` can drive every one
of them against fixtures in the ordinary PR gate. They were inline once, where
they first executed during a real release — which is how `v0.5.0-rc.4` failed on
four artifacts that were entirely correct.

### Required CI and repository settings

The release verifier resolves `.github/workflows/ci.yml` through the GitHub
Actions workflow API, then lists only that workflow's runs with `head_sha` equal
to the tagged commit. At least one returned run MUST have `status=completed` and
`conclusion=success`. A missing, queued, or in-progress run fails the release;
`failure`, `cancelled`, `skipped`, `neutral`, and every other conclusion also
fail closed. Release workflow runs and unrelated check suites cannot satisfy
this assertion because they are not runs of the resolved CI workflow.

The repository's `main` branch ruleset MUST require the status check
`build / typecheck / lint / test`, emitted by the root CI workflow's
`check` job. GitHub does not grant ordinary workflow tokens repository
administration visibility, so PR CI cannot reliably read or assert that ruleset
or its bypass actors. The release workflow independently enforces a successful
root CI run on every tag; an administrator changing the `main` ruleset MUST
preserve that required status check or restore it before merging further
releases.

`release.yml` never publishes. It ends with a filled, verified draft. A release
MUST remain a draft until the acceptance test below passes. The dispatch-only
[`publish-release.yml`](.github/workflows/publish-release.yml) workflow is the
sole normal publisher. It runs only when dispatched from the default branch,
uses the trusted publisher scripts from that branch, and independently reads
the artifact contract from the target tag. This permits a publisher fix without
letting a branch dispatch substitute another tag's contract.

The `release-publish` environment is a repository setting, not a file:

- It MUST require `stuffbucket` as a reviewer.
- It MUST permit self-review, because `stuffbucket` is the sole active releaser.
- It MUST permit deployment-administrator bypass as the manual recovery path.
- Its deployment branch policy MUST permit only `main`.

The normal path still records a distinct environment approval. Administrator
bypass remains explicit in the deployment history rather than replacing the
review gate for every publication.

### Recovery

To resume a run whose builder dispatch failed or timed out, dispatch the workflow
again with the same tag:

```sh
gh workflow run release.yml --repo stuffbucket/monimal -f tag=v0.5.0-rc.1
```

Every job is idempotent: the draft is reused, the builder re-dispatched, and
assets already attached are re-verified rather than rebuilt.

**This requires the `release` environment to permit the default branch**, not
only `v*` tags. A `workflow_dispatch` run executes at `refs/heads/main`, so with
a tags-only deployment policy it is rejected before the reviewer gate ever sees
it, and the only recovery is a new tag.

What a dispatch run reads from where, and why it is safe:

| | comes from | so that |
|---|---|---|
| `release.yml`, `scripts/release/` | the **branch** dispatched | a fix to the release machinery reaches an already-cut tag |
| `.macos-builder/config`, `forge.config.ts` | the **tag** (`git show`) | the contract released is the tag's own, never the branch's |

That split is what makes branch-dispatch safe. Without it a dispatch would build
the tag's commit against `main`'s contract.

## Acceptance test

CI proves presence, checksum and container shape. That is the ceiling from
Ubuntu, and a GitHub-hosted macOS runner is not an option
([AGENTS.md](AGENTS.md) → CI). The rest is proven by hand:

This test MUST run on a Mac that has never held the signing identity.

```sh
scripts/verify-dmg.sh v0.5.0-rc.2
```

Run it on a Mac that has never held the signing identity. It reads
[`.macos-builder/config`](.macos-builder/config) **at the tag** for the asset
name, the bundle id and the app path, so it cannot drift from what the builder
was told to produce.

It answers three questions, and all three must pass:

| Question | Where |
| --- | --- |
| Will a user's Mac open this? | Steps 2–11 — checksum, quarantine, Gatekeeper source, the entitlement set, every nested helper, the framework and the sidecar. |
| Will it treat this as the same app as the version already installed? | Step 12, against the previous release's actual dmg. See [Upgrades](#upgrades). |
| Is the zip the same app, and stapled? | Step 13. See [Offline launch](#offline-launch). |

The previous release is picked automatically from published GitHub Releases:
if the target is published, it uses the release immediately before it by
publication time; otherwise it uses the latest published release. Drafts do not
establish a predecessor. Pass a second argument to choose one
(`scripts/verify-dmg.sh v0.5.0 v0.5.0-rc.2`), or `none` to skip.

`stapler` is not on `PATH`, so the script calls it through `xcrun`, which finds
it in the Command Line Tools (`/Library/Developer/CommandLineTools/usr/bin/`) —
full Xcode is not required. Where it does not resolve at all the script says so
and falls back: step 13 proves stapling from the bundle's files instead, and
step 4 goes unchecked.

Finish the three manual steps it prints — offline launch, quarantine
inheritance, and upgrade over the installed version. Those are the ones that
cannot be scripted honestly. The script requires an explicit `yes` for each
before it writes `acceptance-evidence-<tag>.txt`; automation may use all three
`--attest-*` flags only after those checks have actually passed.

The evidence records the repository, tag, downloaded dmg and zip names and
SHA-256 values, selected predecessor, bundle identifier, SHA-256 of the
designated requirement, and `CFBundleVersion`. It also records all three manual
attestations and its timestamp. The script prints its base64 and SHA-256.
Dispatch `Publish Release` from `main` with the tag, that base64, and that
digest. The protected workflow rejects evidence older than seven days, a
published or missing draft, changed assets, a changed predecessor, or any
evidence that disagrees with the target tag's contract, then publishes the
draft. The accepted evidence is copied to the workflow summary for audit.

## Upgrades

macOS decides whether a new build replaces the installed one or sits beside it
as an unrelated app. Three facts decide it:

| Fact | Owner | Checked by |
| --- | --- | --- |
| `CFBundleIdentifier` | [`.macos-builder/config`](.macos-builder/config) | `release.yml` against the previous published release, then `verify-dmg.sh` step 12 against the previous artifact |
| The designated requirement — that identifier plus the Apple Team ID | The builder's Developer ID | `verify-dmg.sh` step 12 |
| `CFBundleVersion` | [`.macos-builder/build.sh`](.macos-builder/build.sh) | `build.sh` at package time, then `verify-dmg.sh` step 12 for the increase |

Change either of the first two and every existing install becomes a stranger:
TCC grants reset, keychain items orphan, `~/Library/Application Support/Maximal`
is abandoned, and a future in-app updater refuses the swap. No part of the build
fails when that happens — a release is internally consistent with itself either
way — so both are compared against what actually shipped last rather than
against a constant restated in a check. An ordinary release MUST preserve both
the bundle identifier and the signing Team ID.

`CFBundleVersion` is deliberately **not** the tag. Apple requires one to three
period-separated integers and LaunchServices stops parsing at the first
non-digit, so `0.5.0-rc.2` would collapse to `0.5.0` and compare equal to the
final release, leaving macOS no reason to prefer either copy. The producer
derives `YYYY.MMDD.HHMM` from the tagged commit's committer date instead.
`CFBundleShortVersionString` keeps the tag, and is the version users see. Every
release MUST carry a one-to-three-component numeric `CFBundleVersion` greater
than its predecessor. Before creating a draft or dispatching the builder,
`release.yml` derives both versions from their tagged commits and rejects an
invalid or non-increasing candidate; `scripts/verify-dmg.sh` keeps the
artifact-level comparison as the final backstop.

A rename is a migration, not a release. `release.yml` refuses one; re-run the
workflow from the Actions tab with `allow_identity_change=true` once you have
accepted that installed copies stay where they are.

## Offline launch

A notarization ticket that is merely *resolvable* from Apple is not the same as
one *stapled into* the artifact. The difference shows up once per install, at
first launch, and only on a machine that cannot reach Apple.

Three things should each carry their own ticket:

| | Stapled by |
| --- | --- |
| the **dmg** container | the builder's `finalize`, already |
| the **`.app` inside the dmg** | the builder, *before* `hdiutil` seals it into the image — see [What the builder provides](#what-the-builder-provides) |
| the **`.app` in the zip** | the same section 2b, once, for both |

The middle row is what people actually install, and it is the one that needed a
builder change. `artifact = updater` was never the answer, though it looked like
it: that path staples the bundle *outside* the image, after section 3a has
already copied an unstapled one in, so it only ever fixed the tarball. Stapling
once, before any container is built, fixes every artifact at the same time.

Why it is worth an extra notary round trip: every upgrade is a fresh download and
a new cdhash with its own quarantine bit, so an unstapled app needs Apple's
notary service reachable on **every** version a user installs, not just the
first. Someone upgrading offline, or from behind a proxy that blocks it, gets
"Maximal is damaged and can't be opened" on a Mac where the previous version
still launches fine — that one's assessment is cached, which makes the failure
read as a corrupt download rather than as a policy check.

`scripts/verify-dmg.sh` step 9 reports which state the dmg's app is in and step
13 asserts the zip's. Neither can be proven from CI for the dmg — an APFS disk
image is not readable from Ubuntu — so `release.yml` checks the zip, whose
entries it can list, and step A of the manual checks is what confirms the
consequence offline.

A user stuck on an older, unstapled release can launch once with a network, or
clear the attribute:

```sh
xattr -dr com.apple.quarantine /Applications/Maximal.app
```

## What the builder provides

`.macos-builder/config` asks for `artifact = dmg,zip`. Three things on the
builder side make that work, all landed in
[macos-builder#25](https://github.com/stuffbucket/macos-builder/pull/25):

1. **Section 2b** of `lib/package-macos.sh` notarizes and staples the `.app`
   once, before any container is built. This is what puts a ticket in the copy
   sealed into the dmg. It used to be gated on `updater`, which is why that
   artifact looked like the way to get a stapled app — gated there, the staple
   landed on the bundle *outside* the image, after the copy had been made.
2. **`zip` as an artifact**: the bundle in a `ditto` archive, checksummed. No
   second signature and no new secret.
3. **`clients/stuffbucket/monimal.policy`** allows `dmg,zip`. The policy gate
   rejects any artifact wider than the policy permits, and it does so only
   *after* the full 20–40 minute build — so a config that outruns the policy
   costs a whole release run, not a fast failure.

No new credential: `zip` needs neither the Ed25519 updater key nor the Tauri
CLI. That is the point of choosing it over `updater` — Squirrel.Mac, which is
what an Electron client would use, fetches with `Accept: application/zip` and
installs ZIP only, so a `.app.tar.gz` and its signature would be a long-lived
secret guarding bytes nothing here can consume.

## Onboarding a repository to the builder

Needed once, and all four are human-only. Until step 3 exists, `release.yml`
stops after the draft with a notice and stays green.

1. **A builder policy.** A repo with no `clients/stuffbucket/<name>.policy` is
   refused outright. Open a `build-config` issue in `stuffbucket/macos-builder`
   requesting `bundle_id_allowed = co.stuffbucket.maximal`,
   `entitlements_allowed = bun-runtime`, `artifact_allowed = dmg,zip`, then
   apply the `approved` label. The issue-ops flow commits the file.
2. **`app-repoman` installed here**, with Contents: read+write. Without it the
   builder cannot mint its scoped token, so it can neither check this repository
   out nor upload the asset. App installations follow the repository id, not its
   name, so a rename does not carry one over.
3. **`MACOS_BUILDER_PAT`** — a fine-grained PAT, resource owner `stuffbucket`,
   repository access **only `stuffbucket/macos-builder`**, permission
   **Actions: write**. Its only power is starting a build. Record its expiry:
   when it lapses the pipeline degrades to an unfilled draft, which is a green
   run and easy to miss.
4. **A `release` environment** restricted to tag refs, with a required reviewer,
   holding that secret.

Leave immutable releases **off** until the first release succeeds, so a failed
upload can be retried against the same tag rather than a fresh one.

## Release branches

Not in use yet. The first tags come from `main`; `release.yml` already accepts
either line, so adopting this needs no workflow change.

Cut a branch the first time a fix must ship without shipping trunk:

```sh
git switch -c release/0.5 v0.5.0 && git push -u origin release/0.5
```

- Name it `release/<major>.<minor>`. Patches live on the minor line, so
  `release/0.5.0` would be a branch per patch.
- Fixes land on `main` first, then `git cherry-pick -x` onto a branch and a PR
  into `release/0.5`. The `-x` trailer records the trunk commit, which is the
  only durable answer to "is this fix also on main".
- Never merge `release/*` back into `main`. Trunk already has the fix, and the
  merge makes `git branch --contains` stop meaning anything.

Before the first branch exists, three things must change together, or
cherry-picks get no CI run and `release.yml` refuses every patch release:
`ci.yml`'s `push.branches`, the containment check in `release.yml`, and the
`refs/heads/release/**` include pattern on the three existing rulesets.

## mxml.sh

This repository MUST NOT publish an update manifest or otherwise write to
https://mxml.sh. Shipping the zip is not the same thing and does not breach
this: it is attached to a GitHub Release and advertised nowhere. Nothing
installed reads it, and nothing here may make it so. That manifest is committed in `stuffbucket/maximal`, is pinned
at v0.4.41, and the installed desktop client reads it to decide whether an
update exists. A second publisher would advertise a version no release there
contains.

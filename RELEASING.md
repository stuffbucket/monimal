# Releasing

Owner of the release process. [AGENTS.md](AGENTS.md) carries the rules; this
file carries the mechanics.

This repository produces two artifacts, both attached to a **draft** GitHub
Release: a signed, notarized, stapled macOS `.dmg` containing `Maximal.app`, and
a gzipped tar of that same `.app` with a detached Ed25519 signature — the pair a
future in-app updater consumes. Windows and Linux are not in scope yet.

> **Two builder-side changes must land before the next tag.** See
> [Builder prerequisites](#builder-prerequisites). Tagging without them fails the
> release after a full 20–40 minute build.

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
or `KEYCHAIN_PASSWORD` either.

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

```sh
git switch main && git pull
git tag -a v0.5.0-rc.1 -m "v0.5.0-rc.1"
git push origin v0.5.0-rc.1
```

That is the whole trigger. The tag is the single owner of the version:
`packages/maximal/client/package.json` stays at `0.0.0` and the producer stamps
`${TAG#v}` into it at build time, so there is no manifest to bump and no way for
a tag and a bundle version to disagree.

`release.yml` then, in order:

1. **verify** — tag shape (ours *and* the builder's), the tag is contained in
   `main` or a `release/*` branch, every check run on that commit succeeded, and
   `.macos-builder/config` agrees with `forge.config.ts` about the bundle id.
2. **draft** — creates the draft release, or reuses an existing one. Any tag
   with a hyphenated suffix is marked prerelease.
3. **dispatch** — asks the builder to build the tag. Gated on the `release`
   environment, so it waits for a reviewer.
4. **collect** — waits up to an hour for `<dmg>` and `<dmg>.sha256`, then checks
   the checksum, a size floor, and the UDIF `koly` trailer.

**The workflow never publishes.** It ends with a filled, verified draft.
Publishing is deliberate and manual, after the acceptance test below:

```sh
gh release edit v0.5.0-rc.1 --draft=false
```

To resume a run whose builder dispatch failed or timed out, re-run the workflow
from the Actions tab with the same tag. Every job is idempotent.

## Acceptance test

CI proves presence, checksum and container shape. That is the ceiling from
Ubuntu, and a GitHub-hosted macOS runner is not an option
([AGENTS.md](AGENTS.md) → CI). The rest is proven by hand:

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
| Is the updater artifact the same app, and stapled? | Step 13. See [Offline launch](#offline-launch). |

The previous release is picked automatically. Pass a second argument to choose
one (`scripts/verify-dmg.sh v0.5.0 v0.5.0-rc.2`), or `none` to skip.

`stapler` needs full Xcode, so the script calls it through `xcrun`; a machine
with only the Command Line Tools says so and falls back where it can — step 13
proves stapling from the bundle's files instead, step 4 goes unchecked.

Finish the three manual steps it prints — offline launch, quarantine
inheritance, and upgrade over the installed version. Those are the ones that
cannot be scripted honestly. **That output is the definition of done**; paste it
into the release notes before publishing.

## Upgrades

macOS decides whether a new build replaces the installed one or sits beside it
as an unrelated app. Three facts decide it:

| Fact | Owner | Checked by |
| --- | --- | --- |
| `CFBundleIdentifier` | [`.macos-builder/config`](.macos-builder/config) | `release.yml` against the previous tag, then `verify-dmg.sh` step 12 against the previous artifact |
| The designated requirement — that identifier plus the Apple Team ID | The builder's Developer ID | `verify-dmg.sh` step 12 |
| `CFBundleVersion` | [`.macos-builder/build.sh`](.macos-builder/build.sh) | `build.sh` at package time, then `verify-dmg.sh` step 12 for the increase |

Change either of the first two and every existing install becomes a stranger:
TCC grants reset, keychain items orphan, `~/Library/Application Support/Maximal`
is abandoned, and a future in-app updater refuses the swap. No part of the build
fails when that happens — a release is internally consistent with itself either
way — so both are compared against what actually shipped last rather than
against a constant restated in a check.

`CFBundleVersion` is deliberately **not** the tag. Apple requires one to three
period-separated integers and LaunchServices stops parsing at the first
non-digit, so `0.5.0-rc.2` would collapse to `0.5.0` and compare equal to the
final release, leaving macOS no reason to prefer either copy. The producer
derives `YYYY.MMDD.HHMM` from the tagged commit's committer date instead.
`CFBundleShortVersionString` keeps the tag, and is the version users see.

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
| the **`.app` inside the dmg** | the builder, *before* `hdiutil` seals it into the image — see [Builder prerequisites](#builder-prerequisites) |
| the **`.app` in the updater tarball** | the builder's updater path, already |

The middle row is the one that matters most, because it is what people actually
install, and it is the one that needed a builder change. Requesting
`artifact = updater` does **not** produce it: that path staples the bundle
*outside* the image, after section 3a has already copied an unstapled one in.
Only stapling before `hdiutil create` puts a ticket in the copy a user gets.

Why it is worth an extra notary round trip: every upgrade is a fresh download and
a new cdhash with its own quarantine bit, so an unstapled app needs Apple's
notary service reachable on **every** version a user installs, not just the
first. Someone upgrading offline, or from behind a proxy that blocks it, gets
"Maximal is damaged and can't be opened" on a Mac where the previous version
still launches fine — that one's assessment is cached, which makes the failure
read as a corrupt download rather than as a policy check.

`scripts/verify-dmg.sh` step 9 reports which state the dmg's app is in and step
13 asserts the tarball's, but neither can be proven from CI for the dmg: an APFS
disk image is not readable from Ubuntu. `release.yml` therefore checks only the
tarball, and step A of the manual checks is what confirms the consequence
offline.

A user stuck on an older, unstapled release can launch once with a network, or
clear the attribute:

```sh
xattr -dr com.apple.quarantine /Applications/Maximal.app
```

## Builder prerequisites

Both live in the private `stuffbucket/macos-builder` and neither can be made
from here. Until both land, `.macos-builder/config` asks for something the
builder will refuse or cannot deliver.

1. **Widen the policy.** `clients/stuffbucket/monimal.policy` must set
   `artifact_allowed = dmg,updater`. The gate rejects a wider request than the
   policy allows, and it does so only *after* the full build. The builder also
   needs `TAURI_SIGNING_PRIVATE_KEY` and the `TAURI_SIGNING_PUBLIC_KEY` variable
   populated, or the updater path refuses to start.
2. **Staple the `.app` before the dmg is built.** In `lib/package-macos.sh`,
   notarize and staple the bundle between the top-level seal (section 2) and the
   dmg (section 3a), so `cp -R "$APP" "$STAGE/"` copies an already-stapled
   bundle. Stapling writes the ticket to `Contents/CodeResources` at the bundle
   root, which is outside the seal, so the signature stays valid — `codesign
   --verify --strict` passes on a stapled bundle. Section 3c then finds
   `APP_NOTARIZED=1` and its `stapler staple` is a no-op.

Order does not matter between them, but both must precede the next tag.

## Onboarding a repository to the builder

Needed once, and all four are human-only. Until step 3 exists, `release.yml`
stops after the draft with a notice and stays green.

1. **A builder policy.** A repo with no `clients/stuffbucket/<name>.policy` is
   refused outright. Open a `build-config` issue in `stuffbucket/macos-builder`
   requesting `bundle_id_allowed = co.stuffbucket.maximal`,
   `entitlements_allowed = bun-runtime`, `artifact_allowed = dmg,updater`, then
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
https://mxml.sh. Producing the updater artifact is not the same thing and does
not breach this: the tarball and its signature are attached to a GitHub Release
and advertised nowhere. Nothing installed reads them, and nothing here may make
it so. That manifest is committed in `stuffbucket/maximal`, is pinned
at v0.4.41, and the installed desktop client reads it to decide whether an
update exists. A second publisher would advertise a version no release there
contains.

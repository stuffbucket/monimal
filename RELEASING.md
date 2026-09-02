# Releasing

Owner of the release process. [AGENTS.md](AGENTS.md) carries the rules; this
file carries the mechanics.

This repository produces one artifact: a signed, notarized, stapled macOS `.dmg`
containing `Maximal.app`, attached to a **draft** GitHub Release. Windows and
Linux are not in scope yet.

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
([AGENTS.md](AGENTS.md) → CI). Gatekeeper is proven by hand:

```sh
scripts/verify-dmg.sh v0.5.0-rc.1
```

`stapler` needs full Xcode, so the script calls it through `xcrun`; a machine
with only the Command Line Tools would otherwise fail on `stapler: command not
found` partway through.

Note what it will report: the **dmg** carries a stapled ticket, the `.app` inside
does not. The builder staples the app only for the `updater` artifact, so a
dmg-only client ships an app whose ticket is resolved online at first launch.
That is ordinary for dmg distribution, and it is the one thing an offline first
launch cannot fall back on — which is why step A below exists.

Run it on a Mac that has never held the signing identity, and finish the two
manual steps it prints — the offline `spctl` check and the copy-and-launch
quarantine test. Those two are the only ones that distinguish a stapled
artifact from one that merely resolves online. **That output is the definition
of done**; paste it into the release notes before publishing.

## Onboarding a repository to the builder

Needed once, and all four are human-only. Until step 3 exists, `release.yml`
stops after the draft with a notice and stays green.

1. **A builder policy.** A repo with no `clients/stuffbucket/<name>.policy` is
   refused outright. Open a `build-config` issue in `stuffbucket/macos-builder`
   requesting `bundle_id_allowed = co.stuffbucket.maximal`,
   `entitlements_allowed = bun-runtime`, `artifact_allowed = dmg`, then apply
   the `approved` label. The issue-ops flow commits the file.
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
https://mxml.sh. That manifest is committed in `stuffbucket/maximal`, is pinned
at v0.4.41, and the installed desktop client reads it to decide whether an
update exists. A second publisher would advertise a version no release there
contains.

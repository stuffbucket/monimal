# Release

## Trains

Work is marshalled on a release branch and folded into `main` when the release
is cut. The tag goes on `main` at that point, and it is what starts the build
described below.

```
feature branch ──> release/0.0.1 ──> main ──> tag v0.0.1 ──> the build
```

A release branch is an integration branch, not a stabilisation branch. It is
cut from `main` when the release opens, and features target it rather than
`main`. That is why the arrow points into `main` rather than out of it.

Two trains run at a time, at `n+1` and `n+2` from the shipped version. Cutting
one opens the next, so there is always somewhere to put work that is not the
current release, and nobody has to decide where a change goes before anyone
knows. A third train would be that decision made too early.

| Train    | What belongs on it                                                     |
| -------- | ---------------------------------------------------------------------- |
| `v0.0.1` | The shell's own behaviour: accessibility, interface state, its defects. |
| `v0.0.2` | The seam a consumer depends on: the host entrypoint, the export, the    |
|          | preload bridge, client integration, theming from an external source.    |
| `v0.0.3` | What a consumer installs: the artifact is correct and provably so.      |
| `v0.0.4` | What a consumer carries: install weight, the entrypoint seam, guards.   |
| `v0.0.5` | Whether the instruments are honest, and what the package is called.     |
| `v0.0.6` | What a consumer can trust: the preload seam, crash isolation, coverage. |

The test for which train a change belongs on is whether
`stuffbucket/maximal` has to change to benefit from it. If it does, the change
is about the seam and belongs on the later train.

Every issue and every pull request carries a milestone. One without a milestone
has not been triaged, and that is the thing to fix before working on it.

Each train has a milestone and a **draft** release. A draft release names a tag
that does not exist yet; GitHub creates it on publish. So the draft is a
statement of intent, and publishing it is what cuts the release. Nothing is
tagged early, and nothing is tagged on a branch other than `main`.

Bump the patch version in `package.json` on the release branch when the train
reaches a stable state, not on `main`, so that `main` never claims a version
that has not shipped.

Bump it by replacing the exact line and asserting how many lines you replaced:
one in `package.json`, and two in `package-lock.json` — the top-level `version`
and `packages[""].version`.

Three ways of doing this are wrong, and all three were measured rather than
reasoned about:

- **Reading the manifest into a JSON library and writing it back.** It
  reformats key order, escaping, wrapping and the trailing newline, so a
  one-line bump lands as a 46-line diff that hides what changed. This happened
  on the v0.0.6 cut.
- **`npm version <version> --no-git-tag-version`.** It updates both files
  correctly, and it also expands this repository's compact
  `peerDependenciesMeta` entries from one line each to three — eleven of them,
  thirty-three lines. Same defect, different place.
- **A global find and replace of the version string.** `package-lock.json`
  holds `node_modules/tunnel` pinned at `0.0.6`, unrelated to this package and
  identical as text. A global replace repins a dependency silently.

Issue #167.

## Cutting one

1. Fold the release branch into `main`.
2. Push the tag on `main`. The build below runs and fills the draft.
3. Publish the draft. That is the release.
4. Open the next train: a `v0.0.(n+2)` milestone, branch, and draft release, so
   two are open again.

If step 2's run does not complete — an Actions outage, a cancelled queue, a
runner that never arrived — the tag is not spent. Dispatch the same workflow
against it:

```
gh workflow run release.yml --ref v0.0.5 -f publish=true
```

Every job is re-runnable, so the retry picks up wherever the last attempt
stopped and says which parts had already been done. See `docs/ci.md` for the
rail that keeps a dispatch against a branch from publishing, and for the
outage that made this necessary.

## A pushed tag is immutable

`v0.0.2` was pushed at 23:29:43, deleted, and pushed again at 23:37:44 onto a
different commit, to pick up #80. The workflow run list shows both pushes. The
release was still a draft, so nothing published moved, and the cost this time
was nil.

The cost next time is not. `stuffbucket/maximal` installs this package from a
git ref, so a lockfile records `v0.0.3` and resolves whatever that tag points
at now. Moving a tag changes what a consumer installs without changing anything
they can see. That is the same class of hazard as adding an asset to a
published release, and it has the same answer: cut the next patch.

If a tag's build fails **because the code is wrong**, the tag stays where it is.
Fix the cause on the release branch, bump the patch, and push a new tag. The
failed run is the record of what happened, and deleting the tag deletes that
record too.

A run that failed for a reason outside the code is the other case, and it used
to have the same remedy. It does not now: retry the publish against the tag
instead of burning a version on somebody else's outage.

`stuffbucket/maximal-core` reached the same rule from the other direction. Their
#60 refuses a tag that is not above every tag that already exists, checked
against `git ls-remote --tags origin` rather than the local checkout, because a
checkout is stale by default.

`npm run verify:tag` is that gate here, and it runs in `tag-check` before the
rest of the pipeline spends a minute. It refuses a tag that is not above every
tag that exists, and it refuses a ref that has already been built at another
commit. The second rule is the one that would have stopped `v0.0.2`: a tag
deletion erases the ref and nothing else, so both runs are still listed on
`refs/tags/v0.0.2`, at `e983b74` and at `441df8a`. Asking whether the tag
already exists would have caught nothing, because the tag was deleted first.

The gate refuses to build a moved tag. It cannot refuse to move one. Only a
repository ruleset does that, and there is none: `main` carries two branch
rulesets, `main-no-force-delete` and `main-require-pr`, and nothing targets a
tag, so `git push --delete origin v0.0.5` succeeds today.

That gap is now machine-checked rather than only written down.
`npm run verify:rulesets` reports it, `watch-rulesets.yml` files one issue for
it daily, and [`docs/admin/repository-settings.md`](admin/repository-settings.md)
states exactly what the owner has to click to close it.

## The shape

Push a tag. Five jobs run. The tarball lands on a **draft** release, one job
publishes the package to the registry, and one flips the draft to published at
the end.

```
tag-check ──> release (draft) ──> package-tarball ──┬─> publish
                                                    └─> publish-package
```

The same workflow runs from a dispatch. With `publish` at its default it
rehearses: it builds everything and attaches nothing. With `publish` set true
against a **tag** ref it is the retry described above. A branch cannot publish
however the input is set. See `docs/ci.md`.

## There is no installer

This repository ships one asset: the npm tarball. It builds no MSI and no dmg.

That is a removal, and the reasons are on the record:

- The dmg job never once succeeded, on any tag, including `v0.0.4`. It needed a
  credential for the private signing repository, nobody ever minted one, and no
  dmg was ever produced for this repository (#69). Its failure is why
  `release.yml` has never had a green overall conclusion.
- Every MSI this repository published contained zero files. `msiinfo export
  <msi> File` returned no rows for `v0.0.2` and for `v0.0.3`. A 226 MB download
  that installs nothing (#112). Both assets have since been deleted from the
  published releases.
- `stuffbucket/maximal` consumes this shell as a library and packages, signs,
  and notarizes its own application. It has never consumed either installer.

Three of the eight jobs in `release.yml` existed for those two artifacts, and a
fourth workflow, `windows-msi-dev.yml`, existed only to iterate on one of them.

The MSI work that #106 landed went with them: `scripts/build-msi.ps1`,
`scripts/verify-msi.ps1`, `build/windows/app.wxs` and `tests/wxs.test.ts`. That
work was correct. It made the harvest fail loudly, compared the installed tree
against a manifest byte for byte, and launched the installed executable. It was
correct maintenance of an artifact with no consumer, which is why it is the
artifact and not the fix that was wrong. The lesson it paid for is kept in
`.claude/skills/port-to-project/SKILL.md`: an installer check that does not look
inside the installer proves nothing.

**Packaging is kept.** `npm run package` produces a `.app` on macOS and a
`win32` directory on Windows, `ci.yml` runs it on both platforms, `npm run
verify:package` asserts the asar contents, the content policy, the native
modules named file by file, the icons, and the fuses, and `npm run
smoke:packaged` launches the result. Packaging correctness is a real property
of the shell: it is how #88 was found, where `spawn-helper` was stranded inside
`app.asar` and every terminal failed to start in a packaged build. What was
deleted is the installer wrapped around the package, not the package.

A fork that wants an installer adds one. `forge.config.ts` has no makers, so
that is a maker plus a job, and nothing here fights it.

## What a consumer installs

`package-tarball` runs `npm pack`, which runs `prepack`, which builds `dist`.
Nothing is committed. It runs `verify:exports` first, so a tarball missing an
export target fails before it is attached rather than after somebody installs
it.

It then installs the same commit **by git ref**, which is the other path and a
different lifecycle script: npm runs `prepare` for a git dependency and
`prepack` for a tarball. `stuffbucket/maximal` pins the git form, and `v0.0.2`
shipped installing to nothing on it. See `docs/ci.md`.

`publish-package` then publishes that same archive to the GitHub Packages npm
registry as `@stuffbucket/maximal-electron`. It publishes the artifact
`package-tarball` uploaded rather than packing a second time, so the bytes that
were checked are the bytes that go up. `npm run verify:publish` reads the
archive and asserts the publish identity and its contents; that runs on a dry
run too.

Publishing adds no secret. `GITHUB_TOKEN` with `packages: write` publishes to
the registry for the repository the workflow runs in, and the scope has to be
the account that owns that repository. **Installing does need a token**, for a
public package as much as a private one. `docs/consuming.md` states that cost
and shows the `.npmrc`.

The release still carries the tarball as an asset, named
`stuffbucket-maximal-electron-<version>.tgz`. A consumer installs it from the
release without a token:

```
npm install https://github.com/stuffbucket/maximal-electron/releases/download/v0.0.5/stuffbucket-maximal-electron-0.0.5.tgz
```

That path costs a pinned URL rather than a version range, and it runs neither
`prepack` nor `prepare`, so it depends entirely on what the attached archive
already contains. The registry is the supported path. This one is the fallback
for a consumer who will not hold a token.

## Why a draft

GitHub immutable releases reject an asset added after publish, with HTTP 422.
So there is no second chance to attach a file. Everything must land while the
release is still mutable.

This is the same reason `stuffbucket/maximal` uses this shape.

A consequence worth stating: a release carries the tarball and nothing else. A
consumer of the library has everything. Somebody looking for an installer finds
none, and this document is where they learn why.

## macOS

This repository holds no Apple credential, and it must stay that way.

It also no longer signs anything. Signing existed to produce the dmg, the dmg
is gone, and the client contract for `stuffbucket/macos-builder` went with it:
`.macos-builder/config` and `.macos-builder/build.sh` are deleted, and so is
the repository secret the `macos-dmg` job required and never had (#69).

`npm run package` still produces an **unsigned** `Stuffbucket.app`, and `npm
run smoke:packaged` still launches it. Gatekeeper refuses to open an unsigned
bundle on a machine other than the one that built it, which is the expected
behaviour for an unsigned bundle and not a defect. A consumer that distributes
a macOS application signs it themselves; `stuffbucket/maximal` does exactly
that.

Restoring signing means restoring the builder client contract and one job. The
shape is recorded in `docs/signing.md`.

## Windows

Windows ships no installer. `npm run package -- --platform=win32 --arch=x64`
produces `out/Stuffbucket-win32-x64/`, which contains `Stuffbucket.exe` and its
resources, and that directory is what a fork would wrap.

`ci.yml` builds and verifies it on `windows-latest` on every pull request, and
`npm run smoke:packaged` launches `Stuffbucket.exe` out of a copy of that
directory, made outside this checkout, and makes it open a shell. It drives the
packaged directory rather than an installed tree, so it says nothing about an
installer a fork adds.

## Auto-update: why there is none

There is no update channel, and now no installer to carry one. This is a
documented position, not an oversight.

- Electron's own updaters install over a delivered artifact. This repository
  delivers a library tarball, which npm updates.
- `stuffbucket/maximal` owns its own application and its own update story.

A fork that ships an application adds a maker, a release job, and an updater
together. `update-electron-app` against GitHub Releases is the shortest path,
and it needs a `.zip` artifact and a public repository.

## Extension points

Deliberately not built. Each is a small, contained addition.

- **Any installer at all.** `forge.config.ts` declares no makers. Adding one
  plus a release job is the whole change; see the section above for why none is
  here.
- **Linux.** Add `@electron-forge/maker-deb` and `@electron-forge/maker-rpm`,
  scope each to `linux`, and add a job to `release.yml` on `ubuntu-22.04`.
  Build on 22.04 rather than latest, for the older glibc baseline.
- **Windows Authenticode.** Deferred organisation-wide. See `docs/signing.md`.
- **Universal macOS binaries.** Not built here, and untried. `prunePtyPrebuilds`
  in `forge.config.ts` already accepts `universal` and keeps both node-pty
  prebuilds, and `pruneLlamaBackends` keeps both llama.cpp packages, so the
  native-module side of it is done.

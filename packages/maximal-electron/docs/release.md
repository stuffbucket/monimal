# Release

`@maximal/maximal-electron` is a private workspace package. It is not
published to a registry or attached to a package release. The desktop
application is released from the repository root by
[`../../../.github/workflows/release.yml`](../../../.github/workflows/release.yml).

## There is no installer

This package builds no MSI and no dmg.

That is a removal, and the reasons are on the record:

- The dmg job never once succeeded, on any tag, including `v0.0.4`. It needed a
  credential for the private signing repository, nobody ever minted one, and no
  dmg was ever produced for this repository (#69).
- Every MSI this repository published contained zero files. `msiinfo export
  <msi> File` returned no rows for `v0.0.2` and for `v0.0.3`. A 226 MB download
  that installs nothing (#112). Both assets have since been deleted from the
  published releases.
- `stuffbucket/maximal` consumes this shell as a library and packages, signs,
  and notarizes its own application. It has never consumed either installer.

Three jobs existed for those two artifacts, and a fourth workflow,
`windows-msi-dev.yml`, existed only to iterate on one of them.

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

Restoring signing means restoring the builder client contract. The shape is
recorded in `docs/signing.md`.

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

- Electron's own updaters install over a delivered artifact. This package
  delivers no end-user artifact.
- `stuffbucket/maximal` owns its own application and its own update story.

A fork that ships an application adds a maker and an updater together.
`update-electron-app` against GitHub Releases is the shortest path, and it
needs a `.zip` artifact and a public repository.

## Extension points

Deliberately not built. Each is a small, contained addition.

- **Any installer at all.** `forge.config.ts` declares no makers. Adding one is
  the whole packaging change; see the section above for why none is here.
- **Linux.** Add `@electron-forge/maker-deb` and `@electron-forge/maker-rpm`,
  and scope each to `linux`. Build on a runner with an older glibc baseline.
- **Windows Authenticode.** Deferred organisation-wide. See `docs/signing.md`.
- **Universal macOS binaries.** Not built here, and untried. `prunePtyPrebuilds`
  in `forge.config.ts` already accepts `universal` and keeps both node-pty
  prebuilds, so the native-module side of it is done.

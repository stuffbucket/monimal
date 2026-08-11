---
name: port-to-project
description: Apply this template's build and release pipeline to another repository
---

# Port this pipeline to another project

Use this to give another repository, such as `stuffbucket/maximal`, the same
build and release mechanics.

**This repository ships no installer.** It packages, verifies the package, and
releases an npm tarball. If the target repository distributes an application to
end users, the installer is the part you have to supply yourself, and
`docs/release.md` says why none is here.

## What actually transfers

| Piece | Portable | Note |
| --- | --- | --- |
| `.github/workflows/release.yml` | Yes | The draft-then-publish shape is framework neutral. |
| `.github/workflows/ci.yml` | Yes | The package matrix is the part worth copying. |
| `scripts/verify-package.mjs` | Electron only | It reads asar and fuses. |
| `AGENTS.md` and `.claude/skills` | Yes | Adapt the commands table. |
| `e2e/demo/*` except the two below | Yes | Generic. Pages, frames, and seconds only. |
| `e2e/demo/launch.ts` and `*.demo.ts` | No | Rewrite. These are the timelines. |
| `demo/edits/*.json` | No | One per video. The cut, not the machinery. |
| `src/shared/ipc.ts` pattern | Electron only | Tauri has its own command layer. |
| `src/renderer/**` | Yes | React plus Radix plus `react-resizable-panels`. |

## Steps

1. **Rename.** Change `name`, `productName`, and `repository` in
   `package.json`. Change `packagerConfig.name`, `executableName`, and
   `appBundleId` in `forge.config.ts`.

2. **Point at your own icons.** Set `STUFFBUCKET_ICON_DIR` to a directory
   holding the six names in the icons section of `README.md`. Build and run
   both read it, so nothing in the shell is edited. `npm run icons` writes a
   placeholder set into it.

3. **Take the packaging checks.** `scripts/verify-package.mjs` is the piece
   with the most earned detail in it: the asar layout, the unpacked native
   modules, the run-time icons, and the fuse values. Every assertion in it
   exists because something shipped broken without it.

4. **Rehearse before you rely on it.** Dispatch `release.yml` from a branch for
   a dry run, then push a `v0.0.1-alpha.1` tag and watch the full run.

## If you need an installer

Nothing here helps directly, and that is deliberate rather than an omission.
Add a Forge maker, a release job that runs it, and a check that looks **inside**
the artifact it produces.

That last one is not optional, and it is the whole lesson this repository paid
for. Two MSIs shipped containing zero files (#112). The verify job installed
each one, found the install directory, found the registry marker, found the
Add or Remove Programs entry, and passed. Every assertion it made was true of
an installer with no application in it.

What a real check looks like, from the version that was deleted:

- Enumerate the packaged directory and write a manifest of every file and its
  size, at build time.
- Refuse a manifest shorter than a floor. A packaged Electron application is
  hundreds of files, so fewer than fifty means the harvest failed.
- After installing, compare the installed tree against that manifest file by
  file, and fail on anything missing.
- Launch the installed executable and require it to still be running twenty
  seconds later. A complete tree still does not prove the thing starts.

Signing is a separate problem again. `docs/signing.md` records the private
builder shape that a personal account has to use, and why.

## For a project that already releases

`maximal` already has a `release.yml` with a draft-then-publish flow and its
own packaging. Do not replace it. Take only what is missing, most likely the
`verify:package` idea and the skills.

## What not to copy

- Apple credentials. A client repository that holds one has a defect.
- Windows signing. It is deferred organisation-wide.
- Auto-update. There is no channel here to copy.

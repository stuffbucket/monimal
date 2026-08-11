---
name: cut-release
description: Tag a release and ship the npm tarball
---

# Cut a release

A release carries one asset: the npm tarball. This repository builds no
installer. See `docs/release.md`.

## Before you tag

```bash
pnpm install --frozen-lockfile
pnpm run lint && pnpm run typecheck && pnpm test
pnpm run package && pnpm run verify:package && pnpm run smoke:packaged
pnpm run test:e2e
pnpm run verify:git-install
```

`verify:git-install` installs this checkout the way `stuffbucket/maximal` pins
it, by git ref, and resolves every export. It then archives the same ref and
asserts that installing the archive fails loudly, which is the form npm builds
nothing for. It runs against the local clone, so it needs no network and no
pushed tag. The tarball and the git ref are different lifecycle scripts, and a
tag has shipped with only one of them wired.

Set the version by replacing the exact line and asserting the replacement
count: one, in `package.json`. `pnpm-lock.yaml` does not record the root
package's version, so it needs no bump and must not be edited by hand. The tag
must match the version exactly, or the `tag-check` job fails before anything
builds.

**Three shortcuts are wrong here, all three measured:**

- Loading the manifest into a JSON library and writing it back reformats the
  whole file, so a one-line bump arrives as a 46-line diff. This happened on
  the v0.0.6 cut.
- `npm version <v> --no-git-tag-version` updates the version correctly, and
  also expands eleven compact `peerDependenciesMeta` entries into thirty-three
  lines.
- A global replace of the version string repins an unrelated dependency whose
  pin is the same text. This bit `package-lock.json`'s `node_modules/tunnel`
  entry; `pnpm-lock.yaml` is equally full of version strings.

Issue #167.

Then dispatch `release.yml` from the branch. With the `publish` input left at
its default it rehearses: it packs the tarball, installs the commit by git ref,
runs the registry publish with `--dry-run` and no valid token, asserts the
artifact exists, and attaches nothing. Every release defect this repository has
shipped was in a job that had never run. See `docs/ci.md`.

```bash
gh workflow run release.yml --ref release/0.1.0
```

```bash
# package.json version 0.1.0 -> tag v0.1.0
git tag -a v0.1.0 -m "Release 0.1.0"
git push origin v0.1.0
```

Accepted tag shapes: `v1.2.3`, `v1.2.3-alpha`, `v1.2.3-alpha.1`, `v1.2.3-beta`,
`v1.2.3-beta.4`.

## When the tag's run does not complete

An outage, a cancelled queue, a runner that never arrived. The tag is not
spent. Dispatch the same workflow against the **tag**, asking it to publish:

```bash
gh workflow run release.yml --ref v0.1.0 -f publish=true
```

Every job is re-runnable, so this picks up wherever the last attempt stopped.
Read the log for which of the two outcomes each step reported: `CREATED` or
`REUSED`, `ATTACHED` or `ALREADY ATTACHED`, `PUBLISHED` or `ALREADY PUBLISHED`.

Two things this does not fix. A release that is already published and does not
carry the tarball cannot gain one — HTTP 422, so cut the next patch. And the
workflow that runs is the one at the dispatched ref, so a tag cut before #162
landed does not carry the input.

## What the workflow does

| Job | What it does |
| --- | --- |
| `tag-check` | Asserts the tag matches `package.json`. Fails fast. |
| `release` | Creates a **draft** release with generated notes, or reuses one. |
| `package-tarball` | Packs what a consumer installs, installs the commit by git ref, and attaches the tarball. |
| `publish` | Flips the draft to published, once, at the end. |
| `publish-package` | Publishes to GitHub Packages, or reports the version as already there. |
| `dry-run-artifacts` | Rehearsals only. Asserts the run produced a tarball. |

`publish` gates on `package-tarball`.

Every asset lands on the **draft**. GitHub immutable releases reject an asset
added after publish with HTTP 422, so there is no second chance.

## Verify what shipped

```bash
gh release view v0.1.0 --json assets --jq '.assets[].name'
```

Expect one asset: `stuffbucket-electron-<version>.tgz`.

The release tarball is a supported install specifier, so install it once from
its published URL and resolve every export:

```bash
node scripts/verify-git-install.mjs --tarball \
  https://github.com/stuffbucket/maximal-electron/releases/download/v0.1.0/stuffbucket-maximal-electron-0.1.0.tgz
```

No job does this. The asset exists only after `publish`, which is after every
job has run. See `docs/consuming.md`.

## Known gaps

No installer, nothing signed, and no update channel. See `docs/release.md` for
the reasons and `docs/signing.md` for what restoring signing would take.

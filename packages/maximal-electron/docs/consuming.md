# Consuming this package

`@stuffbucket/maximal-electron` ships its library exports from `dist/`, which is
built rather than committed. Which install specifier you write decides whether
that build ever runs, and whether you need a token.

## The four forms

| Specifier | Lifecycle script npm runs | Token | Result |
| --- | --- | --- | --- |
| `@stuffbucket/maximal-electron@^0.0.5` from GitHub Packages | None. The archive is already built | Required | Works |
| `https://github.com/.../releases/download/v0.0.5/stuffbucket-maximal-electron-0.0.5.tgz` | `prepack`, at pack time | No | Works |
| `github:stuffbucket/maximal-electron#<ref>` | `prepare`, in the clone | No | Works |
| `https://codeload.github.com/.../tar.gz/<sha>` | None | No | Refused |

The registry is the supported path from `v0.0.5`. The other two working forms
are not deprecated, and the reason to keep them is in the next section.

A release asset from `v0.0.4` or earlier is named `stuffbucket-electron-<version>.tgz`,
because the rename lands in `v0.0.5`. The URL and the package name both move
together.

This package is not on the public npm registry. `npm install
@stuffbucket/maximal-electron` with no `.npmrc` finds nothing.

## The registry, and what it costs

**GitHub Packages requires authentication to install, including for a public
package.** GitHub's own documentation says it plainly: "You need an access
token to publish, install, and delete private, internal, and public packages."
There is no anonymous read.

Two consequences, and neither is small.

- Every consumer writes an `.npmrc` and holds a token. A developer cloning
  `stuffbucket/maximal` cannot run `npm install` until they have made one.
- The registry only supports a **personal access token (classic)**. A
  fine-grained token does not authenticate to it. `read:packages` is the
  narrowest scope that works.

`stuffbucket/maximal` needs that token in GitHub Actions **and** on its
self-hosted macOS signing runner, which is a machine somebody configures by
hand. That is the price of the registry, and it is paid by the consuming
repository rather than this one. It is also why the release tarball stays
attached to every tag: a consumer who will not hold a token has a form that
still works.

The public npm registry avoids the burden entirely. It needs no token to
install. It needs a publish credential this repository does not hold, and that
is a decision for the owner rather than a change an agent makes.

### What a consumer writes

An `.npmrc` beside `package.json`, committed:

```
@stuffbucket:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_GITHUB_TOKEN}
```

npm expands the environment variable, so the file carries no credential. The
token goes in the environment: a developer exports it from a shell profile, and
a workflow reads it from a secret.

Then a range rather than a pin:

```json
"@stuffbucket/maximal-electron": "^0.0.5"
```

A range is not the reason to prefer it. The `github:` form takes one too —
`#semver:<range>`, matched against this repository's tags:

```json
"@stuffbucket/maximal-electron": "github:stuffbucket/maximal-electron#semver:0.0.x"
```

Measured against `v0.0.3` and `v0.0.4`: `0.0.x` and `>=0.0.3` both resolve to
`0.0.4`. `^0.0.3` resolves to `0.0.3`, which is ordinary semver rather than a
defect — a caret pins the patch below `0.1.0`, so `^` is the wrong operator at
this version. A tarball URL genuinely cannot take a range; the git form can.

What the registry gives that the git form does not is one install path instead
of three, and no build on the consumer's machine. `npm pack` runs `prepack`,
`github:` runs `prepare`, and an `https://` tarball runs neither — which is why
a codeload pin cannot be moved forward at all. A registry serves a built
tarball. Weigh that against a classic token on every machine that installs.

### The token

A personal access token (classic) with `read:packages` and nothing else.
Generate it at Settings, Developer settings, Personal access tokens, Tokens
(classic).

In GitHub Actions, `secrets.GITHUB_TOKEN` reads a package published by the
**same repository**. It does not reach across repositories, so a workflow in
`stuffbucket/maximal` needs a classic token stored as a secret. Grant that
repository read access to the package from the package settings page, and the
token still has to carry `read:packages`.

## What you may depend on

Three things, and class names are not among them.

**The components** exported from `./renderer`, and their props. **The tokens**
in `docs/shell-variables.md`, which is derived from the stylesheet rather than
written by hand. **The content catalogue**, `SHELL_CONTENT`, which is data you
spread and replace.

The class names in `./renderer/styles.css` are an implementation detail. They
are how the package's own rules find its own elements, and they change when the
markup changes. Writing `.sb-shell .model-card { … }` in your application is
depending on something nobody promised.

This is a fair thing to ask because the package now ships the whole structural
ramp with values, so a consumer never has to reach past a token to get a size,
and because the rules sit in a cascade layer, so a rule of yours outside a
layer beats ours whatever its specificity. Before the layer, a colliding
selector was decided by source order and ours arrived last —
`packages/maximal/client` declared `.inspector__title` against this package's
`.sb-shell .inspector__title`, at (0,1,0) against (0,2,0), and its rule had
never once applied. Nothing reported an error, because a losing rule is not an
error. Atom shipped the same failure as issue #13019.

So if you find yourself needing a selector or an `!important` to get the result
you want, that is a missing token rather than a licence to reach in. Say which
one and it can be added; a token substitutes a value and cannot break the way a
selector can.

## Migrating from the unscoped name

The package was `stuffbucket-electron` through `v0.0.4`. Every form above names
`@stuffbucket/maximal-electron` from `v0.0.5`, including the git ref and the
release tarball, because the name is the package's identity rather than a
property of where it came from. `node_modules/stuffbucket-electron` becomes
`node_modules/@stuffbucket/maximal-electron`, and every import changes with it.

Three edits, in one commit:

1. Add the `.npmrc` above, and the token to CI and to the signing runner. Skip
   this if you are staying on the git ref or the release tarball.
2. Rename the dependency, and take a range if you took the registry.
3. Rewrite every import specifier. `stuffbucket-electron/host` becomes
   `@stuffbucket/maximal-electron/host`, and the same for `/main`, `/renderer`,
   `/renderer/styles.css`, `/host/terminal`, `/verify`, and
   `/verify/shell-variables`.

Every `exports` subpath keeps its shape, so only the package part of each
specifier moves. `sed -i 's|stuffbucket-electron/|@stuffbucket/maximal-electron/|g'`
over the source is the whole of step three.

Nothing published before the rename changes. A pin to `v0.0.4` or earlier keeps
resolving under the old name, so the migration happens when the consumer
chooses.

## The unsupported form

A codeload archive:

```
https://codeload.github.com/stuffbucket/maximal-electron/tar.gz/<sha>
```

npm treats that URL as a packed tarball. It is not one: codeload serves the
repository tree, and `dist/` is not in the tree. npm runs no lifecycle script
for an `https://` tarball dependency other than `install` and `postinstall`, so
nothing builds the package, and every entry in `exports` names a file the
install does not carry. An archive of `main` holds 287 entries and none of them
is under `dist/`.

A pin of this form that still works pins a commit older than #70, which is when
`dist/` stopped being committed. Moving that pin forward to any later commit
produces a package whose exports resolve to nothing. Use one of the three
supported forms instead.

### What happens if you use one anyway

`scripts/check-install.mjs` runs at `postinstall`, which is the one lifecycle
script npm runs for all four forms. It compares the `exports` map against the
files on disk and refuses the install:

```
@stuffbucket/maximal-electron@0.0.5: installed without a build step.

  7 of the 9 files this package's exports name are not here:
    ./dist/host/host-window.d.ts
    ./dist/host/host-window.js
    ...
```

`npm install` then exits 1. The failure is at install time rather than at your
compile step, which is the whole point of the guard. Issue #100.

`npm install --ignore-scripts` disables it, along with `prepare` for the git
form. A consumer who installs that way gets an unbuilt package from either form
and no warning, and that is the one case this cannot cover.

### The guard is transitional

It costs every consumer a `postinstall` on every install, permanently, for a
problem that is not permanent. A registry install is `npm pack` output by
construction, so it cannot reach the state the guard catches, and codeload
becomes a legacy hazard rather than a live one.

The condition for removing it is that `stuffbucket/maximal` consumes this
package from the registry, not that the registry publish works: the guard
protects a consumer who is on the broken path today. Issue #117 holds the
condition and what removal touches. The registry existing is the first half of
that condition, and it is what this train adds. The second half is `maximal`'s
migration, which is theirs to make.

## Why `dist/` is not committed

Committing it would make every form work, and #70 removed it for two reasons
that have not gone away. A tracked build artifact is rewritten by any build,
silently, because `.gitignore` stops applying once a file is tracked. And the
published export can then disagree with the source it was built from, which it
did: the `./renderer` export shipped one merged pull request behind `src/`.

## What checks this, and when

`npm run verify:git-install` installs a git ref into a scratch directory and
resolves every export, then archives the same ref and asserts the install of
that archive fails carrying the refusal above. Both halves run in the
`git-install` job on every pull request.

`node scripts/verify-git-install.mjs --tarball <url>` runs the export half
against a release asset. It needs a published release, so it runs by hand
before a cut rather than in CI. `.claude/skills/cut-release/SKILL.md` lists it.

`npm run verify:publish` reads the archive `npm pack` produces — the bytes, not
a file listing — and asserts the things a registry publish depends on: the name
is scoped to the account that owns the repository, `publishConfig` names the
registry, the file is named for the scoped package, and every `exports` target
inside the archive is a file with bytes in it. It runs on every dry run and on
every tag, before `npm publish`.

**That is everything answerable before a version exists in the registry.** The
registry equivalent of `verify:git-install` — install
`@stuffbucket/maximal-electron` from the registry and resolve every export — is
the real proof, and it cannot be written yet. It would have nothing to install,
and a check with nothing to check passes. It is the first thing to add after
the first publish lands, and `scripts/export-checks.mjs` already holds
everything it needs.

# Testing Strategy — maximal

**Status:** Rewritten when the proxy core was excavated. The previous 435-line
version described the proxy's own test architecture — the `bunfig.toml`
`[test] preload`, `tests/test-setup.ts`, its credential isolation and
module-mock discipline. None of that lives here any more. It moved with the
code, to `@stuffbucket/maximal-core`. Read that repository for it; the old text
is in this file's git history.

**Audience:** contributors who need one place that says what *this* repository
verifies, and where everything else went.

## What this repository is now

maximal composes three things it mostly does not implement:

- the proxy engine, from the `@stuffbucket/maximal-core` package
- the desktop shell, from the `stuffbucket-electron` package
- its own client, site, and release scripts

So the interesting tests are mostly *other repositories'*. What remains here
tests the seams and the things maximal genuinely owns.

## The two suites

| Suite | Runner | Scope |
| --- | --- | --- |
| root `tests/` | `bun test` | Release and packaging scripts: the homebrew formula sync, the macOS installer template, build verification |
| `client/` | `vitest` (+ Playwright for e2e) | The Electron client: renderer surfaces, the preload seam, and the `--shell-*` contract against the installed shell package |

Each is a separate install root and runs independently.

## What is worth knowing about each

**Root.** These are script tests, not service tests. They read fixtures and
assert on text and shape. They are fast and have no network, no server boot,
and no credential surface — which is why the elaborate isolation the old
document described is no longer needed here.

**Client.** `src/renderer/theme.test.ts` is the one to understand before
changing anything visual. It derives the required `--shell-*` variables from
the *installed* `stuffbucket-electron` package via that package's
`verify/shell-variables` export, and fails when `theme.ts` misses one. This
exists because a hand-maintained adapter previously drifted to 27 dead names
and 7 unset required ones with nothing noticing — the result still rendered a
plausible shell. Do not hand-edit the variable list; regenerate it.

## Gates

`bun run check:fast` is lint, typecheck and lint:all. `bun run check:deep`
adds `bun test` and `knip`. The client gate runs from its own root.

CI runs these per root; see `.github/workflows/ci.yml` and `client-ci.yml`.
The site and its tests are owned by
[`stuffbucket/maximal-site`](https://github.com/stuffbucket/maximal-site).

## Known weaknesses

- **No aggregate gate.** Three roots, three commands, and nothing asserts all
  three ran. A change touching two roots can land with one verified.
- **The seams are tested from one side.** The client checks itself against the
  installed shell contract. Nothing here checks maximal against a *new*
  maximal-core before pinning it; that pin is advanced by hand.
- **e2e is client-only.** There is no test that starts the proxy, starts the
  client against it, and asserts they agree.

# AGENTS.md

Root of the documentation DAG.

Every `AGENTS.md` here, including this one, uses the requirement keywords of
RFC 2119: MUST, MUST NOT, SHOULD, SHOULD NOT, MAY. A statement carrying none of
them is background. It explains a rule; it is not one, and it constrains
nothing.

## Documentation

Duplication hinders discovery.

- A fact MUST have exactly one owner. Search for that owner before writing the
  fact again; every other mention MUST link to it rather than restate it.
- A rule MUST state one requirement. Two weakly related requirements in one
  sentence hide whichever of them has no reason attached.
- A rule MUST name what breaks if it is not followed. One that states only a
  preference is a SHOULD.
- Two rules MUST NOT conflict. Resolve it by removing the exception, not by
  documenting it.
- A rule MUST NOT reference a file, directory, or command that does not exist.
- A claim backed by a check MUST record what was checked and what was not. An
  unqualified conclusion drawn from one sample reads as a general property.
- State that is transient by construction MUST NOT be recorded.
- Knowledge MUST NOT be spread across more than one subtree. The vendored
  copies under `packages/` are exempt: they come from separate upstream
  repositories and their overlap is inherent to the copy.
- Clauses that repeat verbatim SHOULD be collapsed into a list.
- A document SHOULD be reachable by link from this one.

The normal test boundary is documented in
[`docs/testing-in-docker.md`](docs/testing-in-docker.md).

## CI

Registry and toolchain versions may be mutated without notice, so a workflow
MUST pin what it depends on rather than resolve it.

In workflows:

- Runners MUST be ubuntu, windows, or macos-builder.
- github.com/stuffbucket/macos-builder MUST be used when an Apple ID is needed
  for signing or notarization.
- Node MUST be read from `.nvmrc`, which [SOURCES.md](SOURCES.md) makes the
  only place the version is named.
- `uses:` MUST reference a full 40-character commit SHA. Package integrity is a
  separate problem, owned by [SOURCES.md](SOURCES.md).

## Releases

[RELEASING.md](RELEASING.md) owns the process; these are the constraints on it.

- A release tag MUST match `vMAJOR.MINOR.PATCH` with an optional
  `-prerelease` suffix. macos-builder rejects any ref containing a slash or a
  non-numeric prefix, and it does so minutes after dispatch, having produced
  nothing and named no cause.
- A release tag MUST point at a commit contained in `main` or a `release/*`
  branch. The producer runs repository code on the self-hosted machine that
  holds the Developer ID, so any other tag runs unreviewed code there.
- The released version MUST come from the tag and MUST NOT be committed to a
  manifest. A second copy can disagree with the bundle that ships.
- A release MUST NOT be published before the Gatekeeper acceptance test has run
  on a Mac that has never held the signing identity. Notarization succeeding is
  not evidence that a user's Mac will open the app.
- The bundle identifier and the signing Team ID MUST NOT change between
  releases. macOS keys TCC grants, keychain ACLs and LaunchServices registration
  on the two together, so a change strands every installed copy: it keeps its
  own permissions and data, and the new build starts from nothing.
- A release MUST carry a `CFBundleVersion` of one to three period-separated
  integers, higher than the previous release's. LaunchServices stops parsing at
  the first non-digit, so a tag string leaves it unable to tell two installed
  copies apart.

## Sources

- [SOURCES.md](SOURCES.md) MUST be consulted before changing `./packages/**`.
- SOURCES.md MUST record:
  - agent workspace build rules
  - deviations from the upstream copies

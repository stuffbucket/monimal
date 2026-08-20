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

## Sources

- [SOURCES.md](SOURCES.md) MUST be consulted before changing `./packages/**`.
- SOURCES.md MUST record:
  - agent workspace build rules
  - deviations from the upstream copies

# AGENTS.md

This is the documentation DAG root.

Every `AGENTS.md` uses RFC 2119 keywords: MUST, MUST NOT, SHOULD, SHOULD NOT,
MAY. Documentation MUST NOT include nonbinding background.

## Documentation

- Facts MUST have one owner; other mentions MUST link to it.
- Rules MUST state one requirement and be compatible.
- Preferences SHOULD use SHOULD or MAY.
- Runtime behavior MUST be documented in code.
- Knowledge MUST live in one subtree, except vendored `packages/` copies from separate upstreams.
- Repeated clauses SHOULD be listed.

The normal test boundary is documented in
[`docs/testing-in-docker.md`](docs/testing-in-docker.md).

## Dependencies

- Use `pnpm` in package scripts.
- Workflows MUST pin dependencies rather than resolve registry or toolchain
  versions, which may be mutated without notice.
- Dependency registry and SBOM protections MUST be enforced in
  `.pnpmfile.cjs`; dependency-management policy MUST NOT rely on pnpm
  inference.
- `.pnpmfile.cjs` MUST handle the registry named in `.npmrc`.
- Node MUST come from `.nvmrc`; `packageManager` MUST own the pnpm version.
  `mise.toml` and `mise.lock` provide the local pnpm resolution and artifact
  checksums. [SOURCES.md](SOURCES.md) owns the toolchain policy.

## CI workflows:

- Runners MUST be ubuntu, windows, or macos-builder.
- `uses:` MUST use a full 40-character commit SHA; [SOURCES.md](SOURCES.md) owns package integrity.

## Sources

- [SOURCES.md](SOURCES.md) MUST be consulted before changing `./packages/**`.
- SOURCES.md MUST record:
  - agent workspace build rules
  - deviations from the upstream copies

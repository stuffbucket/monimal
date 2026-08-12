# AGENTS.md

## CI

- Do not use `runs-on: macos-*` in workflows. Use ubuntu instead.
- Use github.com/stuffbucket/macos-builder when an Apple ID is needed (signing
  and notarization) or macOS must be used in a workflow.
- Use node ^22 in workflows.
- Pin all external actions and dependencies in workflows to a SHA, never a
  version.

## Sources

- Record agent workspace build rules in [SOURCES.md](SOURCES.md).
- Agents consult SOURCES.md before changing `./packages/**`.
- Record deviations from the upstream copies in SOURCES.md.
- Do not restate SOURCES.md rules here.

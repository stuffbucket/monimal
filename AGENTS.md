# AGENTS.md

## CI

- Do not use `runs-on: macos-*` in workflows. Use ubuntu instead.
- Use github.com/stuffbucket/macos-builder when an Apple ID is needed (signing
  and notarization) or macOS must be used in a workflow.
- Use node ^22 in workflows.
- Pin all external actions and dependencies in workflows to a SHA, never a
  version.

## Sources

- Read [SOURCES.md](SOURCES.md) before changing anything under `packages/`. It
  records what those packages were copied from, and the rules that keep the
  workspace building.

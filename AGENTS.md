# AGENTS.md

Root of the documentation DAG.

## Documentation

- Look before you write.
- Do not repeat or restate information, in this file or any other. Duplication
  hinders discovery.
- Optimize for traversal. Link to the node that owns a fact; never copy it.
- Do not distribute knowledge across more than one subtree.

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

# AGENTS.md

Root of the documentation DAG.

## Documentation

Duplication hinders discovery.

- Look before you write.
- Do not repeat information, verbatim or semantically.
- Do not combine weakly related concepts into a single statement.
- Collapse clauses that repeat verbatim into a list.
- Do not distribute knowledge across more than one subtree.
- Link to the node that owns a fact.
- Optimize for traversal.

## CI

In workflows:

- Do not use `runs-on: macos-*`.
- Use ubuntu.
- Use node ^22.
- Pin external actions and dependencies to a SHA.
- Use github.com/stuffbucket/macos-builder when:
  - an Apple ID is needed for signing or notarization
  - macOS is required

## Sources

- Consult [SOURCES.md](SOURCES.md) before changing `./packages/**`.
- Record in SOURCES.md:
  - agent workspace build rules
  - deviations from the upstream copies

# AGENTS.md

Root of the documentation DAG.

## Documentation

Duplication hinders discovery.

- Look before you write.
- Do not repeat information, verbatim or semantically.
- Do not record state that is transient by construction.
- Do not combine weakly related concepts into a single statement.
- Collapse clauses that repeat verbatim into a list.
- Do not distribute knowledge across more than one subtree.
- Link to the node that owns a fact.
- Optimize for traversal.

## CI

Versions may be mutated without notice.

In workflows:

- Only use ubuntu, windows, or macos-builder as runners.
- Use github.com/stuffbucket/macos-builder when an Apple ID is needed for
  signing or notarization.
- Use node ^22.
- Pin dependencies by SHA.

## Sources

- Consult [SOURCES.md](SOURCES.md) before changing `./packages/**`.
- Record in SOURCES.md:
  - agent workspace build rules
  - deviations from the upstream copies

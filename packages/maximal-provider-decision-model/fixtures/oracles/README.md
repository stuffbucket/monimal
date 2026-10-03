# Recorded System One oracles

These fixtures make provider conformance tests deterministic and offline.
Tests validate both the recorded request and response against the named wire
profile and provider-neutral exchange semantics.

- `typesafe-jev-latest.json` records TypeSafe's published Jev 1.13 quick-start
  example.
- `typesafe-jev-preview.json` records the documented alias equivalence while
  `jev-preview` and `jev-latest` both resolve to `jev-1.13.0`.
- The Nimble and Tev fixtures are captured from a local Ollama 0.35 server and
  record the exact model digest and server version.

The fixture schema pins each source-specific metadata shape. Tests recompute
`response_sha256` as SHA-256 over `JSON.stringify(response)`, verify every
recorded Ollama model digest and size, and validate the documented Jev alias
relationship.

Recorded probabilities prove wire compatibility, not enduring model quality.
Live models may produce different calibrated values after an alias moves or a
runtime changes. Conformance assertions therefore require exact replay for a
recording and structural/range invariants for refreshed live captures.

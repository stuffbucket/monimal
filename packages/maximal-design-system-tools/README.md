# Maximal design-system tools

This package owns reusable design-system and stateful React analysis tooling.
Target projects own their components, stories, Storybook configuration, quality
configuration, and reviewed baselines.

Every command accepts the target project root explicitly:

```sh
maximal-ds-source-quality path/to/project
maximal-ds-api-check path/to/project
maximal-ds-policy-check path/to/project
maximal-storybook-check path/to/project
pulse path/to/component.tsx
```

Pulse is the React response analyzer. It accepts a single TypeScript React
implementation file, including stateless JSX components, and statically maps
state and effects in response to discovered handlers. It reports hook state,
finite domains, event handlers, asynchronous effects, explicit
`defineStateMachine` declarations when present, coupled state cross-products,
and conservative review candidates.

Pulse also derives a bounded browser event-response matrix:

- React event props are mapped to browser event names and JSX targets.
- Named, inline, capture-phase, and delegated handler expressions are retained.
- Relevant finite state domains produce coverage-oriented starting vectors.
- Literal, toggle, derived, absent, collection, and open-domain writes are
  classified without guessing runtime values.
- Branch guards classify writes as reachable, blocked, or runtime-conditional.
- Matrix limits are explicit: 16 vectors per binding and 256 per component.
- Unresolved and statically opaque bindings are listed as browser-probe
  candidates.

When a local story imports the implementation directly or through the target
package's public exports, Pulse discovers a workspace Storybook catalog,
launches or reuses it, and runs supported matrix stimuli in Chromium. Package
export discovery follows symbol-specific local re-export chains, including
conditional and wildcard subpath exports. Every probe reloads the story,
resolves one unambiguous DOM target, fingerprints the DOM before and after the
event, captures page errors, and classifies the observation as corroborated,
divergent, unobserved, opaque, ambiguous, unsupported, or missing. Runtime
probing remains observational: internal React hook values are not exposed by
production React, so a stable DOM does not by itself disprove a predicted
internal state transition.

A divergent response or browser runtime error is replayed twice in the same
story. Pulse reports and exits unsuccessfully for a component correctness
candidate only when all three observations agree. Missing fixtures, ambiguous
targets, stable DOM, and opaque effects remain explicitly inconclusive.

The focused matrix mutation suite is:

```sh
pnpm run mutate:pulse
```

The browser checker reads `quality.config.json` and the target's Storybook
configuration. It runs the target's own Storybook installation and writes its
report under the target root.

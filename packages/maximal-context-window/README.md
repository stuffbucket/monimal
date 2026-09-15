# @stuffbucket/maximal-context-window

An ASCII "defrag map" visualization of a traffic session's context window: for
each turn, a monospace grid of cells shows how much of the model's context
window was spent on input versus output tokens, alongside the model name,
context/input/output window sizes, and percent full.

This is a renderer-only consumer, like `@stuffbucket/maximal-observability`
which it is designed to be composed into. Shared chart structure, typography,
tooltips, and categorical palette tokens come from
`@stuffbucket/maximal-data-visualization`. It reads
`@stuffbucket/maximal-observability-contract` traffic types and does not
connect to Maximal Core, Electron IPC, or any transport itself; a host derives
sessions from its own `TrafficRequestSummary` list with `deriveContextSessions`
and renders `ContextWindowSessionPanel`.

Import `@stuffbucket/maximal-context-window/styles.css` once alongside the
React exports.

## Development

From the workspace root:

```sh
pnpm --filter @stuffbucket/maximal-context-window run typecheck
pnpm --filter @stuffbucket/maximal-context-window run lint
pnpm --filter @stuffbucket/maximal-context-window run build
pnpm --filter @stuffbucket/maximal-context-window run test
```

To see the visualization rendered in a real build against realistic fixture
sessions:

```sh
pnpm dev:context
```

This starts a Vite dev server (`lab/`) that mounts the package's real,
published `ContextWindowSessionPanel` component styled with the same
`--shell-*` palette the desktop client uses, backed by fixture traffic data
rather than a live backend.

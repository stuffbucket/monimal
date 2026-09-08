# @stuffbucket/maximal-observability-contract

A side-effect-free ESM package defining the versioned traffic-observability
boundary shared by collectors, stores, control transports, and consumers.

The package exports strict Zod schemas and inferred TypeScript types for request
metadata, filters, cursor pages, request details, overview aggregates, bounded
live invalidation hints, and passive observation callbacks. It represents only
plain serializable values and does not depend on a web framework, database,
desktop shell, UI framework, or Maximal runtime implementation.

Every serialized response and invalidation carries
`TRAFFIC_OBSERVABILITY_CONTRACT_VERSION`. Cursors are opaque. Invalidation hints
carry no query results; consumers re-read the affected request or overview
query. The passive observer methods return `void` and must not throw into or
otherwise control request processing.

## Development

From the workspace root:

```sh
pnpm --filter @stuffbucket/maximal-observability-contract run typecheck
pnpm --filter @stuffbucket/maximal-observability-contract run lint
pnpm --filter @stuffbucket/maximal-observability-contract run build
pnpm --filter @stuffbucket/maximal-observability-contract run test
```

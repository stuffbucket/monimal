# @stuffbucket/maximal-observability

Composable React surfaces for Maximal's embedded traffic dashboard. The package
provides overview metrics, filters, request history and detail views, token and
traffic-flow charts, and a bounded live-invalidation state layer.

This is a renderer-only consumer. Hosts supply an `ObservabilitySource` that
implements the versioned types from
`@stuffbucket/maximal-observability-contract`; this package does not connect to
Maximal Core, Electron IPC, SQLite, HTTP, OpenTelemetry, or SigNoz directly.
The host remains responsible for adapting its named read and subscription
capabilities to that interface.

Import `@stuffbucket/maximal-observability/styles.css` once alongside the React
exports. Live notifications are invalidation hints rather than query results;
the state layer re-reads the affected request or overview query.

## Development

From the workspace root:

```sh
pnpm --filter @stuffbucket/maximal-observability run typecheck
pnpm --filter @stuffbucket/maximal-observability run lint
pnpm --filter @stuffbucket/maximal-observability run build
pnpm --filter @stuffbucket/maximal-observability run test
```

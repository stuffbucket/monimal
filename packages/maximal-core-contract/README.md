# @maximal/maximal-core-contract

The wire contract between Maximal Core and its clients. It holds data shapes
only: its runtime dependencies are `zod` and
`@maximal/maximal-model-contract`, and it never reaches Core's engine.

| Entry point | Contents |
| --- | --- |
| `./settings` | Zod schemas and inferred types for the Settings API (ADR-0005), including the `AuthStatus` union (ADR-0006). |
| `./control` | The JSON-RPC control-plane envelope, error codes, and local-model operation types. |

Core republishes both entry points as `@maximal/maximal-core/settings-types`
and `@maximal/maximal-core/control-contract`. Workspace consumers import
this package directly, so they do not depend on Core.

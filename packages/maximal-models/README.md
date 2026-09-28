# @maximal/maximal-models

Model runtime orchestration for Maximal. This package loads profile-installed
Cordis/DSH adapters, reconciles their lifecycle, and exposes the resulting
`ProviderGateway` from `@maximal/maximal-model-contract`.

## Boundary

Concrete model runtime adapters are not dependencies of this package. They are
installed in a user-managed profile and loaded at runtime, which keeps adapter
replacement independent of Maximal releases.

Maximal Core depends only on `@maximal/maximal-model-contract`. The shipping
Maximal composition root supplies this orchestration package to Core.

## Development

From the workspace root:

```sh
pnpm --filter @maximal/maximal-models run typecheck
pnpm --filter @maximal/maximal-models run lint
pnpm --filter @maximal/maximal-models run build
pnpm --filter @maximal/maximal-models run test
```

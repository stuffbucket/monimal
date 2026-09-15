# @stuffbucket/maximal-models

Model runtime orchestration for Maximal. This package loads profile-installed
Cordis/DSH adapters, reconciles their lifecycle, and exposes the resulting
`ProviderGateway` from `@stuffbucket/maximal-model-contract`.

## Boundary

Concrete model runtime adapters are not dependencies of this package. They are
installed in a user-managed profile and loaded at runtime, which keeps adapter
replacement independent of Maximal releases.

Maximal Core depends only on `@stuffbucket/maximal-model-contract`. The shipping
Maximal composition root supplies this orchestration package to Core.

## Development

From the workspace root:

```sh
pnpm --filter @stuffbucket/maximal-models run typecheck
pnpm --filter @stuffbucket/maximal-models run lint
pnpm --filter @stuffbucket/maximal-models run build
pnpm --filter @stuffbucket/maximal-models run test
```

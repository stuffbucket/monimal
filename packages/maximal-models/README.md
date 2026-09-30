# @maximal/maximal-models

Provider plugin orchestration for Maximal. This package loads
profile-installed Cordis adapters, reconciles their lifecycle, and exposes the
resulting `ProviderGateway` from `@maximal/maximal-model-contract`.

## Boundary

Concrete model runtime adapters are not dependencies of this package. They are
installed in a user-managed profile and loaded at runtime, which keeps adapter
replacement independent of Maximal releases.

Maximal Core depends only on `@maximal/maximal-model-contract`. The shipping
Maximal composition root supplies this orchestration package to Core.

`ProviderPluginHost` and its reconcile types are Maximal-owned lifecycle
primitives. Cordis is the current in-process runtime implementation, not part
of the Core-facing gateway contract.

`PROVIDER_PLUGIN_API_VERSION` owns compatibility between a provider profile
and the host. New `providers.json` documents use schema version 3 and declare
`pluginApiVersion` explicitly. Schema versions 1 and 2 normalize to plugin API
version 1 so existing profiles remain compatible. Unknown plugin API versions
are rejected before any profile package is imported.

## Execution boundary

Provider packages currently execute in-process and are trusted with the
Maximal process's filesystem, network, environment, and OS-user authority.
Cordis scopes cooperative lifecycle resources; it does not sandbox JavaScript
or restrict ambient APIs.

Moving a plugin behind IPC would isolate crashes, globals, and module state,
but a child process running as the same user would retain access to the same
files and network. Supporting untrusted plugins therefore requires both:

- a versioned streaming provider protocol implementing `ProviderGateway`; and
- an OS-enforced least-privilege sandbox with an explicit filesystem,
  environment, network, and executable policy.

An isolated implementation should be another `ProviderGateway` backend. Core
and the localhost API must not depend on whether the selected gateway is
in-process or isolated.

## Development

From the workspace root:

```sh
pnpm --filter @maximal/maximal-models run typecheck
pnpm --filter @maximal/maximal-models run lint
pnpm --filter @maximal/maximal-models run build
pnpm --filter @maximal/maximal-models run test
```

# @stuffbucket/maximal-provider-contract

A pure ESM TypeScript contract between Maximal hosts and provider gateways. The
package contains types only and has no runtime dependency on Maximal, Cordis,
DSH, or any provider implementation.

## Boundary

`ProviderGateway` dispatches a `ProviderDispatch` made only from a provider ID,
a stable operation name, and Web Platform `Request` and `AbortSignal` objects.
It returns a Web Platform `Response`, preserving response streaming and caller
cancellation without introducing a framework-specific transport.

The stable operations are:

- `messages`
- `count-tokens`
- `models`

A gateway also exposes immutable provider status snapshots and topology
subscriptions. `subscribe` immediately delivers the current topology, then
future revisions until its idempotent unsubscribe function is called. `dispose`
is asynchronous and idempotent; no listener is called after it resolves.

The status and topology DTOs are deeply readonly. Their diagnostics use these
stable codes:

- `provider-missing`
- `provider-disabled`
- `provider-invalid`
- `provider-load-failed`
- `provider-activation-failed`
- `provider-conflict`
- `provider-disposal-failed`
- `provider-unavailable`

The contract deliberately defines neither a plugin ABI nor a plugin
configuration shape. Loading, activation, discovery, and configuration remain
implementation concerns behind `ProviderGateway`.

## Development

From the workspace root:

```sh
pnpm --filter @stuffbucket/maximal-provider-contract run typecheck
pnpm --filter @stuffbucket/maximal-provider-contract run lint
pnpm --filter @stuffbucket/maximal-provider-contract run build
pnpm --filter @stuffbucket/maximal-provider-contract run test
```

# @maximal/maximal-model-contract

A pure ESM TypeScript contract between Maximal and model runtime gateways. The
package contains types only and has no runtime dependency on Maximal, Cordis,
provider plugin orchestration, or any concrete model runtime.

## Boundary

`ProviderGateway` dispatches a `ProviderDispatch` made only from a provider ID,
a stable operation name, and Web Platform `Request` and `AbortSignal` objects.
It returns a Web Platform `Response`, preserving response streaming and caller
cancellation without introducing a framework-specific transport.

The stable operations are:

- `messages`
- `chat-completions`
- `responses`
- `embeddings`
- `systemone`
- `count-tokens`
- `models`

A gateway also exposes immutable provider status snapshots and topology
subscriptions. `subscribe` immediately delivers the current topology, then
future revisions until its idempotent unsubscribe function is called. `dispose`
is asynchronous and idempotent; no listener is called after it resolves.

Provider model descriptors may carry immutable runtime evidence for lifecycle,
selection, access, supported endpoints, complete limits, capabilities,
tokenizer pricing, and typed provider details. Shared evidence remains
provider-neutral; provider-only values use a discriminated details payload.
Token prices always carry their token batch and optional currency explicitly.
Invalid or unusable provider integers are retained as `null` evidence instead
of invalidating the containing model list. Provider-specific legacy billing
flags remain inside the discriminated provider-details payload.

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
pnpm --filter @maximal/maximal-model-contract run typecheck
pnpm --filter @maximal/maximal-model-contract run lint
pnpm --filter @maximal/maximal-model-contract run build
pnpm --filter @maximal/maximal-model-contract run test
```

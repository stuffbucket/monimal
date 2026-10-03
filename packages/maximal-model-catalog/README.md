# @maximal/maximal-model-catalog

Trusted consumer boundary for model catalogs released from
`stuffbucket/model-catalog`.

The package provides:

- strict schemas for the normalized catalog;
- indexed canonical-model, provider, and offering lookup;
- exact GitHub Release pin validation and a bounded, SHA-256-verifying Node
  loader;
- reconciliation of live cloud and local observations without allowing
  descriptive catalog data to override runtime authority.

Runtime observations retain normalized lifecycle, selection, access, endpoint,
limit, capability, and pricing evidence. Reconciliation resolves runtime
evidence before provider-offering and canonical catalog values. Provider-only
residue remains in a discriminated details payload. Live price schedules keep
their declared token batch and currency (including an unknown currency)
explicit, so ambiguous provider amounts are never relabeled as canonical USD
prices. Malformed runtime integers remain `null` in the retained evidence while
resolved inventory limits may fall back to reviewed offering or canonical
values. Legacy flat rates are one separate million-token tier and are never
merged field-by-field into a provider's tiered prices.

The default export is runtime-neutral. Import `@maximal/maximal-model-catalog/node`
only from a Node host that is responsible for downloading a pinned release.

`MAXIMAL_MODEL_CATALOG` is the reviewed first-party supplement for identities
owned by Maximal integrations rather than the upstream release. Consumers MUST
use it as lookup data during reconciliation; it MUST NOT override live runtime
availability, routing, provisioning, or capability evidence. The supplement
currently owns the canonical GLiNER2.5 identities and the
`maximal-gliner25` provider offerings.

Pinned model revisions, artifact hashes, download approval, and installed
state remain runtime facts owned by `gliner-runner`; the descriptive catalog
MUST NOT duplicate or override them.

## Development

From the workspace root:

```sh
pnpm --filter @maximal/maximal-model-catalog run typecheck
pnpm --filter @maximal/maximal-model-catalog run lint
pnpm --filter @maximal/maximal-model-catalog run build
pnpm --filter @maximal/maximal-model-catalog run test
```

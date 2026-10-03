# Maximal GLiNER2.5 Provider

`@maximal/maximal-provider-gliner25` adapts Maximal's provider-neutral
`classify-labels` runner operation to the standalone
[`gliner-runner`](https://github.com/stuffbucket/gliner-runner) HTTP API.

The package owns transport adaptation, not tensor execution or System One
answer semantics:

```text
POST /v1/systemone
  -> maximal-provider-decision-model
  -> maximal-provider-gliner25
  -> gliner-runner HTTP API
  -> PyTorch, MLX, or another explicitly selected backend
```

The backend, precision, service URL, and optional Maximal-to-runner model
mapping are explicit. The provider never changes profiles or retries through a
different backend. It forwards task instructions, label descriptions, ordinal
semantics, cancellation, and exact encoded-token usage.

```ts
import { Gliner25Provider } from "@maximal/maximal-provider-gliner25"

const provider = new Gliner25Provider({
  baseUrl: "http://127.0.0.1:8090",
  backend: "pytorch",
  precision: "fp16",
  resolveRunnerModel: () => "decide-340m",
})
```

The configured runner MUST implement the response `usage` contract and the
optional classification `label_descriptions` request field. Malformed output,
missing labels, mismatched model/profile identities, and structured runner
errors fail explicitly.

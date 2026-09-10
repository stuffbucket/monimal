# maximal-harness

`@stuffbucket/maximal-harness` owns the local coding-agent feature shared by desktop hosts. It does not own application IPC names, Electron lifecycle, window creation, shortcuts, or packaged paths.

## Exports

- `@stuffbucket/maximal-harness` — transport-safe request, event, provider, and approval contracts.
- `@stuffbucket/maximal-harness/host` — provider discovery, agent execution, approval handling, model storage, and utility-process supervision.
- `@stuffbucket/maximal-harness/renderer` — the transport-driven `Overlay` component.
- `@stuffbucket/maximal-harness/worker` — the embedded llama utility-process entry point.
- `@stuffbucket/maximal-harness/packaging` — deterministic worker, backend, and source-pruning policy.
- `@stuffbucket/maximal-harness/verify` — packaged-tree checks for the worker and llama.cpp runtime.
- `@stuffbucket/maximal-harness/styles.css` — overlay styles composed from the public maximal-electron shell contract.

[docs/agent.md](./docs/agent.md) owns the provider, approval, worker, packaging, and shutdown rules.

A host must configure the agent, model directory, and worker path before accepting requests. The host also supplies the concrete transport and owns validation and sender authorization.

# maximal-harness

`@maximal/maximal-harness` owns the local coding-agent feature shared by desktop hosts. It does not own llama.cpp, application IPC names, Electron lifecycle, window creation, shortcuts, or packaged paths.

## Exports

- `@maximal/maximal-harness` — transport-safe request, event, provider, and approval contracts.
- `@maximal/maximal-harness/host` — provider discovery, agent execution, and approval handling.
- `@maximal/maximal-harness/renderer` — the transport-driven `Overlay` component.
- `@maximal/maximal-harness/styles.css` — overlay styles composed from the public maximal-electron shell contract.

[docs/agent.md](./docs/agent.md) owns the provider, approval, and shutdown rules.

A host must configure the agent before accepting requests. The host also supplies the concrete transport and owns validation and sender authorization.

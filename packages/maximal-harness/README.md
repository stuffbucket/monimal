# maximal-harness

`@maximal/maximal-harness` owns the local coding-agent feature shared by desktop hosts. It does not own llama.cpp, application IPC names, Electron lifecycle, window creation, shortcuts, or packaged paths.

## Exports

- `@maximal/maximal-harness` — transport-safe request, event, provider, and approval contracts.
- `@maximal/maximal-harness/host` — provider discovery, agent execution, and approval handling.
- `@maximal/maximal-harness/renderer` — the transport-driven `Overlay` component.
- `@maximal/maximal-harness/styles.css` — overlay styles composed from the public maximal-design-system styles and tokens.

[docs/agent.md](./docs/agent.md) owns the provider, approval, and shutdown rules.

A host must configure the agent before accepting requests. The host also supplies the concrete transport and owns validation and sender authorization.

## Pulse analysis

Operational renderer state MUST use `defineStateMachine` declarations reachable
through local imports from the implementation that consumes the machine.

The analyzer MUST receive only the implementation file path:

```sh
pnpm pulse packages/maximal-harness/src/renderer/Overlay.tsx
```

Pulse is provided by
`@maximal/maximal-design-system-tools`; this package owns only the assistant
implementation and its integration assertions.

Pulse validates declared events, transition targets, reachability, and
duplicate machine identities. It writes a Markdown report containing the
explicit Graphviz graph, React state domains, handler effects, asynchronous
transport paths, coupled cross-products, and conservative risk candidates.

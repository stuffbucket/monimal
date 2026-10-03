# Agent runtime

`@maximal/maximal-harness` owns provider discovery, the coding-agent loop,
the approval gate, and the transport-driven overlay.
`@maximal/maximal-runner-llama-cpp` owns embedded model management and
utility-process supervision. The application owns IPC names, request
validation, sender authorization, panel creation, shortcuts, lifecycle, worker
bundle paths, and native package mutation.

- **Never add a user-supplied or persisted API key.** Discovery finds maximal
  or Ollama on loopback. A Maximal terminal MAY inject its ephemeral traffic
  scope through `STUFFBUCKET_PROVIDER_API_KEY`; the harness MUST send that
  credential only to the loopback Maximal endpoint.
- `buildTools` binds the execution context that pi's plain `Agent` does not
  supply. Keep that bridge.
- A run streams through `AgentSink`. Do not turn `runAgent` into a buffered
  response.
- The host must reserve a run before provider discovery starts. Two runs must
  never share the singleton approval and event state.
- `src/constants.ts` owns runtime tuning values and human-facing copy. Keep
  protocol discriminants and schema vocabulary with their contracts.

## Model selection

`discoverProvider` MUST catalogue every model reported by maximal on
`localhost:4141`, Ollama on `localhost:11434`, and every GGUF file in the
embedded model directory. Provider-qualified model keys MUST be stored as the
preferred-model application setting.

When the preferred model exists, discovery MUST select it. When it does not
exist and alternatives are available, discovery MUST require the overlay to
show and focus its model picker. When no model is available from any provider,
the overlay MUST offer the small embedded download.

The fallback is Qwen3 0.6B with an 8,192-token context window. Its weights are
downloaded to the model directory supplied by the host and are not part of the
application package. A completed fallback download MUST select and persist the
downloaded model.

The maximal catalogue MUST use the Anthropic model-list shape so the overlay
can show the provider's display name, context window, and reasoning capability
without model-name guessing. Reasoning-capable models MUST expose low, medium,
and high effort. The selected effort MUST be sent as pi's `thinkingLevel`;
models without reasoning support MUST NOT show an effort control.

`STUFFBUCKET_PROVIDER` may pin `maximal`, `ollama`, or `embedded`. A pin MUST
select the preferred or first available model for that provider. A pinned HTTP
backend that does not answer reports unavailable instead of falling through.
`STUFFBUCKET_MODEL_PATH` may name weights already on disk.

`STUFFBUCKET_PROVIDER_URL` applies only when the pin names `maximal` or
`ollama`. `src/host/provider-endpoint.ts` accepts only HTTP or HTTPS on
`localhost`, `127.0.0.1`, or `[::1]`. An address without a matching pin changes
nothing.

`STUFFBUCKET_PROVIDER_API_KEY` supplies an ephemeral traffic-scope credential
for a pinned Maximal terminal. Discovery and pi model requests MUST use it for
Maximal only. Ollama and ordinary desktop runs MUST retain the keyless local
backend behavior.

## Two engines, one gate

The maximal and Ollama paths use pi. The embedded path uses llama.cpp and its
own tool loop. Both paths use the same risk classification, approval callback,
and event sink.

Tool events MUST include the engine's stable tool-call identifier. The overlay
MUST retain bounded completed and failed activity instead of replacing one
global tool label. Partial tool arguments MUST NOT be sent to the renderer.

`@maximal/maximal-runner-llama-cpp/worker` is the only source that loads
`node-llama-cpp`. It
runs in an Electron `utilityProcess` because a native abort cannot be caught by
the application process. `@maximal/maximal-runner-llama-cpp/host` supervises that process.
Never add a second runtime import path.

The llama.cpp package translates TypeBox schemas into the grammar shape
llama.cpp accepts. A schema it cannot express drops the tool rather than
running it unconstrained.

## Approval gate

The gate in `src/host/agent.ts` is the only boundary between a model and local
tools.

1. Timeout, abort, dismissal, and failed runs deny pending calls.
2. `src/host/approval.ts` stays runtime-neutral and mutation tested.
3. `riskOf` classifies an unknown tool as dangerous.
4. Remember applies only to an allow and only to the active run.

The application validates its configured approval policy. The harness accepts
only the three `AgentApproval` values in its typed options.

## Shutdown

The host must call `shutdownAgent` before stopping the worker supervisor. It
must await that shutdown before allowing Electron to quit. A one-shot
`before-quit` guard prevents the deferred second quit from starting shutdown a
second time.

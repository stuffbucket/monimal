# Agent runtime

`@stuffbucket/maximal-harness` owns provider discovery, the coding-agent loop,
the approval gate, embedded model management, utility-process supervision, and
the transport-driven overlay. The application owns IPC names, request
validation, sender authorization, panel creation, shortcuts, lifecycle, worker
bundle paths, and native package mutation.

- **Never add an API key.** Discovery finds maximal or Ollama on loopback. A key
  in this package is a defect.
- `buildTools` binds the execution context that pi's plain `Agent` does not
  supply. Keep that bridge.
- A run streams through `AgentSink`. Do not turn `runAgent` into a buffered
  response.
- The host must reserve a run before provider discovery starts. Two runs must
  never share the singleton approval and event state.

## Provider chain

`discoverProvider` uses this order:

1. maximal on `localhost:4141`.
2. Ollama on `localhost:11434`, using a model returned by `/api/tags`.
3. Embedded Qwen3 0.6B.

Embedded is the offline floor, not the default. Its weights are downloaded to
the model directory supplied by the host and are not part of the application
package.

`STUFFBUCKET_PROVIDER` may pin `maximal`, `ollama`, or `embedded`. A pinned HTTP
backend that does not answer reports unavailable instead of falling through.
`STUFFBUCKET_MODEL_PATH` may name weights already on disk.

`STUFFBUCKET_PROVIDER_URL` applies only when the pin names `maximal` or
`ollama`. `src/host/provider-endpoint.ts` accepts only HTTP or HTTPS on
`localhost`, `127.0.0.1`, or `[::1]`. An address without a matching pin changes
nothing.

## Two engines, one gate

The maximal and Ollama paths use pi. The embedded path uses llama.cpp and its
own tool loop. Both paths use the same risk classification, approval callback,
and event sink.

`src/worker/index.ts` is the only source file that loads `node-llama-cpp`. It
runs in an Electron `utilityProcess` because a native abort cannot be caught by
the application process. `src/host/llama-host.ts` supervises that process.
Never add a second runtime import path.

`src/worker/grammar.ts` translates TypeBox schemas into the grammar shape
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

## Packaging

`@stuffbucket/maximal-harness/packaging` owns the worker filename, target
prebuild selection, optional GPU backend policy, and compile-only source list.
`@stuffbucket/maximal-harness/verify` checks those decisions against a packaged
file tree. The application owns Forge hooks, dependency closure copying,
`asar.unpack`, target pruning, and the concrete worker target.

The worker passes `build: 'never'` to `getLlama`. Packaging may remove only the
source inputs listed by the packaging export; llama grammar files remain runtime
inputs.

## Shutdown

The host must call `shutdownAgent` before stopping the worker supervisor. It
must await that shutdown before allowing Electron to quit. A one-shot
`before-quit` guard prevents the deferred second quit from starting shutdown a
second time.

# maximal-llama-cpp

`@maximal/maximal-llama-cpp` MUST own the llama.cpp model lifecycle, Electron
utility-process supervisor, worker runtime, protocol, native dependency, and
packaging policy.

## Exports

- `@maximal/maximal-llama-cpp` MUST expose model provisioning and progress
  contracts.
- `@maximal/maximal-llama-cpp/host` MUST expose Electron host integration and
  the structured-clone engine protocol.
- `@maximal/maximal-llama-cpp/worker` MUST remain the only runtime import path
  for `node-llama-cpp`.
- `@maximal/maximal-llama-cpp/packaging` MUST own target prebuild selection,
  optional GPU backend policy, and compile-only source inputs.
- `@maximal/maximal-llama-cpp/verify` MUST validate those decisions against a
  packaged application tree.

The host MUST configure the model directory and worker path before accepting
requests. The host MUST stop the engine during application shutdown.
The host MUST inventory regular GGUF files in that directory and select only
an exact filename from that inventory. The default Qwen3 0.6B fallback MUST use
an 8,192-token context window.

The worker MUST pass `build: 'never'` to `getLlama`. Packaging MAY remove only
the source inputs listed by the packaging export.

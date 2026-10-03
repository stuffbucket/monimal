# maximal-runner-llama-cpp

`@maximal/maximal-runner-llama-cpp` MUST own the llama.cpp model lifecycle, Electron
utility-process supervisor, worker runtime, protocol, native dependency, and
packaging policy.

The root export MUST expose the engine-neutral model-runner contract. Requests
MUST identify their operation explicitly. Generation, candidate-token scoring,
and label classification MUST retain distinct request and result shapes.
Backends MUST advertise the operations they implement and MUST reject an
unsupported operation rather than translating it silently.

## Exports

- `@maximal/maximal-runner-llama-cpp` MUST expose model provisioning and progress
  contracts.
- `@maximal/maximal-runner-llama-cpp/host` MUST expose Electron host integration and
  the structured-clone engine protocol.
- `@maximal/maximal-runner-llama-cpp/worker` MUST remain the only runtime import path
  for `node-llama-cpp`.
- `@maximal/maximal-runner-llama-cpp/packaging` MUST own target prebuild selection,
  optional GPU backend policy, and compile-only source inputs.
- `@maximal/maximal-runner-llama-cpp/verify` MUST validate those decisions against a
  packaged application tree.

The host MUST configure the model directory and worker path before accepting
requests. The host MUST stop the engine during application shutdown.
The host MUST inventory regular GGUF files in that directory and select only
an exact filename from that inventory. The default Qwen3 0.6B fallback MUST use
an 8,192-token context window.

The worker MUST pass `build: 'never'` to `getLlama`. Packaging MAY remove only
the source inputs listed by the packaging export.

`LlamaCppModelRunner` MUST implement `score-token-candidates` through the same
supervised utility process used by generation. Callers MUST resolve a model
identity to a GGUF path, context size, and optional model-specific system
prompt. The worker MUST render the GGUF chat template, require every candidate
to be exactly one token, and return candidate next-token probabilities. Label
classification MUST remain a separate runner capability because GLiNER2.5 is
an encoder model and cannot execute in llama.cpp.

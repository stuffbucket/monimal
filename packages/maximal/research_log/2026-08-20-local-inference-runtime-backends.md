# Local inference runtime research: oMLX and llama.cpp

Date: 2026-08-20

Scope: native local-model inference for Apple Silicon and Windows machines with
NVIDIA, AMD, Intel, or CPU-only hardware. This is an investigation record, not
an architecture decision. It records details that are easy to lose once the
runtime shortlist has been reduced.

Method: reviewed the current upstream repositories and runtime documentation for
oMLX, llama.cpp, MLX-LM, SGLang, LMCache, ExLlamaV3, MLC LLM, ONNX Runtime
GenAI, OpenVINO GenAI, vLLM, and TensorRT-LLM. No local benchmark or packaged-app
spike informed this initial comparison. A subsequent same-day signed-app smoke
test is recorded in [the oMLX 0.6.3rc2 smoke-test note](2026-08-20-omlx-smoke-test.md);
performance claims below remain architectural expectations or upstream claims,
not measurements of maximal.

## Bottom line

Start with two independent backend packages:

1. **oMLX for Apple Silicon.** It is a complete MLX-based server whose unusual
   advantage is block-paged, copy-on-write KV caching across RAM and SSD. It is
   directly aimed at long-lived coding-agent workloads with large repeated
   prefixes.
2. **llama.cpp for the portable backend.** Its GGUF ecosystem and Metal, CUDA,
   HIP, Vulkan, SYCL, and CPU backends cover the Windows hardware matrix and
   provide a fallback on macOS.

The package boundary should follow the runtime boundary. oMLX is a Python/MLX
server with macOS-specific native kernels and distribution machinery;
llama.cpp is a C/C++ executable/library with a different model format, build
matrix, cache model, and release cadence. Combining their installers or native
bindings into one package would couple unrelated failure and update surfaces.

No package names or shared abstraction are chosen here. Neither package exists
yet. A shared contract should be extracted only after the first two adapters
show which lifecycle and capability fields are actually common.

## Why oMLX, not merely MLX-LM

[oMLX](https://github.com/jundot/omlx) is an Apache-2.0 inference server created
in February 2026 for Apple Silicon. It uses MLX-LM for model execution but adds
the serving behavior that matters for a desktop agent:

- continuous batching;
- an engine pool with model pinning, TTLs, LRU eviction, and a process memory
  guard;
- OpenAI- and Anthropic-shaped HTTP APIs;
- block-paged KV allocation with prefix sharing and copy-on-write;
- a hot in-memory KV tier and a cold SSD tier;
- model discovery and management; and
- prefill and generation measurements, including partial-prefix-cache tests.

The cold tier serializes evicted KV blocks as safetensors. A later request with
a matching prefix can restore those blocks instead of recomputing the prefix,
and the cache can remain useful after the server restarts. This is materially
different from merely retaining one conversation's in-process KV tensors.

The likely high-value workload is not a short standalone chat. Coding agents
repeatedly resend a mostly stable prefix containing system instructions, tool
definitions, conversation history, repository instructions, and previously read
files. Reusing that prefix principally reduces prefill work and time to first
token.

It does **not** proportionally accelerate generation of new tokens. Decode speed
is still dominated by model architecture, quantization, kernels, and memory
bandwidth. Any benchmark must report prefill/TTFT and decode throughput
separately.

### oMLX constraints that are easy to miss

- It requires Apple Silicon and macOS 15 or newer. The documented Python range
  is 3.11 through 3.13.
- It consumes MLX-format models, not GGUF files. The same logical model may need
  a separate download and quantization for each backend.
- A plain editable Python install does not build oMLX's optional custom Metal
  kernels. Affected model families silently fall back to slower and sometimes
  more memory-hungry paths. The upstream DMG ships those kernels precompiled;
  the documented source/Homebrew path needs the Metal toolchain and full Xcode.
- The packaged macOS application is a SwiftUI shell around a bundled Python
  environment. Upstream uses `venvstacks` for that environment. Treat embedding,
  launching an external installation, and redistributing an upstream bundle as
  three different packaging options; licensing compatibility alone does not
  establish that any one is operationally suitable.
- oMLX pins MLX and several MLX ecosystem dependencies tightly, including some
  dependencies by Git commit. Its native kernel binaries are ABI-coupled to the
  pinned MLX version. The adapter package should own runtime-version probing and
  reject an incompatible external installation rather than assuming that any
  `omlx` binary is interchangeable.
- SSD-backed KV data survives process restarts. Treat it as sensitive derived
  user data. A packaged integration needs explicit retention, size, location,
  permissions, and deletion behavior rather than inheriting an invisible
  forever-cache default.
- Cache reuse is model- and token-sequence-specific. Changes to the model,
  tokenizer, chat template, adapters, context/RoPE settings, or cache schema can
  invalidate apparent prefix matches. The runtime should own raw KV identity;
  the application should not attempt to exchange KV artifacts with another
  backend.

## Why llama.cpp remains the portable first backend

[llama.cpp](https://github.com/ggml-org/llama.cpp) is older than the alternatives
considered here, but no newer runtime currently combines its model availability,
native portability, low-bit CPU support, and mixed CPU/GPU execution.

Relevant upstream backends include:

- Metal and Accelerate on Apple Silicon;
- CUDA on NVIDIA GPUs;
- HIP on AMD GPUs;
- Vulkan across multiple GPU vendors;
- SYCL on Intel GPUs; and
- optimized CPU paths, including ARM and x86.

`llama-server` exposes chat completions, Responses, embeddings, reranking,
multimodal requests, schema-constrained output, slots, and metrics through one
server. Its OpenAI compatibility is intentionally pragmatic rather than a claim
of complete conformance, so the adapter must test the subset maximal uses.

### llama.cpp caching is stronger than the usual summary suggests

llama.cpp is not cache-free. The current server supports:

- common-prefix prompt reuse;
- a RAM prompt-cache budget;
- context checkpoints;
- saving idle slots into the prompt cache;
- configurable K and V cache quantization;
- chunk reuse through KV shifting;
- explicit slot save, restore, and erase operations; and
- static or dynamic lookup caches for lookup/speculative decoding.

This is sufficient for a portable first implementation and gives the benchmark
a meaningful baseline. The distinction is that oMLX makes persistent,
automatic RAM-to-SSD KV tiering and prefix restoration a central serving model;
llama.cpp exposes lower-level prompt/slot cache controls and does not present the
same automatic cold-cache hierarchy.

Persistent llama.cpp slot files carry the same privacy and invalidation concerns
as oMLX's SSD tier. They should not be enabled merely because the endpoint makes
them available.

### Windows backend selection remains a benchmark question

A single llama.cpp package can manage different native builds, but the execution
backend should remain visible as a capability and diagnostic value:

- NVIDIA should normally begin with CUDA.
- AMD needs an empirical HIP-versus-Vulkan comparison on the supported Windows
  cards. Backend availability does not prove equal kernel coverage or speed.
- Intel discrete GPUs can test SYCL and Vulkan; CPU fallback must remain valid.
- CPU-only behavior matters because GPU discovery, drivers, and memory
  allocation can fail after installation even on nominally supported machines.

Do not market “Windows GPU support” from one successful card. Record the model,
quantization, driver, backend, prompt length, context size, and offload settings
for every measured result.

## Package boundary implications

Each backend package should own only runtime-specific concerns:

- installation discovery and version/capability probing;
- bundled or downloaded native artifacts;
- model-format recognition;
- server process startup, health, shutdown, and crash diagnostics;
- translation from the runtime's HTTP/event dialect;
- cache configuration and deletion hooks; and
- backend-specific metrics.

The caller should initially depend on the smallest common behavior needed to run
a request: enumerate usable models, start or connect to a server, stream a
response, cancel it, report capabilities, and stop a process it owns. Avoid a
large universal inference interface that encodes options only one runtime
understands.

Run each backend behind a process boundary first. oMLX already speaks HTTP and
llama.cpp ships `llama-server`; an FFI design would add Python embedding on one
side and native ABI churn on the other without proving that HTTP is the
bottleneck. Loopback transport overhead should be measured before replacing the
process boundary.

Model storage should acknowledge that formats are not interchangeable:

- oMLX uses MLX-format model directories;
- llama.cpp uses GGUF; and
- equal nominal bit widths do not imply equal quantization quality or memory
  use.

A future shared model catalog can relate equivalent artifacts, but it must not
pretend that one downloaded weight file serves both packages.

## Cache layers must not be conflated

Four caches may exist in the product and have different ownership:

1. **Artifact cache:** downloaded models, compiled kernels, shaders, and native
   runtime bundles. Keyed by exact runtime and artifact identity.
2. **Loaded-model cache:** weights retained in memory to avoid startup and model
   swaps. Controlled by memory pressure, pinning, TTL, and runtime policy.
3. **Prompt/KV cache:** attention state for an exact token prefix. Owned by the
   inference runtime and not portable between backends.
4. **Completed-response cache:** an application-level result for an identical
   request. This is backend-independent in principle but must include model
   revision, sampling parameters, tools/schema, adapters, and all prompt input
   in its key. It is useful only where replaying a previous stochastic answer is
   semantically valid.

A result that advertises “cache speedup” must identify which layer was warm.
Warm model weights, a full KV prefix hit, and a repeated completed response are
not comparable outcomes.

## Alternatives investigated but not selected for the first slice

| Runtime                                                                           | Useful property                                                            | Why it is not the first two-package baseline                                                                                                                                             |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [MLX-LM](https://github.com/ml-explore/mlx-lm)                                    | Direct, flexible Apple-native model execution                              | oMLX already builds on it and contributes the persistent serving/cache behavior sought here. A direct MLX-LM package remains a fallback if oMLX's server or packaging proves unsuitable. |
| [SGLang](https://github.com/sgl-project/sglang)                                   | RadixAttention makes shared-prefix KV reuse fundamental to scheduling      | Strong Linux GPU server, weak fit for native Apple Silicon and broad native Windows distribution. It remains relevant for a later WSL/Linux service backend.                             |
| [LMCache](https://github.com/LMCache/LMCache)                                     | Tiered reusable KV storage across GPU, RAM, SSD, and remote stores         | Middleware for engines such as vLLM, not a model executor or desktop-wide replacement.                                                                                                   |
| [ExLlamaV3](https://github.com/turboderp-org/exllamav3)                           | NVIDIA-specific low-bit decode speed and VRAM density through EXL3         | CUDA-only and a third model format. It is the strongest likely follow-up if llama.cpp leaves significant NVIDIA performance on the table.                                                |
| [ONNX Runtime GenAI](https://github.com/microsoft/onnxruntime-genai) / Windows ML | Windows execution-provider abstraction across DirectML and vendor backends | Attractive broad Windows integration, but adds ONNX conversion and does not yet displace llama.cpp's GGUF availability as the initial portable baseline.                                 |
| [OpenVINO GenAI](https://github.com/openvinotoolkit/openvino.genai)               | Intel CPU, Arc/iGPU, and Core Ultra NPU access                             | Important future Intel-specific package if NPU or power efficiency justifies another artifact format.                                                                                    |
| [MLC LLM](https://github.com/mlc-ai/mlc-llm)                                      | Compiled deployment across Metal, CUDA, ROCm, Vulkan, WebGPU, and mobile   | Per-target conversion/compilation is more operationally expensive than GGUF, and no checked evidence established a universal desktop speed win.                                          |
| [vLLM](https://github.com/vllm-project/vllm)                                      | Continuous batching and high concurrent serving throughput                 | Primarily a Linux serving choice; aggregate throughput is not the same target as one local interactive user.                                                                             |
| [TensorRT-LLM](https://github.com/NVIDIA/TensorRT-LLM)                            | Peak tuned NVIDIA serving on supported hardware and precisions             | Hardware/version coupling and deployment complexity are disproportionate for the portable first backend.                                                                                 |
| [KTransformers](https://github.com/kvcache-ai/ktransformers)                      | CPU/GPU expert offload for MoE models too large for VRAM                   | Specialized high-RAM workstation path, not a general local runtime.                                                                                                                      |

Ollama, LM Studio, KoboldCpp, and llamafile were not treated as independent
execution engines for this comparison because their relevant local inference
paths package or build on llama.cpp. FlashInfer is a kernel library. Mooncake,
NVIDIA Dynamo, and llm-d are cache/routing/orchestration layers above execution
engines rather than desktop replacements.

## Benchmark needed before promoting the baseline

Test the adapter and runtime, not just an upstream CLI. At minimum record:

- exact machine, OS, driver, and runtime build;
- exact logical model revision and backend-specific artifact;
- quantization method and measured artifact size;
- context limit and KV-cache type;
- cold model-load time;
- uncached prompt processing throughput and TTFT;
- full-prefix and partial-prefix cache-hit TTFT;
- oMLX hot-RAM versus cold-SSD restoration;
- post-restart cache restoration;
- decode tokens per second after prefill;
- peak process memory and GPU/unified-memory use;
- cache disk growth and eviction behavior;
- one request versus two or more concurrent requests; and
- output-quality checks sufficient to catch a faster but materially worse
  quantization.

Use at least three prompt shapes: short interactive chat, a long stable prefix
with a changing suffix, and a coding-agent turn whose tool output mutates the
middle or tail of the context. The last case tests whether advertised prefix
reuse survives realistic conversation changes rather than only an identical
prompt replay.

The first Apple comparison should be oMLX with cold, hot, and SSD-restored cache
states against llama.cpp Metal. The first Windows comparison should keep
llama.cpp and the GGUF fixed while comparing the applicable CUDA, HIP, Vulkan,
SYCL, and CPU paths. Cross-format oMLX-versus-GGUF results must be reported as a
product comparison, not as proof that one kernel stack alone caused the result.

## Open questions for the implementation spike

- Can the packaged application rely on an independently installed oMLX, or must
  it ship and update a known-compatible runtime?
- Does oMLX expose enough cache inventory and deletion control for product-level
  privacy settings, or will lifecycle control require filesystem ownership?
- What cache hit identity is observable through each server, and can diagnostics
  distinguish no match, invalidation, hot hit, and SSD restore?
- How large and write-heavy does the oMLX SSD tier become during a realistic week
  of agent use?
- Which llama.cpp Windows binaries can be distributed without multiplying the
  package matrix beyond what support and CI can exercise?
- Is HTTP streaming overhead measurable relative to local token latency? If not,
  preserve the process boundary.
- At what observed NVIDIA performance gap would an ExLlamaV3 package earn its
  additional EXL3 artifact and support cost?

## Primary sources

- [oMLX repository and README](https://github.com/jundot/omlx)
- [llama.cpp repository](https://github.com/ggml-org/llama.cpp)
- [llama-server documentation](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
- [MLX-LM repository](https://github.com/ml-explore/mlx-lm)
- [SGLang launch and RadixAttention overview](https://lmsys.org/blog/2024-01-17-sglang/)
- [LMCache repository](https://github.com/LMCache/LMCache)
- [ExLlamaV3 repository](https://github.com/turboderp-org/exllamav3)
- [ONNX Runtime GenAI repository](https://github.com/microsoft/onnxruntime-genai)
- [OpenVINO GenAI repository](https://github.com/openvinotoolkit/openvino.genai)
- [MLC LLM documentation](https://llm.mlc.ai/docs/)
- [SemiAnalysis InferenceX](https://inferencex.semianalysis.com/) and its [open benchmark harness](https://github.com/SemiAnalysisAI/InferenceX)

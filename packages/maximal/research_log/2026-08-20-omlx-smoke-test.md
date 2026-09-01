# oMLX 0.6.3rc2 Apple Silicon smoke test

Date: 2026-08-20

Scope: validate the signed oMLX macOS application and its externally exposed API
before designing Maximal's local-provider integration. This is an investigation
record, not a support promise or benchmark.

## Environment and artifact

The test used the signed oMLX 0.6.3rc2 DMG on Apple Silicon with
`mlx-community/Qwen3-0.6B-4bit`. The DMG was used because the Homebrew/Python
installation path depended on an artifact host unavailable in this environment.
The application bundle was self-contained; no system Python installation was
used.

The app's bundled Python and framework paths had to be present together when
probing native extensions. With the complete bundle path, every probed custom
Metal-kernel group loaded. A probe that includes only the app resources can
incorrectly report that `mlx` is missing.

## API results

The running app successfully served:

- `GET /v1/models`;
- OpenAI-shaped streaming chat completions at `/v1/chat/completions`; and
- Anthropic-shaped streaming messages at `/v1/messages`.

The model download completed through oMLX's administration API after supplying
an empty Hugging Face token string rather than JSON `null`. Progress could appear
stationary while the model file was still growing, so file growth was a more
useful completion signal than one sampled percentage.

The small Qwen model did not reliably obey an exact-output prompt with its
thinking template enabled. Supplying
`chat_template_kwargs.enable_thinking = false` made that smoke assertion useful;
this was a prompt/template property, not a transport failure.

## Streaming observation

The OpenAI-compatible endpoint emitted a keepalive before the first content
delta. Therefore HTTP start-transfer time is not model time-to-first-token.
Instrumentation must ignore SSE comments/pings and record first model content
separately.

The adapter must also parse SSE incrementally: UTF-8 code points, CR/LF framing,
and event fields may cross arbitrary transport chunks. Cancellation must stop the
response reader and the provider request rather than merely abandoning local
iteration.

## Architectural consequence

The smoke test did not justify embedding oMLX lifecycle or installation logic in
Maximal Core. oMLX already exposes a process boundary and Anthropic-compatible
HTTP surface. The selected integration is a genuine external
`@deepseek-ai/dsh-llm` adapter, loaded by a replaceable provider host. The adapter
owns only oMLX wire translation, model discovery, typed failures, and request
cancellation. DMG installation, application updates, model/cache storage, native
kernel probing, and process supervision remain outside it.

A local plugin is trusted code when hosted in-process. Cordis scopes registered
plugin effects but is not a security sandbox; process restart remains the
recovery boundary for ambient resources leaked by a plugin.

## Cleanup requirement

The DMG, downloaded model, app settings, logs, generated authentication material,
and all temporary smoke-test directories are local test artifacts. They must not
be committed or packaged. After the final compiled integration gate, stop oMLX,
detach the image, delete the temporary trees, and verify that no credentials,
weights, logs, or image paths are tracked or staged.

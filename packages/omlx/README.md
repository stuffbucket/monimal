# @stuffbucket/omlx

`@stuffbucket/omlx` is a stock Cordis plugin for the
[`@deepseek-ai/dsh-llm`](https://www.npmjs.com/package/@deepseek-ai/dsh-llm)
service. It registers one DSH provider route for each configured oMLX server
alias and translates DSH requests to oMLX's Anthropic-compatible
`POST /v1/messages` stream.

The package is strict ESM for Node.js 24 or newer. It has no dependency on
Maximal and can be activated under a plain Cordis context containing the stock
DSH LLM service.

## Installation

```sh
pnpm add @stuffbucket/omlx @deepseek-ai/cordis@4.0.1 @deepseek-ai/dsh-llm@0.1.0-rc.6
```

Cordis and DSH are exact peer dependencies so the plugin uses the same runtime and
adapter contracts as its host.

## Configuration

```ts
import { Context } from "@deepseek-ai/cordis"
import LlmRuntime, { createUserMessage } from "@deepseek-ai/dsh-llm"
import * as omlx from "@stuffbucket/omlx"

const ctx = new Context()
await ctx.plugin(LlmRuntime)
await ctx.plugin(omlx, {
  instances: {
    local: {
      // A root URL only. The adapter appends /v1/models and /v1/messages.
      baseUrl: "http://127.0.0.1:8000",
      apiKey: process.env.OMLX_API_KEY!,
      modelDefaults: {
        contextWindow: 32_768,
        maxTokens: 4_096,
      },
    },
  },
})

const stream = ctx.llm.stream({
  provider: "local",
  model: "mlx-community/Qwen3-4B-Instruct-4bit",
  messages: [createUserMessage({
    source: { kind: "user" },
    content: [{ type: "text", text: "Explain speculative decoding." }],
  })],
  maxTokens: 512,
})

for await (const chunk of stream) {
  // Consume normal DSH StreamChunk values.
}
```

`instances` is a record keyed by the DSH provider alias. Every instance requires:

- `baseUrl`: a root `http:` or `https:` URL. Embedded credentials, paths,
  queries, and fragments are rejected.
- `apiKey`: the bearer token configured on the oMLX server.
- `modelDefaults` (optional): fallback `contextWindow` and `maxTokens` metadata
  used by DSH model resolution when `/v1/models` does not report those values.

The adapter does not treat the `/v1/models` catalog as a request whitelist.
Unlisted model IDs remain routable. A request must supply `maxTokens`, either
explicitly or through a resolved `modelDefaults.maxTokens` value.

## Wire behavior

The adapter:

- sends `GET /v1/models` for advisory discovery and exact-model resolution;
- sends `POST /v1/messages` with Anthropic-shaped system, message, reasoning,
  tool-use, tool-result, tool-schema, sampling, output-limit, and stop fields;
- parses SSE incrementally across arbitrary byte and UTF-8 boundaries;
- ignores SSE comments and `ping` events while validating message and content
  block sequencing;
- emits DSH usage immediately before the terminal finish chunk;
- preserves streamed reasoning signatures in strict `anthropic-message-v1` DSH
  replay state and validates that wire state when reasoning returns in history;
- aborts transport reads for caller cancellation, early iterator return, and
  plugin disposal.

DSH image blocks contain durable attachment references rather than image bytes.
This package has no attachment service dependency, so it raises `LlmError` with
code `UNSUPPORTED` instead of silently dropping an image. It likewise rejects
other DSH fields or content placements that the oMLX Messages boundary cannot
represent.

## Trust boundary

Treat every configured oMLX endpoint as trusted with the prompts, tool schemas,
tool results, and API key sent to it. Prefer loopback or a protected private
network. TLS authenticates remote HTTPS endpoints; this package does not add
certificate pinning, endpoint allowlisting, secret storage, or credential
rotation. Validation and diagnostics never include configured secret values.

## Process and installation non-goals

This package is only an HTTP protocol adapter. It does not:

- install Python, MLX, native kernels, models, or the oMLX macOS application;
- inspect macOS hardware or operating-system compatibility;
- download, mount, or replace DMGs;
- launch, stop, restart, supervise, or update an oMLX process;
- manage oMLX model caches, KV caches, or model lifecycle.

Replacing the oMLX application with a newer DMG replaces the application bundle
outside this plugin. Stop or restart oMLX as required by that application update;
the adapter simply reconnects to the configured `baseUrl` on later requests.
Whether an oMLX upgrade preserves or migrates its own settings, models, and
caches is an oMLX responsibility. This package neither copies nor deletes them.

## Development

Run package-local checks from the workspace root:

```sh
pnpm --filter @stuffbucket/omlx run build
pnpm --filter @stuffbucket/omlx run typecheck
pnpm --filter @stuffbucket/omlx run lint
pnpm --filter @stuffbucket/omlx run test
```

The tests use only `node:http`, stock Cordis, and `@deepseek-ai/dsh-llm`; they do
not import Maximal or host packages.

## License

MIT. See [LICENSE](./LICENSE).

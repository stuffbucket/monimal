# @stuffbucket/anthropic-provider

A trusted external Cordis plugin that connects the stock `@deepseek-ai/dsh-llm` service to an Anthropic-compatible Messages API. It is not a Maximal plugin, has no Maximal dependency, and does not import Maximal contracts, hosts, or extensions.

The adapter uses the real `LlmAdapter` and `ctx.llm.registerAdapter()` APIs. It streams `POST /v1/messages`, discovers advisory models through `GET /v1/models`, preserves DSH text/reasoning/tool/usage semantics, and cancels active HTTP work when its Cordis fiber is disposed.

## Install

```sh
pnpm add @stuffbucket/anthropic-provider @deepseek-ai/cordis@4.0.1 @deepseek-ai/dsh-llm@0.1.0-rc.6
```

Treat this package as trusted code: a provider plugin can see model prompts, tool schemas/results, and its configured credential.

## Stock DSH usage

```ts
import { Context } from "@deepseek-ai/cordis"
import LlmRuntime, { createUserMessage } from "@deepseek-ai/dsh-llm"
import * as anthropicProvider from "@stuffbucket/anthropic-provider"

const ctx = new Context()
await ctx.plugin(LlmRuntime)
const provider = await ctx.plugin(anthropicProvider, {
  instances: [
    {
      aliases: ["anthropic", "claude"],
      baseURL: "https://api.anthropic.com",
      apiKey: process.env.ANTHROPIC_API_KEY!,
      authType: "x-api-key",
      displayName: "Anthropic",
      modelDefaults: {
        maxTokens: 16_000,
        contextWindow: 1_000_000,
      },
      models: {
        "claude-opus-5": { name: "Claude Opus 5" },
      },
    },
  ],
})

const chunks = ctx.llm.stream({
  provider: "anthropic",
  model: "claude-opus-5",
  messages: [
    createUserMessage({
      content: [{ type: "text", text: "Hello" }],
      source: { kind: "user" },
    }),
  ],
})

for await (const chunk of chunks) {
  // Feed stock DSH StreamChunk values to BlockAssembler or your own consumer.
  console.log(chunk.type)
}

await provider.dispose()
await ctx.fiber.dispose()
```

## Configuration

`instances` is required and may contain multiple independent endpoints. Each instance owns one or more `aliases`; all aliases are registered atomically through one adapter. Alias duplication or a conflict with another stock DSH adapter fails activation without replacing the existing route.

- `baseURL` must be a root `http:` or `https:` URL. Paths, embedded credentials, queries, and fragments are rejected.
- `apiKey` is required and marked as a secret in the Schemastery schema. Error messages and logs never include it.
- `authType` is `x-api-key` (default) or `authorization` (`Bearer` transport).
- `modelDefaults` supplies `maxTokens` (default 16,000), optional context/sampling values, and optional default reasoning effort.
- `models` is advisory metadata plus per-model overrides. It never restricts request routing; unlisted model IDs pass through.
- `adjustInputTokens` preserves compatibility with Anthropic-compatible gateways that report cache reads/writes inside `input_tokens`. When enabled, cache tokens are subtracted to produce DSH's disjoint `TokenUsage` counts.

Credentials are sent only in the selected authentication header. Do not serialize or log plugin configuration.

## Supported DSH surface

The adapter maps system and conversation messages, text, signed reasoning replay, tool calls/results and schemas, temperature, configured `topP`/`topK`, max tokens, stop sequences, session identity, call purpose, and adaptive reasoning effort. A DSH field or content block that cannot be represented safely fails with `LlmError` code `UNSUPPORTED`; it is never silently dropped.

Images and reasoning without adapter-produced replay signatures are currently unsupported. Provider catalogs and `/v1/models` results are advisory.

## License

MIT

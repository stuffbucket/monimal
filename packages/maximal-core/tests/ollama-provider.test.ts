import { afterEach, describe, expect, test } from "bun:test"
import { Hono } from "hono"

import type { ResolvedOllamaProviderConfig } from "~/lib/config/config"
import type { AnthropicMessagesPayload } from "~/lib/models/anthropic-types"

import {
  DEFAULT_OLLAMA_BASE_URL,
  getProviderConfig,
  resolveProviderConfig,
} from "~/lib/config/config"
import { state } from "~/lib/runtime-state/state"
import {
  createOllamaChatPayload,
  handleOllamaMessages,
} from "~/routes/provider/messages/handler"
import { forwardProviderModels } from "~/services/providers/anthropic-proxy"
import {
  getOllamaSettings,
  updateOllamaSettings,
} from "~/services/providers/ollama-settings"
import { createProviderDispatcher } from "~/services/providers/provider-dispatcher"

const realFetch = globalThis.fetch
const originalModels = state.models
const originalOllamaApiKey = process.env.OLLAMA_API_KEY
const originalOllamaHost = process.env.OLLAMA_HOST

afterEach(() => {
  globalThis.fetch = realFetch
  state.models = originalModels
  if (originalOllamaApiKey === undefined) delete process.env.OLLAMA_API_KEY
  else process.env.OLLAMA_API_KEY = originalOllamaApiKey
  if (originalOllamaHost === undefined) delete process.env.OLLAMA_HOST
  else process.env.OLLAMA_HOST = originalOllamaHost
})

describe("Ollama account settings", () => {
  test("rejects an invalid API key without activating cloud access", async () => {
    delete process.env.OLLAMA_API_KEY
    globalThis.fetch = ((_input, _init) =>
      Promise.resolve(
        new Response("unauthorized", { status: 401 }),
      )) as typeof fetch

    let errorMessage = ""
    try {
      await updateOllamaSettings({ api_key: "invalid-key" })
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error)
    }
    expect(errorMessage).toContain("Ollama rejected this API key")
    expect(getOllamaSettings().has_api_key).toBe(false)
  })

  test("accepts a validated API key and allows an empty value to remove it", async () => {
    delete process.env.OLLAMA_API_KEY
    globalThis.fetch = ((input, init) => {
      let url: string
      if (typeof input === "string") url = input
      else if (input instanceof URL) url = input.href
      else url = input.url
      expect(url).toBe("https://ollama.com/api/chat")
      expect(init?.method).toBe("POST")
      expect(init?.body).toBe("{}")
      expect(new Headers(init?.headers).get("content-type")).toBe(
        "application/json",
      )
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer valid-key",
      )
      return Promise.resolve(
        Response.json({ error: "model is required" }, { status: 400 }),
      )
    }) as typeof fetch

    const saved = await updateOllamaSettings({ api_key: "valid-key" })
    expect(saved).toMatchObject({
      has_api_key: true,
      credential_source: "file",
    })
    const removed = await updateOllamaSettings({ api_key: "" })
    expect(removed).toMatchObject({
      has_api_key: false,
      credential_source: "none",
    })
  })
})

const provider = (
  overrides: Partial<ResolvedOllamaProviderConfig> = {},
): ResolvedOllamaProviderConfig => ({
  name: "ollama",
  type: "ollama",
  baseUrl: DEFAULT_OLLAMA_BASE_URL,
  authType: "authorization",
  ...overrides,
})

const payload = (
  overrides: Partial<AnthropicMessagesPayload> = {},
): AnthropicMessagesPayload => ({
  model: "shared-model",
  messages: [{ role: "user", content: "Hello" }],
  max_tokens: 32,
  ...overrides,
})

function appFor(config: ResolvedOllamaProviderConfig): Hono {
  const app = new Hono()
  app.post(
    "/:provider/v1/messages",
    async (c) =>
      await handleOllamaMessages(c, {
        payload: await c.req.json<AnthropicMessagesPayload>(),
        provider: c.req.param("provider"),
        providerConfig: config,
      }),
  )
  return app
}

function capturedRequest(
  input: string | URL | Request,
  init?: RequestInit,
): Request {
  if (input instanceof Request) return new Request(input, init)
  return new Request(input.toString(), init)
}

function requestBody(init: RequestInit | undefined): string {
  if (typeof init?.body !== "string") {
    throw new TypeError("Expected a string request body")
  }
  return init.body
}

describe("Ollama provider configuration", () => {
  test("defaults to the local service without inventing a credential", () => {
    expect(resolveProviderConfig({}, "ollama")).toEqual(provider())
  })

  test("allows the implicit local service to be disabled explicitly", () => {
    expect(
      resolveProviderConfig(
        { providers: { ollama: { type: "ollama", enabled: false } } },
        "ollama",
      ),
    ).toBeNull()
  })

  test("uses OLLAMA_HOST for the implicit local service", () => {
    process.env.OLLAMA_HOST = "192.168.1.20:11500"

    expect(resolveProviderConfig({}, "ollama")).toEqual(
      provider({ baseUrl: "http://192.168.1.20:11500" }),
    )
  })

  test("accepts an optional account key as bearer authentication", () => {
    expect(
      resolveProviderConfig(
        {
          providers: {
            cloud: {
              type: "ollama",
              baseUrl: "https://ollama.example/",
              apiKey: " account-key ",
            },
          },
        },
        "cloud",
      ),
    ).toEqual(
      provider({
        name: "cloud",
        baseUrl: "https://ollama.example",
        apiKey: "account-key",
      }),
    )
  })

  test("runtime resolution prefers the boot-loaded secret", () => {
    process.env.OLLAMA_API_KEY = " secret-file-key "
    expect(getProviderConfig("ollama")).toEqual(
      provider({ apiKey: "secret-file-key" }),
    )
  })
})

describe("Ollama model discovery", () => {
  test("enriches listed models with details from the show endpoint", async () => {
    const requests: Array<Request> = []
    globalThis.fetch = ((input, init) => {
      const request = capturedRequest(input, init)
      requests.push(request)
      if (request.url.endsWith("/v1/models")) {
        return Promise.resolve(
          Response.json({
            data: [
              {
                id: "qwen3:8b",
                name: "Qwen 3 8B",
              },
            ],
          }),
        )
      }
      return Promise.resolve(
        Response.json({
          capabilities: ["completion", "tools", "vision", "thinking"],
          details: { family: "qwen3" },
          model_info: { "qwen3.context_length": 32_768 },
        }),
      )
    }) as typeof fetch
    const dispatcher = createProviderDispatcher({
      readConfig: () => ({
        providers: {
          ollama: {
            type: "ollama",
            baseUrl: "http://127.0.0.1:11434",
          },
        },
      }),
    })

    expect(await dispatcher.listModels()).toEqual([
      {
        capabilities: ["completion", "tools", "vision", "thinking"],
        contextWindowTokens: 32_768,
        family: "qwen3",
        id: "qwen3:8b",
        name: "Qwen 3 8B",
        provider: "ollama",
        providerName: "ollama",
      },
    ])
    expect(requests.map(({ url }) => new URL(url).pathname)).toEqual([
      "/v1/models",
      "/api/show",
    ])
    expect(await requests[1]?.json()).toEqual({ model: "qwen3:8b" })
  })
})

describe("Ollama provider routing", () => {
  test("preserves provider-qualified model IDs and translates JSON", async () => {
    let upstream: Request | undefined
    globalThis.fetch = ((input, init) => {
      upstream = capturedRequest(input, init)
      return Promise.resolve(
        Response.json({
          id: "chatcmpl-1",
          object: "chat.completion",
          created: 1,
          model: "shared-model",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "Hello from Ollama" },
              logprobs: null,
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 4,
            completion_tokens: 3,
            total_tokens: 7,
          },
        }),
      )
    }) as typeof fetch

    const response = await appFor(provider({ apiKey: "account-key" })).request(
      "/ollama/v1/messages",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload()),
      },
    )

    expect(response.status).toBe(200)
    expect(upstream?.url).toBe("http://127.0.0.1:11434/v1/chat/completions")
    expect(upstream?.headers.get("authorization")).toBe("Bearer account-key")
    expect(await upstream?.json()).toMatchObject({
      model: "shared-model",
      messages: [{ role: "user", content: "Hello" }],
      max_tokens: 32,
    })
    expect(await response.json()).toMatchObject({
      type: "message",
      model: "shared-model",
      content: [{ type: "text", text: "Hello from Ollama" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 4, output_tokens: 3 },
    })
  })

  test("translates Ollama SSE and requests streamed usage", async () => {
    let upstreamBody: unknown
    globalThis.fetch = ((_input, init) => {
      upstreamBody = JSON.parse(requestBody(init))
      const frames = [
        {
          id: "chatcmpl-2",
          object: "chat.completion.chunk",
          created: 1,
          model: "shared-model",
          choices: [
            {
              index: 0,
              delta: { role: "assistant", content: "Hi" },
              finish_reason: null,
              logprobs: null,
            },
          ],
        },
        {
          id: "chatcmpl-2",
          object: "chat.completion.chunk",
          created: 1,
          model: "shared-model",
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: "stop",
              logprobs: null,
            },
          ],
          usage: {
            prompt_tokens: 2,
            completion_tokens: 1,
            total_tokens: 3,
          },
        },
      ]
      const body = `${frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("")}data: [DONE]\n\n`
      return Promise.resolve(
        new Response(body, {
          headers: { "content-type": "text/event-stream" },
        }),
      )
    }) as typeof fetch

    const response = await appFor(provider()).request("/ollama/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload({ stream: true })),
    })
    const body = await response.text()

    expect(upstreamBody).toMatchObject({
      model: "shared-model",
      stream: true,
      stream_options: { include_usage: true },
    })
    expect(body).toContain('"type":"message_start"')
    expect(body).toContain('"type":"text_delta","text":"Hi"')
    expect(body).toContain('"type":"message_stop"')
  })

  test("discovers models through the configured service without local auth", async () => {
    let upstream: Request | undefined
    globalThis.fetch = ((input, init) => {
      upstream = capturedRequest(input, init)
      return Promise.resolve(
        Response.json({
          object: "list",
          data: [{ id: "shared-model", object: "model", owned_by: "ollama" }],
        }),
      )
    }) as typeof fetch

    const response = await forwardProviderModels(provider(), new Headers())

    expect(upstream?.url).toBe("http://127.0.0.1:11434/v1/models")
    expect(upstream?.headers.get("authorization")).toBeNull()
    expect(await response.json()).toEqual({
      object: "list",
      data: [{ id: "shared-model", object: "model", owned_by: "ollama" }],
    })
  })
})

test("does not inherit Copilot metadata for a duplicate model ID", () => {
  state.models = {
    object: "list",
    data: [
      {
        capabilities: {
          family: "gpt",
          limits: {
            max_context_window_tokens: 128_000,
            max_output_tokens: 16_000,
          },
          object: "model_capabilities",
          supports: { max_thinking_budget: 8_000 },
          tokenizer: "o200k_base",
          type: "chat",
        },
        id: "shared-model",
        model_picker_enabled: true,
        name: "Copilot Shared Model",
        object: "model",
        preview: false,
        vendor: "copilot",
        version: "shared-model",
      },
    ],
  }
  expect(
    createOllamaChatPayload(
      payload({
        thinking: { type: "enabled", budget_tokens: 16 },
      }),
    ),
  ).not.toHaveProperty("thinking_budget")
})

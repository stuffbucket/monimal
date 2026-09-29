import { afterEach, describe, expect, mock, test } from "bun:test"
import { Hono } from "hono"

import type { ResolvedOllamaProviderConfig } from "~/lib/config/config"
import type { AnthropicMessagesPayload } from "~/lib/models/anthropic-types"

import {
  DEFAULT_OLLAMA_BASE_URL,
  getConfig,
  getProviderConfig,
  resolveProviderConfig,
  writeConfig,
} from "~/lib/config/config"
import { buildModelsList } from "~/lib/live/resources"
import { state } from "~/lib/runtime-state/state"
import {
  createOllamaChatPayload,
  handleOllamaMessages,
} from "~/routes/provider/messages/handler"
import { forwardProviderModels } from "~/services/providers/anthropic-proxy"
import { ProviderModelRouter } from "~/services/providers/model-router"
import {
  testOllamaApiKey,
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
  test("saves an API key without an unreliable inference probe", async () => {
    delete process.env.OLLAMA_API_KEY
    const fetchMock = mock(() =>
      Promise.reject(new Error("Ollama settings must not probe inference")),
    )
    globalThis.fetch = Object.assign(fetchMock, {
      preconnect: realFetch.preconnect,
    })

    const saved = await updateOllamaSettings({ api_key: "valid-key" })
    expect(saved).toMatchObject({
      has_api_key: true,
      cloud_enabled: true,
      api_key: "valid-key",
      credential_source: "file",
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("allows an empty API key to remove the saved credential", async () => {
    const removed = await updateOllamaSettings({ api_key: "" })
    expect(removed).toMatchObject({
      has_api_key: false,
      cloud_enabled: true,
      api_key: null,
      credential_source: "none",
    })
  })

  test("persists a custom local endpoint for inference", async () => {
    const originalConfig = getConfig()
    try {
      const updated = await updateOllamaSettings({
        local_endpoint: "http://ollama.lan:11500/",
      })

      expect(updated.local_endpoint).toBe("http://ollama.lan:11500")
      expect(getProviderConfig("ollama")?.baseUrl).toBe(
        "http://ollama.lan:11500",
      )

      const reset = await updateOllamaSettings({ local_endpoint: "" })
      expect(reset.local_endpoint).toBe(DEFAULT_OLLAMA_BASE_URL)
      expect(getProviderConfig("ollama")?.baseUrl).toBe(DEFAULT_OLLAMA_BASE_URL)
    } finally {
      writeConfig(originalConfig)
    }
  })

  test("persists direct cloud provider enablement", async () => {
    const originalConfig = getConfig()
    try {
      const disabled = await updateOllamaSettings({ cloud_enabled: false })
      expect(disabled.cloud_enabled).toBe(false)
      expect(getProviderConfig("ollama-cloud")).toBeNull()

      const enabled = await updateOllamaSettings({ cloud_enabled: true })
      expect(enabled.cloud_enabled).toBe(true)
      expect(getProviderConfig("ollama-cloud")?.type).toBe("ollama")
    } finally {
      writeConfig(originalConfig)
    }
  })

  describe("model catalogue provider identity", () => {
    test("distinguishes direct, local-cloud, and local Ollama models", () => {
      state.models = undefined
      const result = buildModelsList([
        {
          id: "qwen3:8b-cloud",
          name: "Qwen 3 8B Cloud",
          provider: "ollama",
          providerName: "Ollama",
        },
        {
          id: "qwen3:cloud",
          name: "Qwen 3 Cloud",
          provider: "ollama",
          providerName: "Ollama",
        },
        {
          id: "qwen3:8b",
          name: "Qwen 3 8B",
          provider: "ollama",
          providerName: "Ollama",
        },
        {
          id: "gemma4:31b",
          name: "Gemma 4",
          provider: "ollama-cloud",
          providerName: "Ollama",
        },
      ])

      const identities = result.models.map(({ id, provider, location }) => ({
        id,
        provider,
        location,
      }))
      expect(identities).toContainEqual({
        id: "qwen3:8b-cloud",
        provider: "ollama",
        location: "cloud",
      })
      expect(identities).toContainEqual({
        id: "qwen3:cloud",
        provider: "ollama",
        location: "cloud",
      })
      expect(identities).toContainEqual({
        id: "qwen3:8b",
        provider: "ollama",
        location: "local",
      })
      expect(identities).toContainEqual({
        id: "gemma4:31b",
        provider: "ollama-cloud",
        location: "cloud",
      })
    })
  })

  test("tests a candidate API key without invoking a model", async () => {
    let request: Request | undefined
    globalThis.fetch = ((input, init) => {
      request = capturedRequest(input, init)
      return Promise.resolve(Response.json({ data: [] }))
    }) as typeof fetch

    expect(await testOllamaApiKey({ api_key: " candidate-key " })).toEqual({
      status: "valid",
      message: "Ollama accepted this API key.",
    })
    expect(request?.method).toBe("GET")
    expect(request?.url).toBe("https://ollama.com/v1/models")
    expect(request?.headers.get("authorization")).toBe("Bearer candidate-key")
  })

  test("reports an API key rejected by Ollama", async () => {
    globalThis.fetch = Object.assign(
      () => Promise.resolve(new Response(null, { status: 401 })),
      { preconnect: realFetch.preconnect },
    )

    expect(await testOllamaApiKey({ api_key: "rejected-key" })).toEqual({
      status: "invalid",
      message: "Ollama rejected this API key.",
    })
  })

  test("surfaces unrelated API-key test failures", async () => {
    globalThis.fetch = Object.assign(
      () => Promise.resolve(new Response(null, { status: 503 })),
      { preconnect: realFetch.preconnect },
    )

    let failure: unknown
    try {
      await testOllamaApiKey({ api_key: "candidate-key" })
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(Error)
    if (!(failure instanceof Error)) throw failure
    expect(failure.message).toBe("Ollama API key test failed with HTTP 503.")
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
  test("discovers direct cloud models from Ollama's native catalogue", async () => {
    const requests: Array<Request> = []
    globalThis.fetch = ((input, init) => {
      const request = capturedRequest(input, init)
      requests.push(request)
      if (request.url.endsWith("/api/tags")) {
        return Promise.resolve(
          Response.json({
            models: [
              {
                model: "gemma4:31b",
                name: "gemma4:31b",
              },
            ],
          }),
        )
      }
      return Promise.resolve(Response.json({}))
    }) as typeof fetch
    const dispatcher = createProviderDispatcher({
      readConfig: () => ({
        providers: {
          ollama: { type: "ollama", enabled: false },
          "ollama-cloud": {
            type: "ollama",
            baseUrl: "https://ollama.com",
            apiKey: "saved-api-key",
          },
        },
      }),
    })

    expect(await dispatcher.listModels()).toEqual([
      expect.objectContaining({
        id: "gemma4:31b",
        name: "gemma4:31b",
        enabled: true,
        provider: "ollama-cloud",
      }),
    ])
    const cloudRequests = requests.filter(
      ({ url }) => new URL(url).hostname === "ollama.com",
    )
    expect(cloudRequests.map(({ url }) => new URL(url).pathname)).toEqual([
      "/api/tags",
      "/api/show",
    ])
    expect(cloudRequests[0]?.headers.get("authorization")).toBe(
      "Bearer saved-api-key",
    )
  })

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
        enabled: true,
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

  test("lists disabled provider models for Settings without advertising them", async () => {
    globalThis.fetch = ((input, init) => {
      const request = capturedRequest(input, init)
      if (request.url.endsWith("/api/tags")) {
        return Promise.resolve(
          Response.json({
            models:
              request.url.startsWith("https://ollama.example") ?
                [{ model: "gemma4:31b", name: "Gemma 4" }]
              : [],
          }),
        )
      }
      return Promise.resolve(Response.json({}))
    }) as typeof fetch
    const dispatcher = createProviderDispatcher({
      readConfig: () => ({
        providers: {
          "ollama-cloud": {
            type: "ollama",
            enabled: false,
            baseUrl: "https://ollama.example",
            apiKey: "account-key",
          },
        },
      }),
    })
    const router = new ProviderModelRouter(dispatcher)

    expect(await router.listProviderModels()).toEqual([
      expect.objectContaining({
        id: "gemma4:31b",
        enabled: false,
        provider: "ollama-cloud",
      }),
    ])
    expect(await router.listAdvertisedModels()).toEqual([])
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

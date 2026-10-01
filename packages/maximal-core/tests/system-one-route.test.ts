import { afterEach, describe, expect, test } from "bun:test"
import { Hono } from "hono"

import type { ProviderDispatcher } from "~/services/providers/provider-dispatcher"

import {
  DEFAULT_OLLAMA_BASE_URL,
  getConfig,
  writeConfig,
} from "~/lib/config/config"
import { createProviderOpenAiRoute } from "~/routes/provider/openai-route"
import {
  createProviderSystemOneRoute,
  createSystemOneRoute,
} from "~/routes/system-one/route"
import { ProviderModelRouter } from "~/services/providers/model-router"
import { createProviderDispatcher } from "~/services/providers/provider-dispatcher"

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

function capturedRequest(
  input: string | URL | Request,
  init?: RequestInit,
): Request {
  if (input instanceof Request) return new Request(input, init)
  return new Request(input.toString(), init)
}

describe("Ollama System One routing", () => {
  test("forwards provider-qualified requests with exact wire semantics", async () => {
    const originalConfig = getConfig()
    let upstream: Request | undefined
    globalThis.fetch = ((input, init) => {
      upstream = capturedRequest(input, init)
      return Promise.resolve(
        Response.json({
          model: "nimble",
          answers: {
            route: {
              type: "choice",
              choice: "billing",
              probabilities: { billing: 0.9, technical: 0.1 },
              confidence: 0.8,
            },
          },
          usage: { input_tokens: 42, output_tokens: 1 },
        }),
      )
    }) as typeof fetch
    writeConfig({
      ...originalConfig,
      providerHost: { mode: "legacy" },
      providers: {
        ...originalConfig.providers,
        ollama: {
          type: "ollama",
          baseUrl: DEFAULT_OLLAMA_BASE_URL,
          apiKey: "account-key",
        },
      },
    })
    const dispatcher = createProviderDispatcher()
    const app = new Hono()
    app.route(
      "/:provider/v1/systemone",
      createProviderSystemOneRoute(dispatcher),
    )
    const body = {
      model: "nimble",
      state: { ticket: "Charged twice" },
      questions: {
        route: {
          type: "choice",
          instructions: "Choose a team",
          criteria: {
            billing: "Payments",
            technical: "Software",
          },
        },
      },
    }

    try {
      const response = await app.request("/ollama/v1/systemone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })

      expect(response.status).toBe(200)
      expect(upstream?.url).toBe(`${DEFAULT_OLLAMA_BASE_URL}/v1/systemone`)
      expect(upstream?.method).toBe("POST")
      expect(upstream?.headers.get("accept")).toBe("application/json")
      expect(upstream?.headers.get("content-type")).toBe("application/json")
      expect(upstream?.headers.has("authorization")).toBe(true)
      expect(await upstream?.json()).toEqual(body)
      expect(await response.json()).toMatchObject({
        model: "nimble",
        usage: { input_tokens: 42, output_tokens: 1 },
      })

      const customAccept = "application/vnd.ollama.systemone+json"
      const customAcceptResponse = await app.request("/ollama/v1/systemone", {
        method: "POST",
        headers: {
          accept: customAccept,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      })

      expect(customAcceptResponse.status).toBe(200)
      expect(upstream?.headers.get("accept")).toBe(customAccept)
      expect(await upstream?.json()).toEqual(body)
    } finally {
      await dispatcher.dispose()
      writeConfig(originalConfig)
    }
  })

  test("keeps legacy OpenAI forwarding wired through the shared route", async () => {
    const originalConfig = getConfig()
    let upstream: Request | undefined
    globalThis.fetch = ((input, init) => {
      upstream = capturedRequest(input, init)
      return Promise.resolve(Response.json({ data: [{ embedding: [0.5] }] }))
    }) as typeof fetch
    writeConfig({
      ...originalConfig,
      providerHost: { mode: "legacy" },
      providers: {
        ...originalConfig.providers,
        ollama: {
          type: "ollama",
          baseUrl: DEFAULT_OLLAMA_BASE_URL,
        },
      },
    })
    const dispatcher = createProviderDispatcher()
    const app = new Hono()
    app.route(
      "/:provider/v1/embeddings",
      createProviderOpenAiRoute(dispatcher, "embeddings"),
    )
    const body = { model: "nomic-embed-text", input: ["hello"] }

    try {
      const response = await app.request("/ollama/v1/embeddings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })

      expect(response.status).toBe(200)
      expect(upstream?.url).toBe(`${DEFAULT_OLLAMA_BASE_URL}/v1/embeddings`)
      expect(upstream?.method).toBe("POST")
      expect(await upstream?.json()).toEqual(body)
      expect(await response.json()).toEqual({
        data: [{ embedding: [0.5] }],
      })
    } finally {
      await dispatcher.dispose()
      writeConfig(originalConfig)
    }
  })
})

describe("System One routing failures and aggregate legacy dispatch", () => {
  test("returns the contract error without contacting an unknown provider", async () => {
    const originalConfig = getConfig()
    let upstreamCalls = 0
    globalThis.fetch = Object.assign(
      () => {
        upstreamCalls += 1
        return Promise.resolve(Response.json({ unexpected: true }))
      },
      { preconnect: realFetch.preconnect },
    )
    writeConfig({
      ...originalConfig,
      providerHost: { mode: "legacy" },
    })
    const dispatcher = createProviderDispatcher()
    const app = new Hono()
    app.route(
      "/:provider/v1/systemone",
      createProviderSystemOneRoute(dispatcher),
    )

    try {
      const response = await app.request("/missing/v1/systemone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "nimble", questions: {} }),
      })

      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({
        error: {
          message: "Provider 'missing' not found or disabled",
          type: "invalid_request_error",
        },
      })
      expect(upstreamCalls).toBe(0)
    } finally {
      await dispatcher.dispose()
      writeConfig(originalConfig)
    }
  })

  test("invokes legacy forwarding after aggregate model resolution", async () => {
    const originalConfig = getConfig()
    let upstream: Request | undefined
    globalThis.fetch = ((input, init) => {
      upstream = capturedRequest(input, init)
      return Promise.resolve(Response.json({ model: "nimble", answers: {} }))
    }) as typeof fetch
    writeConfig({
      ...originalConfig,
      providerHost: { mode: "legacy" },
      providers: {
        ...originalConfig.providers,
        ollama: {
          type: "ollama",
          baseUrl: DEFAULT_OLLAMA_BASE_URL,
        },
      },
    })
    const dispatcher: ProviderDispatcher = {
      dispatch: async (options) => await options.legacy(),
      dispose: () => Promise.resolve(),
      listModels: () =>
        Promise.resolve([
          {
            id: "nimble",
            name: "Nimble",
            provider: "ollama",
            providerName: "Ollama",
          },
        ]),
      localModels: () => undefined,
      ready: () => Promise.resolve(),
      requiresGithubAuth: () => false,
    }
    const app = new Hono()
    app.route(
      "/v1/systemone",
      createSystemOneRoute({
        dispatcher,
        modelRouter: new ProviderModelRouter(dispatcher),
      }),
    )
    const body = { model: "nimble", state: "hello", questions: {} }

    try {
      const response = await app.request("/v1/systemone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })

      expect(response.status).toBe(200)
      expect(upstream?.url).toBe(`${DEFAULT_OLLAMA_BASE_URL}/v1/systemone`)
      expect(await upstream?.json()).toEqual(body)
      expect(await response.json()).toEqual({
        model: "nimble",
        answers: {},
      })
    } finally {
      await dispatcher.dispose()
      writeConfig(originalConfig)
    }
  })
})

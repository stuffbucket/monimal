import type {
  ProviderDispatch,
  ProviderGateway,
  ProviderStatus,
} from "@maximal/maximal-model-contract"

import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import type { AppConfig } from "~/lib/config/config"
import type { ProviderCatalogueModel } from "~/lib/live/resources"
import type { ProviderDispatcher } from "~/services/providers/provider-dispatcher"

import { state } from "~/lib/runtime-state/state"
import { createServerApps } from "~/server"
import { ProviderModelRouter } from "~/services/providers/model-router"

const jsonHeaders = { "content-type": "application/json" }
const noop = (): void => undefined
const originalGithubToken = state.githubToken
const originalModels = state.models

beforeEach(() => {
  state.githubToken = ""
  state.models = undefined
})

afterEach(() => {
  state.githubToken = originalGithubToken
  state.models = originalModels
})

class RoutingGateway implements ProviderGateway {
  readonly dispatches: Array<ProviderDispatch> = []
  private readonly respond: (dispatch: ProviderDispatch) => Response
  private readonly statuses: ReadonlyArray<ProviderStatus>

  constructor(
    statuses: ReadonlyArray<ProviderStatus>,
    respond: (dispatch: ProviderDispatch) => Response,
  ) {
    this.statuses = statuses
    this.respond = respond
  }

  dispatch(dispatch: ProviderDispatch): Promise<Response> {
    this.dispatches.push(dispatch)
    return Promise.resolve(this.respond(dispatch))
  }

  dispose(): Promise<void> {
    return Promise.resolve()
  }

  getStatus(): ProviderStatus | undefined {
    return undefined
  }

  listStatuses(): ReadonlyArray<ProviderStatus> {
    return this.statuses
  }

  subscribe(): () => void {
    return noop
  }
}

const status = (provider: string): ProviderStatus => ({
  provider,
  state: "available",
  operations: ["messages", "models"],
  diagnostics: [],
})

const request = (model: string): Request =>
  new Request("http://localhost/v1/messages", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      model,
      max_tokens: 32,
      messages: [{ role: "user", content: "hello" }],
    }),
  })

const message = (provider: string): Response =>
  Response.json({
    id: `msg_${provider}`,
    type: "message",
    role: "assistant",
    model: "qwen3:8b",
    content: [],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  })

function appFor(gateway: ProviderGateway, config: AppConfig = {}) {
  return createServerApps({
    providerGateway: gateway,
    readConfig: () => ({ ...config, providerHost: { mode: "dsh" } }),
  }).publicApp
}

describe("catalog-driven model routing", () => {
  test("routes an ordinary request to its unique provider without GitHub auth", async () => {
    const gateway = new RoutingGateway([status("ollama")], (dispatch) =>
      dispatch.operation === "models" ?
        Response.json({ data: [{ id: "qwen3:8b" }] })
      : message(dispatch.provider),
    )

    const response = await appFor(gateway).request(request("qwen3:8b"))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: "msg_ollama" })
    expect(gateway.dispatches.map(({ operation }) => operation)).toEqual([
      "models",
      "messages",
    ])
  })
})

describe("Ollama model alias routing", () => {
  test("routes an omitted latest tag without rewriting the request", async () => {
    const gateway = new RoutingGateway([status("ollama")], (dispatch) =>
      dispatch.operation === "models" ?
        Response.json({ data: [{ id: "nimble:latest" }] })
      : Response.json({ routed: true }),
    )
    const body = { model: "nimble", state: "hello", questions: {} }

    const response = await appFor(gateway).request(
      new Request("http://localhost/v1/systemone", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(body),
      }),
    )

    expect(response.status).toBe(200)
    expect(gateway.dispatches.map(({ operation }) => operation)).toEqual([
      "models",
      "system-one",
    ])
    const systemOneDispatch = gateway.dispatches.at(-1)
    expect(systemOneDispatch).toMatchObject({
      operation: "system-one",
      provider: "ollama",
    })
    expect(await systemOneDispatch?.request.clone().json()).toEqual(body)
  })

  test.each([
    {
      name: "Ollama Cloud default tag",
      requested: "nimble",
      provider: "ollama-cloud",
      advertised: { id: "nimble:latest" },
      expectedStatus: 200,
      expectedProvider: "ollama-cloud",
    },
    {
      name: "an explicit non-default tag",
      requested: "nimble:stable",
      provider: "ollama",
      advertised: { id: "nimble:stable:latest" },
      expectedStatus: 404,
    },
    {
      name: "a different Ollama model",
      requested: "nimble",
      provider: "ollama",
      advertised: { id: "other:latest" },
      expectedStatus: 404,
    },
    {
      name: "a non-Ollama provider",
      requested: "nimble",
      provider: "anthropic",
      advertised: { id: "nimble:latest" },
      expectedStatus: 404,
    },
  ])(
    "does not broaden omitted-tag matching for $name",
    async ({
      requested,
      provider,
      advertised,
      expectedStatus,
      expectedProvider,
    }) => {
      const gateway = new RoutingGateway([status(provider)], (dispatch) =>
        dispatch.operation === "models" ?
          Response.json({ data: [advertised] })
        : Response.json({ routed: true }),
      )

      const response = await appFor(gateway).request(
        new Request("http://localhost/v1/systemone", {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({
            model: requested,
            state: "hello",
            questions: {},
          }),
        }),
      )

      expect(response.status).toBe(expectedStatus)
      expect(
        gateway.dispatches.filter(
          ({ operation }) => operation === "system-one",
        ),
      ).toHaveLength(expectedProvider === undefined ? 0 : 1)
      if (expectedProvider !== undefined) {
        expect(gateway.dispatches.at(-1)?.provider).toBe(expectedProvider)
      }
    },
  )

  test("does not route a disabled matching model", async () => {
    const models: ReadonlyArray<ProviderCatalogueModel> = [
      {
        id: "nimble:latest",
        name: "Nimble",
        enabled: false,
        provider: "ollama",
        providerName: "Ollama",
      },
    ]
    const dispatcher: ProviderDispatcher = {
      dispatch: () => Promise.reject(new Error("Unexpected dispatch")),
      dispose: () => Promise.resolve(),
      listModels: () => Promise.resolve(models),
      localModels: () => undefined,
      ready: () => Promise.resolve(),
      requiresGithubAuth: () => false,
    }

    const route = await new ProviderModelRouter(dispatcher).resolve("nimble")

    expect(route).toEqual({ kind: "copilot" })
  })
})

describe("catalog-driven model routing", () => {
  test.each([
    ["/v1/chat/completions", "chat-completions"],
    ["/v1/responses", "responses"],
    ["/v1/embeddings", "embeddings"],
    ["/chat/completions", "chat-completions"],
    ["/responses", "responses"],
    ["/embeddings", "embeddings"],
    ["/v1/systemone", "system-one"],
  ] as const)(
    "routes provider models on the OpenAI-compatible %s surface",
    async (path, operation) => {
      const gateway = new RoutingGateway([status("ollama")], (dispatch) =>
        dispatch.operation === "models" ?
          Response.json({ data: [{ id: "qwen3:8b" }] })
        : Response.json({ object: "provider-response", operation }),
      )

      const response = await appFor(gateway).request(
        new Request(`http://localhost${path}`, {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ model: "qwen3:8b", input: "hello" }),
        }),
      )

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        object: "provider-response",
        operation,
      })
      expect(gateway.dispatches.at(-1)).toMatchObject({
        operation,
        provider: "ollama",
      })
    },
  )

  test("requires a model on the System One surface", async () => {
    const gateway = new RoutingGateway([status("ollama")], () =>
      Response.json({ data: [] }),
    )

    const response = await appFor(gateway).request(
      new Request("http://localhost/v1/systemone", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ state: "hello", questions: {} }),
      }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: {
        message: "A System One request requires a model.",
        type: "invalid_request_error",
      },
    })
    expect(gateway.dispatches).toEqual([])
  })

  test("rejects Copilot models on the System One surface", async () => {
    const gateway = new RoutingGateway([], () =>
      Response.json({ unexpected: true }),
    )

    const response = await appFor(gateway).request(
      new Request("http://localhost/v1/systemone", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ model: "copilot-only", questions: {} }),
      }),
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: {
        message: "Model 'copilot-only' does not support System One.",
        type: "invalid_request_error",
      },
    })
    expect(gateway.dispatches).toEqual([])
  })

  test("dispatches provider-qualified System One requests without catalogue lookup", async () => {
    const gateway = new RoutingGateway([status("ollama")], (dispatch) =>
      Response.json({
        object: "provider-response",
        operation: dispatch.operation,
        provider: dispatch.provider,
      }),
    )

    const response = await appFor(gateway).request(
      new Request("http://localhost/ollama/v1/systemone", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ model: "nimble", questions: {} }),
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      object: "provider-response",
      operation: "system-one",
      provider: "ollama",
    })
    expect(gateway.dispatches).toHaveLength(1)
    expect(gateway.dispatches[0]).toMatchObject({
      operation: "system-one",
      provider: "ollama",
    })
  })

  test.each([
    ["/v1/systemone", "aggregate"],
    ["/ollama/v1/systemone", "provider-qualified"],
  ] as const)(
    "maps %s dispatch exceptions through the standard error contract",
    async (path) => {
      const gateway = new RoutingGateway([status("ollama")], (dispatch) => {
        if (dispatch.operation === "models") {
          return Response.json({ data: [{ id: "nimble" }] })
        }
        throw new Error("System One dispatch failed")
      })

      const response = await appFor(gateway).request(
        new Request(`http://localhost${path}`, {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ model: "nimble", questions: {} }),
        }),
      )

      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({
        error: {
          message: "System One dispatch failed",
          type: "error",
        },
      })
    },
  )

  test("uses the Ollama local/cloud preference for duplicate IDs", async () => {
    const gateway = new RoutingGateway(
      [status("ollama"), status("ollama-cloud")],
      (dispatch) =>
        dispatch.operation === "models" ?
          Response.json({ data: [{ id: "qwen3:8b" }] })
        : message(dispatch.provider),
    )

    const response = await appFor(gateway, {
      ollama: { preferLocalModels: false },
    }).request(request("qwen3:8b"))

    expect(await response.json()).toMatchObject({ id: "msg_ollama-cloud" })
  })

  test("rejects unrelated duplicates and unadvertised model IDs", async () => {
    const duplicateGateway = new RoutingGateway(
      [status("ollama"), status("mlx")],
      () => Response.json({ data: [{ id: "shared-model" }] }),
    )
    const conflict = await appFor(duplicateGateway).request(
      request("shared-model"),
    )
    expect(conflict.status).toBe(409)

    state.githubToken = "github-token"
    const emptyGateway = new RoutingGateway([], () =>
      Response.json({ data: [] }),
    )
    const missing = await appFor(emptyGateway).request(request("missing-model"))
    expect(missing.status).toBe(404)
    expect(emptyGateway.dispatches).toEqual([])
  })
})

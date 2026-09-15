import type {
  ProviderDispatch,
  ProviderGateway,
  ProviderStatus,
} from "@stuffbucket/maximal-model-contract"

import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import type { AppConfig } from "~/lib/config/config"

import { state } from "~/lib/runtime-state/state"
import { createServerApps } from "~/server"

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

  test.each([
    ["/v1/chat/completions", "chat-completions"],
    ["/v1/responses", "responses"],
    ["/v1/embeddings", "embeddings"],
    ["/chat/completions", "chat-completions"],
    ["/responses", "responses"],
    ["/embeddings", "embeddings"],
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

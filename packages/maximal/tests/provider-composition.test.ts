import type {
  ProviderHostConfigSnapshot,
  ProviderHostConfigSource,
} from "@maximal/maximal-core/provider-host"
import type {
  ProviderDispatch,
  ProviderStatus,
  ProviderTopology,
  ProviderTopologyListener,
} from "@maximal/maximal-model-contract"

import {
  ProfileValidationError,
  type ProviderPluginHostOptions,
  type ProviderPluginHostReconcileInput,
  type ProviderPluginHostReconcileResult,
} from "@maximal/maximal-models"
import { describe, expect, test } from "bun:test"

import {
  buildProviderActivation,
  createProviderPluginGateway,
} from "../src/provider-gateway"

const noop = (): void => undefined

function snapshot(
  overrides: Partial<ProviderHostConfigSnapshot> = {},
): ProviderHostConfigSnapshot {
  return {
    appDataDirectory: "/app-data",
    configStatus: { state: "ready" },
    defaultProfileDirectory: "/app-data/provider-host",
    providerHost: { mode: "plugins" },
    providers: {},
    ...overrides,
  }
}

class ConfigSource implements ProviderHostConfigSource {
  #listeners = new Set<(value: ProviderHostConfigSnapshot) => void>()
  #snapshot: ProviderHostConfigSnapshot
  disposed = false

  constructor(initial: ProviderHostConfigSnapshot) {
    this.#snapshot = initial
  }

  getSnapshot(): ProviderHostConfigSnapshot {
    return this.#snapshot
  }

  subscribe(listener: (value: ProviderHostConfigSnapshot) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  publish(value: ProviderHostConfigSnapshot): void {
    this.#snapshot = value
    for (const listener of this.#listeners) listener(value)
  }

  dispose(): Promise<void> {
    this.disposed = true
    this.#listeners.clear()
    return Promise.resolve()
  }
}

const emptyTopology: ProviderTopology = {
  diagnostics: [],
  revision: 0,
  statuses: [],
}

class FakeHost {
  disposed = 0
  readonly reconciliations: Array<
    ProviderPluginHostReconcileInput | undefined
  > = []

  reconcile(
    input?: ProviderPluginHostReconcileInput,
  ): Promise<ProviderPluginHostReconcileResult> {
    this.reconciliations.push(input)
    return Promise.resolve({
      committed: true,
      diagnostics: [],
      restartRequired: false,
      revision: this.reconciliations.length,
    })
  }

  dispatch(_input: ProviderDispatch): Promise<Response> {
    return Promise.resolve(new Response("fake"))
  }

  getStatus(_provider: string): ProviderStatus | undefined {
    return undefined
  }

  listStatuses(): ReadonlyArray<ProviderStatus> {
    return []
  }

  subscribe(listener: ProviderTopologyListener): () => void {
    listener(emptyTopology)
    return noop
  }

  dispose(): Promise<void> {
    this.disposed += 1
    return Promise.resolve()
  }
}

describe("provider activation composition", () => {
  test("converts validated legacy Anthropic providers in memory", () => {
    const activation = buildProviderActivation(
      snapshot({
        providerPlugins: {
          omlx: { config: { instances: { local: { port: 8000 } } } },
        },
        providers: {
          localAnthropic: {
            adjustInputTokens: true,
            apiKey: "test-key",
            authType: "authorization",
            baseUrl: "https://anthropic.example",
            models: { model: { temperature: 0.25, topK: 4, topP: 0.9 } },
          },
        },
      }),
    )

    expect(activation).toEqual({
      anthropic: {
        enabled: true,
        config: {
          instances: [
            {
              adjustInputTokens: true,
              aliases: ["localAnthropic"],
              apiKey: "test-key",
              authType: "authorization",
              baseURL: "https://anthropic.example",
              displayName: "localAnthropic",
              models: {
                model: { temperature: 0.25, topK: 4, topP: 0.9 },
              },
            },
          ],
        },
      },
      omlx: {
        enabled: true,
        config: { instances: { local: { port: 8000 } } },
      },
    })
  })

  test("explicit Anthropic plugin config takes precedence", () => {
    const explicit = { instances: [{ aliases: ["explicit"] }] }
    expect(
      buildProviderActivation(
        snapshot({
          providerPlugins: { anthropic: { config: explicit } },
          providers: {
            compatibility: {
              apiKey: "compatibility-key",
              baseUrl: "https://compatibility.example",
            },
          },
        }),
      ),
    ).toEqual({
      anthropic: { enabled: true, config: explicit },
    })
  })

  test("keeps System One providers out of the Anthropic compatibility plugin", () => {
    expect(
      buildProviderActivation(
        snapshot({
          providers: {
            "typesafe-jev": {
              apiKey: "typesafe-key",
              authType: "authorization",
              baseUrl: "https://api.typesafe.ai",
              type: "systemone",
            },
          },
        }),
      ),
    ).toEqual({})
  })

  test("rejects unsupported legacy types without reflecting their value", () => {
    const secretType = "unsupported-secret-value"
    expect(() =>
      buildProviderActivation(
        snapshot({ providers: { legacy: { type: secretType } } }),
      ),
    ).toThrow(ProfileValidationError)
    try {
      buildProviderActivation(
        snapshot({ providers: { legacy: { type: secretType } } }),
      )
    } catch (error) {
      expect(String(error)).not.toContain(secretType)
    }
  })

  test("turns bounded Core reload failures into failed host candidates", () => {
    expect(() =>
      buildProviderActivation(
        snapshot({ configStatus: { state: "error", reason: "parse" } }),
      ),
    ).toThrow("Provider configuration could not be reloaded (parse).")
  })
})

describe("managed provider plugin gateway", () => {
  test("uses Core paths, reconciles live provider plugin changes, and disposes once", async () => {
    const initial = snapshot()
    const source = new ConfigSource(initial)
    const host = new FakeHost()
    const starts: Array<ProviderPluginHostOptions> = []
    const gateway = await createProviderPluginGateway(
      { config: initial, configSource: source },
      {
        startHost(options) {
          starts.push(options)
          return Promise.resolve(host)
        },
      },
    )

    expect(starts).toHaveLength(1)
    expect(starts[0]?.profileDirectory).toBe("/app-data/provider-host")
    expect(host.reconciliations).toHaveLength(0)

    source.publish(
      snapshot({
        providerHost: { mode: "plugins", profileDirectory: "/profiles/next" },
        providerPlugins: { omlx: { enabled: false } },
      }),
    )
    await Bun.sleep(0)
    expect(host.reconciliations).toHaveLength(1)
    expect(host.reconciliations[0]?.profileDirectory).toBe("/profiles/next")

    source.publish(snapshot({ providerHost: { mode: "legacy" } }))
    await Bun.sleep(0)
    expect(host.reconciliations).toHaveLength(1)

    await gateway.dispose()
    await gateway.dispose()
    expect(host.disposed).toBe(1)
    expect(source.disposed).toBe(false)
  })

  test("advertises and dispatches a configured System One HTTP provider", async () => {
    const initial = snapshot({
      providers: {
        "typesafe-jev": {
          apiKey: "typesafe-key",
          authType: "authorization",
          baseUrl: "https://api.typesafe.ai",
          type: "systemone",
        },
      },
    })
    const source = new ConfigSource(initial)
    const host = new FakeHost()
    const requests: Array<Request> = []
    const fetchImplementation = (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const request =
        input instanceof Request ?
          new Request(input, init)
        : new Request(input.toString(), init)
      requests.push(request)
      return Promise.resolve(
        request.url.endsWith("/v1/models") ?
          Response.json({ models: [{ name: "jev-latest" }] })
        : Response.json({ answer: 0.6 }),
      )
    }
    const gateway = await createProviderPluginGateway(
      { config: initial, configSource: source },
      {
        fetchImplementation,
        startHost: () => Promise.resolve(host),
      },
    )

    expect(gateway.getStatus("typesafe-jev")).toMatchObject({
      state: "available",
      operations: ["models", "systemone"],
    })
    const models = await gateway.dispatch({
      operation: "models",
      provider: "typesafe-jev",
      request: new Request("http://gateway.test/v1/models"),
      signal: new AbortController().signal,
    })
    expect(await models.json()).toEqual({
      data: [
        {
          display_name: "jev-latest",
          id: "jev-latest",
          type: "model",
        },
      ],
      has_more: false,
    })
    const response = await gateway.dispatch({
      operation: "systemone",
      provider: "typesafe-jev",
      request: new Request("http://gateway.test/v1/systemone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "jev-latest" }),
      }),
      signal: new AbortController().signal,
    })

    expect(response.status).toBe(200)
    expect(requests).toHaveLength(2)
    expect(requests[0]?.url).toBe("https://api.typesafe.ai/v1/models")
    expect(requests[1]?.url).toBe("https://api.typesafe.ai/v1/systemone")
    expect(requests[1]?.headers.get("authorization")).toBe(
      "Bearer typesafe-key",
    )
    expect(await requests[1]?.json()).toEqual({ model: "jev-latest" })
    expect(host.reconciliations).toHaveLength(0)
    await gateway.dispose()
  })
})

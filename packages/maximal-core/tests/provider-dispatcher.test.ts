/* eslint-disable max-lines */
import type {
  ProviderDispatch,
  ProviderGateway,
  ProviderStatus,
  ProviderTopologyListener,
  ProviderUnsubscribe,
} from "@stuffbucket/maximal-provider-contract"

import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import type { AppConfig } from "~/lib/config/config"
import type {
  ProviderHostConfigSnapshot,
  ProviderHostConfigSource,
} from "~/lib/provider-host-types"
import type { PersistedTokenUsageEvent } from "~/lib/token-usage"

import { clearTokenTrio } from "~/lib/runtime-state/state"
import { onTokenUsageRecorded } from "~/lib/token-usage"
import { createServerApps } from "~/server"
import { createProviderDispatcher } from "~/services/providers/provider-dispatcher"

const unsubscribe: ProviderUnsubscribe = () => undefined

class FakeGateway implements ProviderGateway {
  readonly dispatches: Array<ProviderDispatch> = []
  disposeCalls = 0
  response: (dispatch: ProviderDispatch) => Promise<Response>
  private readonly onDispose: () => Promise<void>

  constructor(
    response: (dispatch: ProviderDispatch) => Promise<Response>,
    onDispose: () => Promise<void> = () => Promise.resolve(),
  ) {
    this.response = response
    this.onDispose = onDispose
  }

  async dispatch(dispatch: ProviderDispatch): Promise<Response> {
    this.dispatches.push(dispatch)
    return await this.response(dispatch)
  }

  dispose(): Promise<void> {
    this.disposeCalls += 1
    return this.onDispose()
  }

  getStatus(_provider: string): ProviderStatus | undefined {
    return undefined
  }

  listStatuses(): ReadonlyArray<ProviderStatus> {
    return []
  }

  subscribe(_listener: ProviderTopologyListener): ProviderUnsubscribe {
    return unsubscribe
  }
}

class FakeConfigSource implements ProviderHostConfigSource {
  private readonly listeners = new Set<
    (snapshot: ProviderHostConfigSnapshot) => void
  >()
  private snapshot: ProviderHostConfigSnapshot
  disposeCalls = 0

  constructor(snapshot: ProviderHostConfigSnapshot) {
    this.snapshot = snapshot
  }

  getSnapshot(): ProviderHostConfigSnapshot {
    return this.snapshot
  }

  subscribe(
    listener: (snapshot: ProviderHostConfigSnapshot) => void,
  ): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  update(snapshot: ProviderHostConfigSnapshot): void {
    this.snapshot = snapshot
    for (const listener of this.listeners) listener(snapshot)
  }

  dispose(): Promise<void> {
    this.disposeCalls += 1
    this.listeners.clear()
    return Promise.resolve()
  }
}

const configSnapshot = (
  mode: "legacy" | "dsh",
  providerPlugins?: ProviderHostConfigSnapshot["providerPlugins"],
): ProviderHostConfigSnapshot => ({
  appDataDirectory: "/data/maximal",
  defaultProfileDirectory: "/data/maximal/provider-host",
  configStatus: { state: "ready" },
  providerHost: { mode },
  providers: {},
  providerPlugins,
})

const dshConfig = (): AppConfig => ({ providerHost: { mode: "dsh" } })
const jsonHeaders = { "content-type": "application/json" }
let unsubscribeUsage: (() => void) | undefined

function decodeChunk(value: unknown): string {
  if (!(value instanceof Uint8Array)) {
    throw new TypeError("Expected a byte stream chunk")
  }
  return new TextDecoder().decode(value)
}

beforeEach(() => {
  clearTokenTrio()
  unsubscribeUsage = undefined
})

afterEach(() => {
  unsubscribeUsage?.()
  unsubscribeUsage = undefined
  clearTokenTrio()
})

// DSH dispatch cases share route setup, gateway fakes, and usage fixtures.
// eslint-disable-next-line max-lines-per-function
describe("DSH provider dispatch", () => {
  test("dispatches raw messages requests and preserves JSON usage accounting", async () => {
    let requestBody = ""
    const gateway = new FakeGateway(async (dispatch) => {
      requestBody = await dispatch.request.text()
      return Response.json({
        id: "msg_dsh",
        type: "message",
        usage: { input_tokens: 7, output_tokens: 3 },
      })
    })
    const usageEvents: Array<PersistedTokenUsageEvent> = []
    unsubscribeUsage = onTokenUsageRecorded((event) => usageEvents.push(event))
    const { publicApp } = createServerApps({
      providerGateway: gateway,
      readConfig: dshConfig,
    })
    const body = JSON.stringify({
      model: "host-model",
      messages: [{ role: "user", content: "hello" }],
      metadata: { user_id: "session_abc" },
    })

    const response = await publicApp.request("/hosted/v1/messages", {
      method: "POST",
      headers: jsonHeaders,
      body,
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: "msg_dsh" })
    expect(requestBody).toBe(body)
    expect(gateway.dispatches).toHaveLength(1)
    expect(gateway.dispatches[0]).toMatchObject({
      operation: "messages",
      provider: "hosted",
    })
    expect(gateway.dispatches[0]?.request.url).toEndWith("/hosted/v1/messages")
    expect(gateway.dispatches[0]?.signal).toBe(
      gateway.dispatches[0]?.request.signal,
    )
    expect(usageEvents).toHaveLength(1)
    expect(usageEvents[0]).toMatchObject({
      endpoint: "provider_messages",
      input_tokens: 7,
      model: "host-model",
      output_tokens: 3,
      provider_name: "hosted",
      source: "provider",
    })
  })

  test("keeps the provider response readable when usage recording fails", async () => {
    const gateway = new FakeGateway(() =>
      Promise.resolve(
        Response.json({
          id: "msg_dsh",
          type: "message",
          usage: { input_tokens: 7, output_tokens: 3 },
        }),
      ),
    )
    unsubscribeUsage = onTokenUsageRecorded(() => {
      throw new Error("usage listener failed")
    })
    const { publicApp } = createServerApps({
      providerGateway: gateway,
      readConfig: dshConfig,
    })

    const response = await publicApp.request("/hosted/v1/messages", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ model: "host-model", messages: [] }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: "msg_dsh" })
  })

  test("passes SSE through incrementally without buffering", async () => {
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined
    const encoder = new TextEncoder()
    const first =
      'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":2}}}\n\n'
    const second =
      'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":1}}\n\n'
    const gateway = new FakeGateway(() =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(streamController) {
              controller = streamController
              streamController.enqueue(encoder.encode(first))
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        ),
      ),
    )
    const { publicApp } = createServerApps({
      providerGateway: gateway,
      readConfig: dshConfig,
    })

    const response = await publicApp.request("/hosted/v1/messages", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ model: "host-model", stream: true, messages: [] }),
    })
    const reader = response.body?.getReader()
    expect(reader).toBeDefined()

    const firstChunk = await reader?.read()
    expect(decodeChunk(firstChunk?.value)).toBe(first)

    controller?.enqueue(encoder.encode(second))
    controller?.close()
    const secondChunk = await reader?.read()
    expect(decodeChunk(secondChunk?.value)).toBe(second)
    expect((await reader?.read())?.done).toBe(true)
  })

  test("dispatches models and count_tokens with contract operation names", async () => {
    const gateway = new FakeGateway((dispatch) =>
      Promise.resolve(
        dispatch.operation === "models" ?
          Response.json({ data: [] })
        : Response.json({ input_tokens: 11 }),
      ),
    )
    const { publicApp } = createServerApps({
      providerGateway: gateway,
      readConfig: dshConfig,
    })

    const models = await publicApp.request("/hosted/v1/models")
    const countTokens = await publicApp.request(
      "/hosted/v1/messages/count_tokens",
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ model: "host-model", messages: [] }),
      },
    )

    expect(models.status).toBe(200)
    expect(countTokens.status).toBe(200)
    expect(gateway.dispatches.map(({ operation }) => operation)).toEqual([
      "models",
      "count-tokens",
    ])
  })

  test("returns a stable Anthropic error when no gateway was injected", async () => {
    const { publicApp } = createServerApps({ readConfig: dshConfig })

    const response = await publicApp.request("/missing/v1/messages", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ model: "host-model", messages: [] }),
    })

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      type: "error",
      error: {
        type: "api_error",
        message: "Provider 'missing' is unavailable",
      },
    })
  })

  test("passes the request signal and observes later aborts", async () => {
    let hostSignal: AbortSignal | undefined
    const gateway = new FakeGateway((dispatch) => {
      hostSignal = dispatch.signal
      return Promise.resolve(Response.json({ data: [] }))
    })
    const { publicApp } = createServerApps({
      providerGateway: gateway,
      readConfig: dshConfig,
    })
    const abortController = new AbortController()
    const request = new Request("http://localhost/hosted/v1/models", {
      signal: abortController.signal,
    })

    await publicApp.fetch(request)
    expect(hostSignal?.aborted).toBe(false)
    abortController.abort("caller stopped")
    expect(hostSignal?.aborted).toBe(true)
    expect(hostSignal?.reason).toBe("caller stopped")
  })

  test("cancels the gateway response body when downstream cancels", async () => {
    let cancelReason: unknown
    const gateway = new FakeGateway(() =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            cancel(reason) {
              cancelReason = reason
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        ),
      ),
    )
    const { publicApp } = createServerApps({
      providerGateway: gateway,
      readConfig: dshConfig,
    })

    const response = await publicApp.request("/hosted/v1/messages", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ model: "host-model", stream: true, messages: [] }),
    })
    await response.body?.cancel("downstream stopped")

    expect(cancelReason).toBe("downstream stopped")
  })
})

// The rollout state-machine cases are kept together so transitions share fixtures.
// eslint-disable-next-line max-lines-per-function
describe("provider rollout boundary", () => {
  test("defaults to legacy and switches modes without falling back", async () => {
    let config: AppConfig = {}
    let legacyCalls = 0
    const gateway = new FakeGateway(() =>
      Promise.resolve(Response.json({ source: "dsh" })),
    )
    const dispatcher = createProviderDispatcher({
      gateway,
      readConfig: () => config,
    })
    const dispatch = () =>
      dispatcher.dispatch({
        legacy: () => {
          legacyCalls += 1
          return Promise.resolve(Response.json({ source: "legacy" }))
        },
        operation: "models",
        provider: "hosted",
        request: new Request("http://localhost/hosted/v1/models"),
        signal: AbortSignal.timeout(1_000),
      })

    expect(await (await dispatch()).json()).toEqual({ source: "legacy" })
    config = { providerHost: { mode: "dsh" } }
    expect(await (await dispatch()).json()).toEqual({ source: "dsh" })
    config = { providerHost: { mode: "legacy" } }
    expect(await (await dispatch()).json()).toEqual({ source: "legacy" })
    expect(legacyCalls).toBe(2)
    expect(gateway.dispatches).toHaveLength(1)
  })

  test("keeps a static gateway dormant and reusable across explicit rollback", async () => {
    const source = new FakeConfigSource(configSnapshot("dsh"))
    const gateway = new FakeGateway(() =>
      Promise.resolve(Response.json({ source: "dsh" })),
    )
    const dispatcher = createProviderDispatcher({
      configSource: source,
      gateway,
    })
    let legacyCalls = 0
    const dispatch = () =>
      dispatcher.dispatch({
        legacy: () => {
          legacyCalls += 1
          return Promise.resolve(Response.json({ source: "legacy" }))
        },
        operation: "models",
        provider: "hosted",
        request: new Request("http://localhost/hosted/v1/models"),
        signal: AbortSignal.timeout(1_000),
      })

    expect(await (await dispatch()).json()).toEqual({ source: "dsh" })
    source.update(configSnapshot("legacy"))
    expect(await (await dispatch()).json()).toEqual({ source: "legacy" })
    expect(gateway.disposeCalls).toBe(0)

    source.update(configSnapshot("dsh"))
    expect(await (await dispatch()).json()).toEqual({ source: "dsh" })
    expect(gateway.dispatches).toHaveLength(2)
    expect(legacyCalls).toBe(1)

    await Promise.all([dispatcher.dispose(), dispatcher.dispose()])
    expect(gateway.disposeCalls).toBe(1)
    expect(source.disposeCalls).toBe(1)
  })

  test("requires GitHub auth only for provider routes in legacy mode", async () => {
    let config: AppConfig = { providerHost: { mode: "dsh" } }
    const gateway = new FakeGateway(() =>
      Promise.resolve(Response.json({ data: [] })),
    )
    const { publicApp } = createServerApps({
      providerGateway: gateway,
      readConfig: () => config,
    })

    expect((await publicApp.request("/hosted/v1/models")).status).toBe(200)
    config = { providerHost: { mode: "legacy" } }
    const legacyResponse = await publicApp.request("/hosted/v1/models")
    expect(legacyResponse.status).toBe(401)
    expect(await legacyResponse.json()).toMatchObject({
      error: "not_authenticated",
    })
    expect(gateway.dispatches).toHaveLength(1)
  })

  test("returns 503 without legacy fallback while factory activation is pending", async () => {
    const source = new FakeConfigSource(configSnapshot("legacy"))
    const gateway = new FakeGateway(() =>
      Promise.resolve(Response.json({ source: "dsh" })),
    )
    let resolveGateway: ((gateway: FakeGateway) => void) | undefined
    const pendingGateway = new Promise<FakeGateway>((resolve) => {
      resolveGateway = resolve
    })
    const dispatcher = createProviderDispatcher({
      configSource: source,
      gatewayFactory: () => pendingGateway,
    })
    let legacyCalls = 0
    const dispatch = () =>
      dispatcher.dispatch({
        legacy: () => {
          legacyCalls += 1
          return Promise.resolve(Response.json({ source: "legacy" }))
        },
        operation: "models",
        provider: "hosted",
        request: new Request("http://localhost/hosted/v1/models"),
        signal: AbortSignal.timeout(1_000),
      })

    source.update(configSnapshot("dsh"))
    await Bun.sleep(0)
    const unavailable = await dispatch()
    expect(unavailable.status).toBe(503)
    expect(legacyCalls).toBe(0)

    resolveGateway?.(gateway)
    await Bun.sleep(0)
    expect(await (await dispatch()).json()).toEqual({ source: "dsh" })

    await dispatcher.dispose()
  })

  test("lazily activates and reconciles across live validated config changes", async () => {
    const source = new FakeConfigSource(configSnapshot("legacy"))
    const gateways: Array<FakeGateway> = []
    const observedConfigs: Array<ProviderHostConfigSnapshot> = []
    let factoryCalls = 0
    const dispatcher = createProviderDispatcher({
      configSource: source,
      gatewayFactory: ({ config, configSource }) => {
        factoryCalls += 1
        observedConfigs.push(config)
        configSource.subscribe((snapshot) => observedConfigs.push(snapshot))
        const next = new FakeGateway(() =>
          Promise.resolve(Response.json({ source: "dsh" })),
        )
        gateways.push(next)
        return next
      },
    })
    let legacyCalls = 0
    const dispatch = () =>
      dispatcher.dispatch({
        legacy: () => {
          legacyCalls += 1
          return Promise.resolve(Response.json({ source: "legacy" }))
        },
        operation: "models",
        provider: "hosted",
        request: new Request("http://localhost/hosted/v1/models"),
        signal: AbortSignal.timeout(1_000),
      })

    await dispatcher.ready()
    expect(factoryCalls).toBe(0)
    expect(await (await dispatch()).json()).toEqual({ source: "legacy" })

    source.update(configSnapshot("dsh", { hosted: { enabled: true } }))
    await Bun.sleep(0)
    expect(factoryCalls).toBe(1)
    expect(await (await dispatch()).json()).toEqual({ source: "dsh" })

    source.update(
      configSnapshot("dsh", {
        hosted: { config: { nested: ["opaque", { value: 2 }] } },
      }),
    )
    expect(observedConfigs.at(-1)?.providerPlugins).toEqual({
      hosted: { config: { nested: ["opaque", { value: 2 }] } },
    })
    expect(factoryCalls).toBe(1)

    source.update(configSnapshot("legacy"))
    await Bun.sleep(0)
    expect(gateways[0]?.disposeCalls).toBe(1)
    expect(await (await dispatch()).json()).toEqual({ source: "legacy" })

    source.update(configSnapshot("dsh"))
    await Bun.sleep(0)
    expect(factoryCalls).toBe(2)
    expect(await (await dispatch()).json()).toEqual({ source: "dsh" })
    expect(legacyCalls).toBe(2)

    await dispatcher.dispose()
    expect(gateways[1]?.disposeCalls).toBe(1)
    expect(source.disposeCalls).toBe(1)
  })

  test("returns 503 without legacy fallback while factory activation is pending", async () => {
    const source = new FakeConfigSource(configSnapshot("dsh"))
    const gateway = new FakeGateway(() =>
      Promise.resolve(Response.json({ source: "dsh" })),
    )
    let resolveGateway: ((gateway: FakeGateway) => void) | undefined
    const pendingGateway = new Promise<FakeGateway>((resolve) => {
      resolveGateway = resolve
    })
    let legacyCalls = 0
    const dispatcher = createProviderDispatcher({
      configSource: source,
      gatewayFactory: () => pendingGateway,
    })
    await Bun.sleep(0)

    const unavailable = await dispatcher.dispatch({
      legacy: () => {
        legacyCalls += 1
        return Promise.resolve(Response.json({ source: "legacy" }))
      },
      operation: "models",
      provider: "hosted",
      request: new Request("http://localhost/hosted/v1/models"),
      signal: AbortSignal.timeout(1_000),
    })
    expect(unavailable.status).toBe(503)
    expect(legacyCalls).toBe(0)

    resolveGateway?.(gateway)
    await dispatcher.ready()
    const activated = await dispatcher.dispatch({
      legacy: () => Promise.resolve(Response.json({ source: "legacy" })),
      operation: "models",
      provider: "hosted",
      request: new Request("http://localhost/hosted/v1/models"),
      signal: AbortSignal.timeout(1_000),
    })
    expect(await activated.json()).toEqual({ source: "dsh" })
    await dispatcher.dispose()
  })

  test("releases the gateway lease when response wrapping fails", async () => {
    const source = new FakeConfigSource(configSnapshot("legacy"))
    const response = Response.json({ source: "dsh" })
    const lockedReader = response.body?.getReader()
    expect(lockedReader).toBeDefined()
    const gateway = new FakeGateway(() => Promise.resolve(response))
    const dispatcher = createProviderDispatcher({
      configSource: source,
      gatewayFactory: () => gateway,
    })
    source.update(configSnapshot("dsh"))
    await Bun.sleep(0)

    let dispatchError: unknown
    try {
      await dispatcher.dispatch({
        legacy: () => Promise.resolve(Response.json({ source: "legacy" })),
        operation: "models",
        provider: "hosted",
        request: new Request("http://localhost/hosted/v1/models"),
        signal: AbortSignal.timeout(1_000),
      })
    } catch (error) {
      dispatchError = error
    }
    expect(dispatchError).toBeInstanceOf(TypeError)

    source.update(configSnapshot("legacy"))
    await Bun.sleep(0)
    expect(gateway.disposeCalls).toBe(1)

    await lockedReader?.cancel()
    lockedReader?.releaseLock()
    await dispatcher.dispose()
  })

  test("drains an open response body before retiring a factory gateway", async () => {
    const source = new FakeConfigSource(configSnapshot("legacy"))
    let streamController:
      | ReadableStreamDefaultController<Uint8Array>
      | undefined
    let cancelled: unknown
    const gateway = new FakeGateway(() =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              streamController = controller
            },
            cancel(reason) {
              cancelled = reason
            },
          }),
        ),
      ),
    )
    const dispatcher = createProviderDispatcher({
      configSource: source,
      gatewayFactory: () => gateway,
    })
    source.update(configSnapshot("dsh"))
    await Bun.sleep(0)

    const response = await dispatcher.dispatch({
      legacy: () => Promise.resolve(Response.json({ source: "legacy" })),
      operation: "models",
      provider: "hosted",
      request: new Request("http://localhost/hosted/v1/models"),
      signal: AbortSignal.timeout(1_000),
    })
    expect(streamController).toBeDefined()

    source.update(configSnapshot("legacy"))
    await Bun.sleep(0)
    expect(gateway.disposeCalls).toBe(0)

    await response.body?.cancel("caller stopped")
    await Bun.sleep(0)
    expect(cancelled).toBe("caller stopped")
    expect(gateway.disposeCalls).toBe(1)
    await dispatcher.dispose()
  })

  test("preserves a streamed response and retires its gateway after EOF", async () => {
    const source = new FakeConfigSource(configSnapshot("legacy"))
    const encoder = new TextEncoder()
    let streamController:
      | ReadableStreamDefaultController<Uint8Array>
      | undefined
    const gateway = new FakeGateway(() =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              streamController = controller
              controller.enqueue(encoder.encode("first"))
            },
          }),
          {
            headers: { "x-provider": "factory" },
            status: 206,
            statusText: "Partial Content",
          },
        ),
      ),
    )
    const dispatcher = createProviderDispatcher({
      configSource: source,
      gatewayFactory: () => gateway,
    })
    source.update(configSnapshot("dsh"))
    await Bun.sleep(0)

    const response = await dispatcher.dispatch({
      legacy: () => Promise.resolve(Response.json({ source: "legacy" })),
      operation: "models",
      provider: "hosted",
      request: new Request("http://localhost/hosted/v1/models"),
      signal: AbortSignal.timeout(1_000),
    })
    const reader = response.body?.getReader()
    source.update(configSnapshot("legacy"))

    expect(response.status).toBe(206)
    expect(response.statusText).toBe("Partial Content")
    expect(response.headers.get("x-provider")).toBe("factory")
    expect(decodeChunk((await reader?.read())?.value)).toBe("first")
    expect(gateway.disposeCalls).toBe(0)

    streamController?.close()
    expect((await reader?.read())?.done).toBe(true)
    await Bun.sleep(0)
    expect(gateway.disposeCalls).toBe(1)
    await dispatcher.dispose()
  })

  test("drains concurrent response leases through EOF and stream error", async () => {
    const source = new FakeConfigSource(configSnapshot("legacy"))
    const controllers: Array<ReadableStreamDefaultController<Uint8Array>> = []
    const gateway = new FakeGateway(() =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controllers.push(controller)
            },
          }),
        ),
      ),
    )
    const dispatcher = createProviderDispatcher({
      configSource: source,
      gatewayFactory: () => gateway,
    })
    source.update(configSnapshot("dsh"))
    await Bun.sleep(0)

    const responses = await Promise.all([
      dispatcher.dispatch({
        legacy: () => Promise.resolve(Response.json({ source: "legacy" })),
        operation: "models",
        provider: "hosted",
        request: new Request("http://localhost/hosted/v1/models"),
        signal: AbortSignal.timeout(1_000),
      }),
      dispatcher.dispatch({
        legacy: () => Promise.resolve(Response.json({ source: "legacy" })),
        operation: "models",
        provider: "hosted",
        request: new Request("http://localhost/hosted/v1/models"),
        signal: AbortSignal.timeout(1_000),
      }),
    ])
    const firstReader = responses[0].body?.getReader()
    const secondReader = responses[1].body?.getReader()
    const firstRead = firstReader?.read()
    const secondRead = secondReader?.read()

    source.update(configSnapshot("legacy"))
    await Bun.sleep(0)
    expect(gateway.disposeCalls).toBe(0)

    controllers[0]?.close()
    expect((await firstRead)?.done).toBe(true)
    await Bun.sleep(0)
    expect(gateway.disposeCalls).toBe(0)

    const streamError = new Error("stream failed")
    controllers[1]?.error(streamError)
    let observedError: unknown
    try {
      await secondRead
    } catch (error) {
      observedError = error
    }
    expect(observedError).toBe(streamError)
    await Bun.sleep(0)
    expect(gateway.disposeCalls).toBe(1)

    await dispatcher.dispose()
  })

  test("drains a pending dispatch before retiring a factory gateway", async () => {
    const source = new FakeConfigSource(configSnapshot("legacy"))
    let resolveResponse: ((response: Response) => void) | undefined
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveResponse = resolve
    })
    const gateway = new FakeGateway(() => pendingResponse)
    const dispatcher = createProviderDispatcher({
      configSource: source,
      gatewayFactory: () => gateway,
    })
    source.update(configSnapshot("dsh"))
    await Bun.sleep(0)

    const responsePromise = dispatcher.dispatch({
      legacy: () => Promise.resolve(Response.json({ source: "legacy" })),
      operation: "models",
      provider: "hosted",
      request: new Request("http://localhost/hosted/v1/models"),
      signal: AbortSignal.timeout(1_000),
    })
    source.update(configSnapshot("legacy"))
    await Bun.sleep(0)
    expect(gateway.disposeCalls).toBe(0)

    resolveResponse?.(Response.json({ source: "dsh" }))
    const response = await responsePromise
    expect(gateway.disposeCalls).toBe(0)
    expect(await response.json()).toEqual({ source: "dsh" })
    await Bun.sleep(0)
    expect(gateway.disposeCalls).toBe(1)
    await dispatcher.dispose()
  })

  test("contains transition disposal failures and still reactivates", async () => {
    const source = new FakeConfigSource(configSnapshot("legacy"))
    const first = new FakeGateway(
      () => Promise.resolve(Response.json({ generation: 1 })),
      () => Promise.reject(new Error("dispose failed")),
    )
    const second = new FakeGateway(() =>
      Promise.resolve(Response.json({ generation: 2 })),
    )
    let factoryCalls = 0
    const dispatcher = createProviderDispatcher({
      configSource: source,
      gatewayFactory: () => (factoryCalls++ === 0 ? first : second),
    })

    source.update(configSnapshot("dsh"))
    await Bun.sleep(0)
    source.update(configSnapshot("legacy"))
    await Bun.sleep(0)
    expect(first.disposeCalls).toBe(1)

    source.update(configSnapshot("dsh"))
    await Bun.sleep(0)
    const response = await dispatcher.dispatch({
      legacy: () => Promise.resolve(Response.json({ source: "legacy" })),
      operation: "models",
      provider: "hosted",
      request: new Request("http://localhost/hosted/v1/models"),
      signal: AbortSignal.timeout(1_000),
    })
    expect(await response.json()).toEqual({ generation: 2 })

    await dispatcher.dispose()
    expect(second.disposeCalls).toBe(1)
    expect(source.disposeCalls).toBe(1)
  })

  test("activates the latest DSH snapshot after a pending candidate fails", async () => {
    const source = new FakeConfigSource(configSnapshot("legacy"))
    const gateway = new FakeGateway(() =>
      Promise.resolve(Response.json({ source: "corrected" })),
    )
    let rejectFirst: ((reason?: unknown) => void) | undefined
    const firstCandidate = new Promise<FakeGateway>((_resolve, reject) => {
      rejectFirst = reject
    })
    const observedConfigs: Array<ProviderHostConfigSnapshot> = []
    let factoryCalls = 0
    const dispatcher = createProviderDispatcher({
      configSource: source,
      gatewayFactory: ({ config }) => {
        observedConfigs.push(config)
        factoryCalls += 1
        return factoryCalls === 1 ? firstCandidate : gateway
      },
    })
    const pendingSnapshot = configSnapshot("dsh", {
      hosted: { config: { profile: "pending" } },
    })
    const correctedSnapshot = configSnapshot("dsh", {
      hosted: { config: { profile: "corrected" } },
    })

    source.update(pendingSnapshot)
    await Bun.sleep(0)
    expect(factoryCalls).toBe(1)
    source.update(correctedSnapshot)
    rejectFirst?.(new Error("pending profile failed"))
    await Bun.sleep(0)
    await Bun.sleep(0)

    expect(factoryCalls).toBe(2)
    expect(observedConfigs[1]).toBe(correctedSnapshot)
    const response = await dispatcher.dispatch({
      legacy: () => Promise.resolve(Response.json({ source: "legacy" })),
      operation: "models",
      provider: "hosted",
      request: new Request("http://localhost/hosted/v1/models"),
      signal: AbortSignal.timeout(1_000),
    })
    expect(await response.json()).toEqual({ source: "corrected" })

    await dispatcher.dispose()
    expect(gateway.disposeCalls).toBe(1)
  })

  test("retries activation after dsh to legacy to dsh while a candidate is pending", async () => {
    const source = new FakeConfigSource(configSnapshot("legacy"))
    const staleGateway = new FakeGateway(() =>
      Promise.resolve(Response.json({ source: "stale" })),
    )
    const currentGateway = new FakeGateway(() =>
      Promise.resolve(Response.json({ source: "current" })),
    )
    let resolveFirst: ((gateway: FakeGateway) => void) | undefined
    const firstCandidate = new Promise<FakeGateway>((resolve) => {
      resolveFirst = resolve
    })
    let factoryCalls = 0
    const dispatcher = createProviderDispatcher({
      configSource: source,
      gatewayFactory: () => {
        factoryCalls += 1
        return factoryCalls === 1 ? firstCandidate : currentGateway
      },
    })

    source.update(configSnapshot("dsh"))
    await Bun.sleep(0)
    source.update(configSnapshot("legacy"))
    source.update(configSnapshot("dsh"))
    expect(factoryCalls).toBe(1)

    resolveFirst?.(staleGateway)
    await Bun.sleep(0)
    await Bun.sleep(0)

    expect(staleGateway.disposeCalls).toBe(1)
    expect(factoryCalls).toBe(2)
    const response = await dispatcher.dispatch({
      legacy: () => Promise.resolve(Response.json({ source: "legacy" })),
      operation: "models",
      provider: "hosted",
      request: new Request("http://localhost/hosted/v1/models"),
      signal: AbortSignal.timeout(1_000),
    })
    expect(await response.json()).toEqual({ source: "current" })

    await dispatcher.dispose()
    expect(currentGateway.disposeCalls).toBe(1)
  })

  test("contains final disposal rejection and cleans up once concurrently", async () => {
    const source = new FakeConfigSource(configSnapshot("dsh"))
    const gateway = new FakeGateway(
      () => Promise.resolve(Response.json({ data: [] })),
      () => Promise.reject(new Error("final disposal failed")),
    )
    const dispatcher = createProviderDispatcher({
      configSource: source,
      gateway,
    })

    const firstDisposal = dispatcher.dispose()
    const secondDisposal = dispatcher.dispose()
    expect(secondDisposal).toBe(firstDisposal)
    await Promise.all([firstDisposal, secondDisposal, dispatcher.dispose()])

    expect(gateway.disposeCalls).toBe(1)
    expect(source.disposeCalls).toBe(1)
  })
})

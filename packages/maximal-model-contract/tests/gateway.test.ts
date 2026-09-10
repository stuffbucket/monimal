import assert from "node:assert/strict"
import test from "node:test"

import type {
  ProviderDiagnostic,
  ProviderDiagnosticCode,
  ProviderDispatch,
  ProviderGateway,
  ProviderOperation,
  ProviderStatus,
  ProviderTopology,
  ProviderTopologyListener,
  ProviderUnsubscribe,
} from "../src/index.ts"

const freezeDiagnostic = (diagnostic: ProviderDiagnostic): ProviderDiagnostic =>
  Object.freeze({ ...diagnostic })

const freezeStatus = (status: ProviderStatus): ProviderStatus =>
  Object.freeze({
    ...status,
    diagnostics: Object.freeze(
      status.diagnostics.map((diagnostic) => freezeDiagnostic(diagnostic)),
    ),
    operations: Object.freeze([...status.operations]),
  })

const availableStatus = (provider: string): ProviderStatus =>
  freezeStatus({
    diagnostics: [],
    operations: ["messages", "count-tokens", "models"],
    provider,
    state: "available",
  })

class SnapshotFakeGateway implements ProviderGateway {
  readonly #listeners = new Set<ProviderTopologyListener>()
  #disposed = false
  #revision = 0
  #statuses: ReadonlyArray<ProviderStatus>

  constructor(statuses: ReadonlyArray<ProviderStatus>) {
    this.#statuses = Object.freeze(
      statuses.map((status) => freezeStatus(status)),
    )
  }

  async dispatch(dispatch: ProviderDispatch): Promise<Response> {
    await Promise.resolve()
    this.#assertActive()
    return new Response(dispatch.request.body, {
      headers: dispatch.request.headers,
      status: 200,
    })
  }

  dispose(): Promise<void> {
    if (!this.#disposed) {
      this.#disposed = true
      this.#listeners.clear()
    }
    return Promise.resolve()
  }

  getStatus(provider: string): ProviderStatus | undefined {
    return this.#statuses.find((status) => status.provider === provider)
  }

  listStatuses(): ReadonlyArray<ProviderStatus> {
    return this.#statuses
  }

  publish(statuses: ReadonlyArray<ProviderStatus>): void {
    this.#assertActive()
    this.#statuses = Object.freeze(
      statuses.map((status) => freezeStatus(status)),
    )
    this.#revision += 1
    const topology = this.#topology()
    for (const listener of this.#listeners) listener(topology)
  }

  subscribe(listener: ProviderTopologyListener): ProviderUnsubscribe {
    this.#assertActive()
    this.#listeners.add(listener)
    listener(this.#topology())

    let subscribed = true
    return () => {
      if (!subscribed) return
      subscribed = false
      this.#listeners.delete(listener)
    }
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error("gateway disposed")
  }

  #topology(): ProviderTopology {
    return Object.freeze({
      diagnostics: Object.freeze([]),
      revision: this.#revision,
      statuses: this.#statuses,
    })
  }
}

type DispatchHandler = (dispatch: ProviderDispatch) => Promise<Response>

const noop = (): void => undefined

const emptyResponse = (): Promise<Response> => Promise.resolve(new Response())

class PassthroughFakeGateway implements ProviderGateway {
  readonly #handler: DispatchHandler
  readonly #status = availableStatus("passthrough")

  constructor(handler: DispatchHandler) {
    this.#handler = handler
  }

  dispatch(dispatch: ProviderDispatch): Promise<Response> {
    return this.#handler(dispatch)
  }

  dispose(): Promise<void> {
    return Promise.resolve()
  }

  getStatus(provider: string): ProviderStatus | undefined {
    return provider === this.#status.provider ? this.#status : undefined
  }

  listStatuses(): ReadonlyArray<ProviderStatus> {
    return Object.freeze([this.#status])
  }

  subscribe(listener: ProviderTopologyListener): ProviderUnsubscribe {
    listener(
      Object.freeze({
        diagnostics: Object.freeze([]),
        revision: 0,
        statuses: this.listStatuses(),
      }),
    )
    return noop
  }
}

const acceptsGateway = (gateway: ProviderGateway): ProviderGateway => gateway

const diagnosticCodes: ReadonlyArray<ProviderDiagnosticCode> = [
  "provider-missing",
  "provider-disabled",
  "provider-invalid",
  "provider-load-failed",
  "provider-activation-failed",
  "provider-conflict",
  "provider-disposal-failed",
  "provider-unavailable",
]

void test("independent gateways are substitutable for the contract", () => {
  const snapshot = acceptsGateway(
    new SnapshotFakeGateway([availableStatus("snapshot")]),
  )
  const passthrough = acceptsGateway(new PassthroughFakeGateway(emptyResponse))

  assert.equal(snapshot.getStatus("snapshot")?.state, "available")
  assert.equal(passthrough.getStatus("passthrough")?.state, "available")
  assert.equal(diagnosticCodes.length, 8)
})

void test("status and topology values are deeply immutable snapshots", () => {
  const gateway = new SnapshotFakeGateway([availableStatus("alpha")])
  const initialList = gateway.listStatuses()
  const initialStatus = gateway.getStatus("alpha")
  assert.ok(initialStatus)

  const mutableList = initialList as Array<ProviderStatus>
  const mutableOperations = initialStatus.operations as Array<ProviderOperation>
  assert.throws(() => mutableList.push(availableStatus("beta")), TypeError)
  assert.throws(() => mutableOperations.push("models"), TypeError)

  const topologies: Array<ProviderTopology> = []
  gateway.subscribe((topology) => topologies.push(topology))
  const initialTopology = topologies[0]
  assert.ok(initialTopology)
  const mutableStatuses = initialTopology.statuses as Array<ProviderStatus>
  assert.throws(() => mutableStatuses.pop(), TypeError)

  gateway.publish([availableStatus("beta")])
  assert.deepEqual(
    initialList.map(({ provider }) => provider),
    ["alpha"],
  )
  assert.equal(initialTopology.revision, 0)
  assert.equal(topologies[1]?.revision, 1)
})

void test("subscriptions publish immediately, unsubscribe, and stop on disposal", async () => {
  const gateway = new SnapshotFakeGateway([availableStatus("alpha")])
  const revisions: Array<number> = []
  const unsubscribe = gateway.subscribe(({ revision }) =>
    revisions.push(revision),
  )

  gateway.publish([availableStatus("beta")])
  unsubscribe()
  unsubscribe()
  gateway.publish([availableStatus("gamma")])
  assert.deepEqual(revisions, [0, 1])

  let callsAfterDispose = 0
  gateway.subscribe(() => {
    callsAfterDispose += 1
  })
  assert.equal(callsAfterDispose, 1)

  await gateway.dispose()
  await gateway.dispose()
  assert.throws(() => gateway.subscribe(() => undefined), /gateway disposed/)
  await assert.rejects(
    gateway.dispatch({
      operation: "models",
      provider: "gamma",
      request: new Request("https://provider.invalid/v1/models"),
      signal: new AbortController().signal,
    }),
    /gateway disposed/,
  )
  assert.equal(callsAfterDispose, 1)
})

void test("dispatch preserves streaming responses and caller cancellation", async () => {
  const abortController = new AbortController()
  const cancellation = new Error("caller cancelled")
  const request = new Request("https://provider.invalid/v1/messages", {
    method: "POST",
  })
  let seenDispatch: ProviderDispatch | undefined
  let upstreamResponse: Response | undefined

  const gateway = new PassthroughFakeGateway((dispatch) => {
    seenDispatch = dispatch
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("first"))
        dispatch.signal.addEventListener(
          "abort",
          () => controller.error(dispatch.signal.reason),
          { once: true },
        )
      },
    })
    upstreamResponse = new Response(body)
    return Promise.resolve(upstreamResponse)
  })

  const response = await gateway.dispatch({
    operation: "messages",
    provider: "passthrough",
    request,
    signal: abortController.signal,
  })

  assert.equal(response, upstreamResponse)
  assert.ok(seenDispatch)
  assert.equal(seenDispatch.request, request)
  assert.equal(seenDispatch.signal, abortController.signal)
  assert.ok(response.body)

  const reader = response.body.getReader()
  const first = await reader.read()
  assert.equal(new TextDecoder().decode(first.value), "first")

  abortController.abort(cancellation)
  await assert.rejects(
    reader.read(),
    (error: unknown) => error === cancellation,
  )
})

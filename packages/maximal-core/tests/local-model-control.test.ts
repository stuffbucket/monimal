import type {
  LocalModelCatalogEntry,
  LocalModelCatalogListener,
  LocalModelControl,
  LocalModelProgressListener,
} from "@stuffbucket/maximal-model-contract"

import { describe, expect, test } from "bun:test"

import type { ControlTopic } from "~/lib/live/contract"
import type { ControlSnapshot } from "~/lib/live/resources"

import { ControlHub } from "~/lib/live/hub"
import { LocalModelOperations } from "~/routes/control/local-models"
import { createControlRoutes } from "~/routes/control/route"

const model: LocalModelCatalogEntry = {
  capabilities: { input: ["text"], output: ["text"] },
  context: { contextWindow: 4096, maxOutputTokens: 1024 },
  displayName: "Local Fixture",
  expectedBytes: 128,
  format: "gguf",
  key: "fixture",
  modelId: "local/fixture",
  publication: "aggregate",
  state: "registered",
}

class RecordingHub extends ControlHub<ControlSnapshot> {
  readonly events: Array<{ data: unknown; topic: ControlTopic }> = []

  constructor() {
    super({ buildSnapshot: () => Promise.reject(new Error("unused")) })
  }

  override emit(topic: ControlTopic, data: unknown): void {
    this.events.push({ data, topic })
  }
}

function deferred<T>(): {
  promise: Promise<T>
  reject: (error: unknown) => void
  resolve: (value: T) => void
} {
  let reject!: (error: unknown) => void
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept
    reject = decline
  })
  return { promise, reject, resolve }
}

async function settle(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

const noop = (): void => undefined
const rejectEnsure = (): Promise<LocalModelCatalogEntry> =>
  Promise.reject(new Error("/private/runner: source URL failed"))

function rpc(
  operations: LocalModelOperations,
  hub: RecordingHub,
  request: { method: string; params?: unknown },
): Promise<Response> {
  const app = createControlRoutes({
    getRequestIp: () => "127.0.0.1",
    hub,
    localModelOperations: operations,
  })
  return Promise.resolve(
    app.request("/rpc", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: request.method,
        params: request.params,
      }),
    }),
  )
}

describe("local model control", () => {
  test("lists and publishes only explicitly projected fields", async () => {
    const hub = new RecordingHub()
    let listener: LocalModelCatalogListener | undefined
    const unsafeModel = { ...model, path: "/private/model.gguf" }
    const control: LocalModelControl = {
      ensure: () => Promise.resolve(model),
      list: () => ({ models: [unsafeModel], revision: 1 }),
      subscribe: (next) => {
        listener = next
        return noop
      },
    }
    const operations = new LocalModelOperations({
      control: () => control,
      hub: () => hub,
    })

    const response = await rpc(operations, hub, {
      method: "localModels/list",
    })
    expect(response.status).toBe(200)
    const payload = (await response.json()) as {
      result: { models: Array<Record<string, unknown>> }
    }
    expect(payload.result.models[0]?.path).toBeUndefined()

    listener?.({ models: [unsafeModel], revision: 2 })
    const event = hub.events.at(-1)?.data as {
      snapshot: { models: Array<Record<string, unknown>> }
    }
    expect(event.snapshot.models[0]?.path).toBeUndefined()
    operations.dispose()
  })

  test("deduplicates ensures and emits bounded progress and completion", async () => {
    const hub = new RecordingHub()
    const pending = deferred<LocalModelCatalogEntry>()
    let onProgress: LocalModelProgressListener | undefined
    const control: LocalModelControl = {
      ensure: (_key, _signal, next) => {
        onProgress = next
        return pending.promise
      },
      list: () => ({ models: [model], revision: 1 }),
      subscribe: () => noop,
    }
    const operations = new LocalModelOperations({
      control: () => control,
      hub: () => hub,
    })

    const first = operations.ensure("fixture")
    expect(operations.ensure("fixture")).toEqual({ ...first, started: false })
    onProgress?.({
      completedBytes: 64,
      modelKey: "fixture",
      phase: "downloading",
      totalBytes: 128,
      origin: "https://private.invalid/model",
    } as Parameters<LocalModelProgressListener>[0])
    pending.resolve({
      ...model,
      state: "ready",
      runnerPath: "/private/runner",
    } as LocalModelCatalogEntry)
    await settle()

    expect(operations.activeOperationCount).toBe(0)
    expect(hub.events.map(({ data }) => data)).toEqual([
      {
        type: "progress",
        operationId: first.operationId,
        progress: {
          completedBytes: 64,
          modelKey: "fixture",
          phase: "downloading",
          totalBytes: 128,
        },
      },
      {
        type: "completed",
        operationId: first.operationId,
        model: { ...model, state: "ready" },
      },
    ])
  })

  test("cancels by operation ID and clears operations on disposal", async () => {
    const hub = new RecordingHub()
    let signal: AbortSignal | undefined
    let unsubscribed = false
    const unsubscribe = (): void => {
      unsubscribed = true
    }
    const control: LocalModelControl = {
      ensure: (_key, nextSignal) => {
        signal = nextSignal
        return new Promise((_resolve, reject) => {
          nextSignal.addEventListener(
            "abort",
            () => reject(new Error("cancelled")),
            { once: true },
          )
        })
      },
      list: () => ({ models: [model], revision: 1 }),
      subscribe: () => unsubscribe,
    }
    const operations = new LocalModelOperations({
      control: () => control,
      hub: () => hub,
    })
    const started = operations.ensure("fixture")

    expect(operations.cancel(started.operationId)).toEqual({
      cancelled: true,
      operationId: started.operationId,
    })
    await settle()
    expect(signal?.aborted).toBe(true)
    expect(operations.activeOperationCount).toBe(0)
    expect(hub.events.at(-1)?.data).toEqual({
      type: "cancelled",
      operationId: started.operationId,
      error: {
        message: "Local model provisioning was cancelled.",
        retryable: false,
      },
    })

    operations.list()
    operations.dispose()
    expect(unsubscribed).toBe(true)
    expect(operations.cancel(started.operationId).cancelled).toBe(false)
  })

  test("bounds provider failures and validates RPC identifiers", async () => {
    const hub = new RecordingHub()
    const control: LocalModelControl = {
      ensure: rejectEnsure,
      list: () => ({ models: [model], revision: 1 }),
      subscribe: () => noop,
    }
    const operations = new LocalModelOperations({
      control: () => control,
      hub: () => hub,
    })
    operations.ensure("fixture")
    await settle()
    expect(JSON.stringify(hub.events)).not.toContain("private")
    expect(JSON.stringify(hub.events)).not.toContain("source URL")

    const response = await rpc(operations, hub, {
      method: "localModels/cancel",
      params: { operationId: "x".repeat(201) },
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ error: { code: -32602 } })
    operations.dispose()
  })
})

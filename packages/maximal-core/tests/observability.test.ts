import {
  TrafficOverviewQuerySchema,
  TrafficOverviewSchema,
  TrafficRequestDetailSchema,
  TrafficRequestListQuerySchema,
  TrafficRequestListSchema,
  type TrafficCompletionObservation,
  type TrafficContextObservation,
  type TrafficDispatchObservation,
  type TrafficObservationHandle,
  type TrafficTokenObservation,
  type TrafficObservationStart,
  type TrafficObserver,
} from "@stuffbucket/maximal-observability-contract"
import { Database } from "bun:sqlite"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { Hono } from "hono"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { requestContext } from "~/lib/http/request-context"
import { traceIdMiddleware } from "~/lib/http/trace"
import { createTrafficObservationMiddleware } from "~/lib/observability/middleware"
import {
  closeTrafficStore,
  SqliteTrafficObserver,
} from "~/lib/observability/store"
import {
  closeUsageStore,
  getTokenUsageEventsPage,
  recordTokenUsageEvent,
} from "~/lib/token-usage"

const DB_PATH_ENV = "COPILOT_API_SQLITE_DB_PATH"
let temporaryDirectory = ""

beforeEach(async () => {
  temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "maximal-traffic-"),
  )
  process.env[DB_PATH_ENV] = path.join(temporaryDirectory, "traffic.sqlite")
  await closeTrafficStore()
  await closeUsageStore()
})

afterEach(async () => {
  await closeTrafficStore()
  await closeUsageStore()
  Reflect.deleteProperty(process.env, DB_PATH_ENV)
  await fs.rm(temporaryDirectory, { recursive: true, force: true })
})

function start(requestId: string, acceptedAt: string): TrafficObservationStart {
  return {
    identity: {
      requestId,
      traceId: `trace-${requestId}`,
      sessionId: null,
      parentRequestId: null,
      clientRequestId: null,
    },
    acceptedAt,
    route: { method: "POST", path: "/v1/messages", operation: "messages" },
    attribution: {
      source: "copilot",
      client: null,
      project: null,
      provider: "copilot",
      model: "claude-test",
      parentSessionId: null,
      subagent: null,
      compactType: null,
    },
    context: {
      messageCount: 1,
      toolDefinitionCount: 0,
      contextWindowTokens: null,
      requestedMaxOutputTokens: 100,
      usedTokens: null,
      usedRatio: null,
    },
    size: { requestBytes: 42, responseBytes: null, responseChunks: null },
  }
}

function finish(
  at: string,
  outcome: "succeeded" | "failed" | "cancelled" = "succeeded",
): TrafficCompletionObservation {
  return {
    at,
    outcome,
    dispatch: {
      attemptCount: 1,
      retryCount: 0,
      statusCode: outcome === "failed" ? 500 : 200,
      streamed: true,
      upstreamRequestId: null,
      requestedModel: "claude-test",
      resolvedModel: "claude-test",
    },
    tokens: null,
    size: { requestBytes: 42, responseBytes: 12, responseChunks: 2 },
    response: { stopReason: null, toolUseCount: null },
    error:
      outcome === "failed" ?
        {
          category: "provider",
          code: "upstream_failure",
          message: "Provider request failed",
          retryable: true,
        }
      : null,
  }
}

function observer(dbPath = process.env[DB_PATH_ENV]): SqliteTrafficObserver {
  return new SqliteTrafficObserver({
    dbPath,
    open: (filename) => Promise.resolve(new Database(filename)),
    now: () => new Date("2026-09-07T12:00:00.000Z"),
  })
}

describe("SQLite traffic observability", () => {
  test("persists lifecycle, zero-token completion, and contract-valid queries", async () => {
    const traffic = observer()
    const handle = traffic.beginRequest(
      start("request-a", "2026-09-07T11:59:59.000Z"),
    )
    handle.recordDispatch({
      at: "2026-09-07T11:59:59.100Z",
      attribution: start("request-a", "2026-09-07T11:59:59.000Z").attribution,
      dispatch: {
        attemptCount: 1,
        retryCount: 0,
        statusCode: null,
        streamed: true,
        upstreamRequestId: null,
        requestedModel: "claude-test",
        resolvedModel: "claude-test",
      },
    })
    handle.recordFirstResponse({
      at: "2026-09-07T11:59:59.200Z",
      statusCode: 200,
      streamed: true,
    })
    handle.complete(finish("2026-09-07T12:00:00.000Z"))
    handle.recordTokens({
      at: "2026-09-07T12:00:01.000Z",
      tokens: {
        inputTokens: 99,
        outputTokens: 99,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        reasoningTokens: 0,
        totalTokens: 198,
        totalNanoAiu: 0,
      },
    })

    const detail = await traffic.getRequest("request-a")
    expect(detail).not.toBeNull()
    TrafficRequestDetailSchema.parse(detail)
    expect(detail?.request.tokens).toBeNull()
    expect(detail?.lifecycle.map(({ kind }) => kind)).toEqual([
      "accepted",
      "dispatch-started",
      "response-started",
      "completed",
    ])
    expect(detail?.request.size).toMatchObject({
      requestBytes: 42,
      responseBytes: 12,
      responseChunks: 2,
    })

    const query = TrafficOverviewQuerySchema.parse({})
    const overview = await traffic.getOverview(query)
    TrafficOverviewSchema.parse(overview)
    expect(overview.totals).toMatchObject({
      requests: 1,
      succeeded: 1,
      totalTokens: 0,
    })
    await traffic.close()
  })

  test("recovers stale active rows as cancelled", async () => {
    const first = observer()
    first.beginRequest(start("stale-request", "2026-09-07T11:00:00.000Z"))
    expect((await first.getRequest("stale-request"))?.request.state).toBe(
      "accepted",
    )
    await first.close()

    const reopened = observer()
    const recovered = await reopened.getRequest("stale-request")
    TrafficRequestDetailSchema.parse(recovered)
    expect(recovered?.request).toMatchObject({
      state: "completed",
      outcome: "cancelled",
    })
    expect(recovered?.lifecycle.at(-1)?.kind).toBe("completed")
    await reopened.close()
  })

  test("backfills token rows once with deterministic legacy IDs and preserves token reads", async () => {
    recordTokenUsageEvent({
      endpoint: "responses",
      input_tokens: 7,
      output_tokens: 3,
      model: "gpt-test",
      source: "copilot",
    })
    const traffic = observer()
    const query = TrafficRequestListQuerySchema.parse({ limit: 10 })
    const first = await traffic.listRequests(query)
    const second = await traffic.listRequests(query)
    TrafficRequestListSchema.parse(first)
    expect(first.items).toHaveLength(1)
    expect(second.items).toHaveLength(1)
    expect(first.items[0]?.identity.requestId).toBe("legacy-token-usage-1")
    expect(first.items[0]?.tokens?.totalTokens).toBe(10)
    const existingApi = await getTokenUsageEventsPage({
      page: 1,
      pageSize: 10,
      period: "all",
    })
    expect(existingApi.total).toBe(1)
    expect(existingApi.items[0]).toMatchObject({
      input_tokens: 7,
      output_tokens: 3,
      total_tokens: 10,
    })
    await traffic.close()
  })

  test("updates late context and uses input-side tokens for fullness", async () => {
    const traffic = observer()
    const handle = traffic.beginRequest(
      start("context-request", "2026-09-07T11:59:59.000Z"),
    )
    handle.recordContext?.({
      at: "2026-09-07T11:59:59.050Z",
      context: {
        messageCount: 4,
        toolDefinitionCount: 2,
        contextWindowTokens: 200,
        requestedMaxOutputTokens: 64,
        usedTokens: null,
        usedRatio: null,
      },
    })
    handle.recordTokens({
      at: "2026-09-07T11:59:59.100Z",
      tokens: {
        inputTokens: 70,
        outputTokens: 100,
        cacheReadInputTokens: 20,
        cacheCreationInputTokens: 10,
        reasoningTokens: 40,
        totalTokens: 200,
        totalNanoAiu: 0,
      },
    })

    const detail = await traffic.getRequest("context-request")
    expect(detail?.request.context).toEqual({
      messageCount: 4,
      toolDefinitionCount: 2,
      contextWindowTokens: 200,
      requestedMaxOutputTokens: 64,
      usedTokens: 100,
      usedRatio: 0.5,
    })
    await traffic.close()
  })

  test("cursor snapshot remains stable under live inserts", async () => {
    const traffic = observer()
    for (const [id, second] of [
      ["a", "01"],
      ["b", "02"],
      ["c", "03"],
    ] as const) {
      const handle = traffic.beginRequest(
        start(id, `2026-09-07T11:00:${second}.000Z`),
      )
      handle.complete(finish(`2026-09-07T11:00:${second}.500Z`))
    }
    const query = TrafficRequestListQuerySchema.parse({
      limit: 2,
      direction: "ascending",
    })
    const first = await traffic.listRequests(query)
    const late = traffic.beginRequest(start("late", "2026-09-07T10:00:00.000Z"))
    late.complete(finish("2026-09-07T10:00:01.000Z"))
    const second = await traffic.listRequests({
      ...query,
      cursor: first.nextCursor,
    })
    expect(first.items.map((item) => item.identity.requestId)).toEqual([
      "a",
      "b",
    ])
    expect(second.items.map((item) => item.identity.requestId)).toEqual(["c"])
    await traffic.close()
  })
})

class CaptureHandle implements TrafficObservationHandle {
  completions: Array<TrafficCompletionObservation> = []
  contexts: Array<TrafficContextObservation> = []
  dispatchObservations: Array<TrafficDispatchObservation> = []
  tokens: Array<TrafficTokenObservation> = []
  dispatches = 0
  firstResponses = 0
  complete(observation: TrafficCompletionObservation): void {
    this.completions.push(observation)
  }
  recordContext(observation: TrafficContextObservation): void {
    this.contexts.push(observation)
  }
  recordDispatch(observation: TrafficDispatchObservation): void {
    this.dispatches += 1
    this.dispatchObservations.push(observation)
  }
  recordFirstResponse(): void {
    this.firstResponses += 1
  }
  recordTokens(observation: TrafficTokenObservation): void {
    this.tokens.push(observation)
  }
}

class CaptureObserver implements TrafficObserver {
  readonly handles: Array<CaptureHandle> = []
  readonly starts: Array<TrafficObservationStart> = []
  beginRequest(observation: TrafficObservationStart): TrafficObservationHandle {
    this.starts.push(observation)
    const handle = new CaptureHandle()
    this.handles.push(handle)
    return handle
  }
}

function middlewareApp(
  capture: CaptureObserver,
  stream: () => ReadableStream<Uint8Array>,
): Hono {
  const app = new Hono()
  app.use(traceIdMiddleware)
  app.use("/v1/messages", createTrafficObservationMiddleware(capture))
  app.post(
    "/v1/messages",
    () =>
      new Response(stream(), {
        headers: { "content-type": "text/event-stream" },
        status: 200,
      }),
  )
  return app
}

// eslint-disable-next-line max-lines-per-function
describe("traffic inference middleware", () => {
  test("accumulates repeated token events for one ingress request", () => {
    const handle = new CaptureHandle()
    requestContext.run(
      {
        traceId: "trace-cumulative",
        startTime: Date.now(),
        userAgent: "test",
        sessionAffinity: undefined,
        parentSessionId: undefined,
        trafficObservation: handle,
        trafficRequestId: "request-cumulative",
      },
      () => {
        recordTokenUsageEvent({
          endpoint: "messages",
          input_tokens: 10,
          output_tokens: 2,
          model: "claude-test",
          source: "copilot",
        })
        recordTokenUsageEvent({
          endpoint: "messages",
          input_tokens: 5,
          output_tokens: 3,
          cache_read_input_tokens: 4,
          model: "claude-test",
          source: "copilot",
        })
      },
    )

    expect(handle.tokens).toHaveLength(2)
    expect(handle.tokens[1]?.tokens).toMatchObject({
      inputTokens: 15,
      outputTokens: 5,
      cacheReadInputTokens: 4,
      totalTokens: 24,
    })
  })

  test("passes streaming bytes unchanged and completes on EOF", async () => {
    const capture = new CaptureObserver()
    const encoder = new TextEncoder()
    const app = middlewareApp(
      capture,
      () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode("data: one\n\n"))
            controller.enqueue(encoder.encode("data: two\n\n"))
            controller.close()
          },
        }),
    )
    const response = await app.request("/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "secret-client-value",
      },
      body: JSON.stringify({
        model: "claude-test",
        messages: [{ role: "user", content: "secret prompt" }],
        stream: true,
      }),
    })
    expect(await response.text()).toBe("data: one\n\ndata: two\n\n")
    expect(capture.handles[0]?.firstResponses).toBe(1)
    expect(capture.handles[0]?.completions[0]).toMatchObject({
      outcome: "succeeded",
      size: { responseChunks: 2, responseBytes: 22 },
    })
    expect(JSON.stringify(capture.starts)).not.toContain("secret prompt")
    expect(JSON.stringify(capture.starts)).not.toContain("secret-client-value")
  })

  test("cancels upstream without buffering when the consumer cancels", async () => {
    const capture = new CaptureObserver()
    let upstreamCancelled = false
    const app = middlewareApp(
      capture,
      () =>
        new ReadableStream({
          pull(controller) {
            controller.enqueue(new TextEncoder().encode("chunk"))
          },
          cancel() {
            upstreamCancelled = true
          },
        }),
    )
    const response = await app.request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-test", messages: [] }),
    })
    const reader = response.body?.getReader()
    await reader?.read()
    await reader?.cancel("consumer stopped")
    expect(upstreamCancelled).toBe(true)
    expect(capture.handles[0]?.completions[0]?.outcome).toBe("cancelled")
  })

  test("keeps request delivery independent from throwing observer callbacks", async () => {
    const app = new Hono()
    const throwingObserver: TrafficObserver = {
      beginRequest() {
        return {
          recordDispatch() {
            throw new Error("dispatch sink failed")
          },
          recordFirstResponse() {
            throw new Error("response sink failed")
          },
          recordTokens() {
            throw new Error("token sink failed")
          },
          complete() {
            throw new Error("completion sink failed")
          },
        }
      },
    }
    app.use(traceIdMiddleware)
    app.use(
      "/v1/messages",
      createTrafficObservationMiddleware(throwingObserver),
    )
    app.post("/v1/messages", async (c) => c.json(await c.req.json()))

    const response = await app.request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-test", messages: [] }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      model: "claude-test",
      messages: [],
    })
  })

  test("keeps request delivery independent when observer startup throws", async () => {
    const app = new Hono()
    const throwingObserver: TrafficObserver = {
      beginRequest() {
        throw new Error("observer unavailable")
      },
    }
    app.use(traceIdMiddleware)
    app.use(
      "/v1/messages",
      createTrafficObservationMiddleware(throwingObserver),
    )
    app.post("/v1/messages", (c) => c.text("ok"))

    const response = await app.request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-test", messages: [] }),
    })
    expect(response.status).toBe(200)
    expect(await response.text()).toBe("ok")
  })

  test("observes a request once when exact and wildcard middleware overlap", async () => {
    const capture = new CaptureObserver()
    const app = new Hono()
    const middleware = createTrafficObservationMiddleware(capture)
    app.use(traceIdMiddleware)
    app.use("/v1/messages", middleware)
    app.use("/v1/messages/*", middleware)
    app.post("/v1/messages", (c) => c.text("ok"))

    const response = await app.request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-test", messages: [] }),
    })

    expect(await response.text()).toBe("ok")
    expect(capture.starts).toHaveLength(1)
    expect(capture.handles).toHaveLength(1)
  })

  test("preserves request bodies and stores canonical wildcard route paths", async () => {
    const capture = new CaptureObserver()
    const app = new Hono()
    app.use(traceIdMiddleware)
    app.use(
      "/:provider/v1/messages/*",
      createTrafficObservationMiddleware(capture),
    )
    app.post("/:provider/v1/messages/*", async (c) =>
      c.json(await c.req.json()),
    )

    const response = await app.request(
      "/hosted/v1/messages/private-unbounded-suffix",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "m".repeat(250), messages: [] }),
      },
    )
    expect(await response.json()).toEqual({
      model: "m".repeat(250),
      messages: [],
    })
    expect(capture.starts[0]?.route.path).toBe("/:provider/v1/messages")
    expect(capture.handles[0]?.contexts).toHaveLength(1)
    expect(capture.starts[0]?.attribution.model).toBeNull()
    expect(capture.handles[0]?.dispatches).toBe(2)
    expect(capture.handles[0]?.dispatchObservations[1]?.attribution.model).toBe(
      "m".repeat(200),
    )
  })
})

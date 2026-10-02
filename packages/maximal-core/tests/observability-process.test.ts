import {
  TrafficOverviewQuerySchema,
  TrafficRequestListQuerySchema,
  type TrafficCompletionObservation,
  type TrafficObservationStart,
} from "@maximal/maximal-observability-contract"
import { afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { TrafficProcessClient } from "~/lib/observability/process-client"
import {
  TrafficProcessChildMessageSchema,
  TRAFFIC_OBSERVABILITY_CHILD_ARGUMENT,
  TrafficProcessParentMessageSchema,
} from "~/lib/observability/process-protocol"
import { trafficChildInvocation } from "~/lib/observability/self-launch"
import {
  enqueueTokenUsageWrite,
  getTokenUsageEventsPage,
  getTokenUsageSummary,
  setTokenUsageStoreDelegate,
} from "~/lib/token-usage/store"

let client: TrafficProcessClient | undefined
let temporaryDirectory: string | undefined

afterEach(async () => {
  const currentClient = client
  client = undefined
  const directory = temporaryDirectory
  temporaryDirectory = undefined
  setTokenUsageStoreDelegate(undefined)
  await currentClient?.close()
  if (directory) await fs.rm(directory, { recursive: true, force: true })
})

function start(requestId: string): TrafficObservationStart {
  return {
    identity: {
      requestId,
      traceId: `trace-${requestId}`,
      sessionId: null,
      parentRequestId: null,
      clientRequestId: null,
    },
    acceptedAt: "2026-09-07T12:00:00.000Z",
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
    terminal: { sessionId: null, profileId: null, application: null },
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

function completion(): TrafficCompletionObservation {
  return {
    at: "2026-09-07T12:00:01.000Z",
    outcome: "succeeded",
    dispatch: {
      attemptCount: 1,
      retryCount: 0,
      statusCode: 200,
      streamed: true,
      upstreamRequestId: null,
      requestedModel: "claude-test",
      resolvedModel: "claude-test",
    },
    tokens: null,
    size: { requestBytes: 42, responseBytes: 12, responseChunks: 2 },
    response: { stopReason: null, toolUseCount: null },
    error: null,
  }
}

describe("traffic observability process protocol", () => {
  test("builds source and compiled child invocations", () => {
    expect(trafficChildInvocation("/opt/bin/bun", "/app/src/main.ts")).toEqual({
      command: "/opt/bin/bun",
      args: ["/app/src/main.ts", TRAFFIC_OBSERVABILITY_CHILD_ARGUMENT],
    })
    expect(trafficChildInvocation("/app/maximal")).toEqual({
      command: "/app/maximal",
      args: [TRAFFIC_OBSERVABILITY_CHILD_ARGUMENT],
    })
    expect(
      trafficChildInvocation(
        String.raw`C:\runtime\node.exe`,
        String.raw`C:\app\main.js`,
      ),
    ).toEqual({
      command: String.raw`C:\runtime\node.exe`,
      args: [String.raw`C:\app\main.js`, TRAFFIC_OBSERVABILITY_CHILD_ARGUMENT],
    })
  })

  test("rejects malformed parent messages", () => {
    expect(
      TrafficProcessParentMessageSchema.safeParse({
        kind: "query",
        id: "1",
        query: { method: "get-request", requestId: "" },
      }).success,
    ).toBe(false)
    expect(
      TrafficProcessParentMessageSchema.safeParse({
        kind: "initialize",
        databasePath: "/tmp/traffic.sqlite",
        retentionDays: 365,
        extra: true,
      }).success,
    ).toBe(false)
  })

  test("accepts successful and failed query results", () => {
    expect(
      TrafficProcessChildMessageSchema.parse({
        kind: "result",
        id: "1",
        ok: true,
        value: null,
      }),
    ).toEqual({ kind: "result", id: "1", ok: true, value: null })
    expect(
      TrafficProcessChildMessageSchema.parse({
        kind: "result",
        id: "2",
        ok: false,
        error: { message: "query failed" },
      }),
    ).toEqual({
      kind: "result",
      id: "2",
      ok: false,
      error: { message: "query failed" },
    })
  })
})

describe("traffic observability process", () => {
  test("persists and queries session traffic through a real child", async () => {
    temporaryDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), "maximal-traffic-process-"),
    )
    const databasePath = path.join(temporaryDirectory, "traffic.sqlite")
    const invalidations: Array<number> = []
    client = new TrafficProcessClient({
      databasePath,
      invocation: {
        command: process.execPath,
        args: [
          path.join(import.meta.dir, "../src/main.ts"),
          TRAFFIC_OBSERVABILITY_CHILD_ARGUMENT,
        ],
      },
      onInvalidation: (invalidation) => {
        invalidations.push(invalidation.revision)
      },
    })
    setTokenUsageStoreDelegate(client)

    const handle = client.beginRequest(start("process-request"))
    handle.recordSession?.({
      at: "2026-09-07T12:00:00.500Z",
      sessionId: "model-session",
    })
    handle.complete(completion())
    enqueueTokenUsageWrite({
      api_key_id: null,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 2,
      created_at_ms: Date.now(),
      created_at_utc: new Date().toISOString(),
      endpoint: "messages",
      input_tokens: 10,
      is_premium: 1,
      model: "claude-test",
      output_tokens: 5,
      project_id: null,
      provider_name: null,
      session_id: "model-session",
      source: "copilot",
      total_nano_aiu: 100,
      total_tokens: 17,
      trace_id: "trace-process-request",
      traffic_request_id: "process-request",
      user_id: "test-user",
    })

    const requests = await client.listRequests(
      TrafficRequestListQuerySchema.parse({
        filters: { sessionIds: ["model-session"] },
      }),
    )
    const overview = await client.getOverview(
      TrafficOverviewQuerySchema.parse({}),
    )
    const usage = await getTokenUsageSummary("day")
    const usageEvents = await getTokenUsageEventsPage({
      page: 1,
      pageSize: 10,
      period: "day",
    })

    expect(requests.items).toHaveLength(1)
    expect(requests.items[0]?.identity.sessionId).toBe("model-session")
    expect(requests.items[0]?.outcome).toBe("succeeded")
    expect(overview.totals.requests).toBe(1)
    expect(usage.totals.total_tokens).toBe(17)
    expect(usageEvents.items[0]?.session_id).toBe("model-session")
    expect(invalidations.length).toBeGreaterThan(0)
  }, 15_000)
})

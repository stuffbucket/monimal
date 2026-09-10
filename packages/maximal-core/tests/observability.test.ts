/* eslint-disable max-lines -- storage and middleware coverage share lifecycle fixtures */
import {
  TrafficCompletionObservationSchema,
  TrafficContextObservationSchema,
  TrafficDispatchObservationSchema,
  TrafficFirstResponseObservationSchema,
  TrafficInvalidationSchema,
  TrafficObservationStartSchema,
  TrafficOverviewQuerySchema,
  TrafficOverviewSchema,
  TrafficRequestDetailSchema,
  TrafficRequestListQuerySchema,
  TrafficRequestListSchema,
  TrafficTokenObservationSchema,
  type TrafficCompletionObservation,
  type TrafficContextObservation,
  type TrafficDispatchObservation,
  type TrafficFirstResponseObservation,
  type TrafficInvalidation,
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
import {
  createTrafficObservationMiddleware,
  observedInferencePaths,
} from "~/lib/observability/middleware"
import {
  buildTokenSeries,
  matchesFilters,
  percentile,
} from "~/lib/observability/query"
import {
  closeTrafficStore,
  SqliteTrafficObserver,
} from "~/lib/observability/store"
import {
  closeUsageStore,
  getTokenUsageEventsPage,
  onTokenUsageRecorded,
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

function observer(
  options: {
    dbPath?: string
    now?: () => Date
    onInvalidation?: (invalidation: TrafficInvalidation) => void
    retentionDays?: number
  } = {},
): SqliteTrafficObserver {
  return new SqliteTrafficObserver({
    dbPath: options.dbPath ?? process.env[DB_PATH_ENV],
    open: (filename) => Promise.resolve(new Database(filename)),
    now: options.now ?? (() => new Date("2026-09-07T12:00:00.000Z")),
    onInvalidation: options.onInvalidation,
    retentionDays: options.retentionDays,
  })
}

// eslint-disable-next-line max-lines-per-function
describe("SQLite traffic observability", () => {
  test("persists lifecycle, zero-token completion, and contract-valid queries", async () => {
    const traffic = observer()
    const handle = traffic.beginRequest(
      start("request-a", "2026-09-07T11:59:59.000Z"),
    )
    const dispatch = {
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
    } as const
    handle.recordDispatch(dispatch)
    handle.recordDispatch({
      ...dispatch,
      at: "2026-09-07T11:59:59.150Z",
    })
    const firstResponse = {
      at: "2026-09-07T11:59:59.200Z",
      statusCode: 200,
      streamed: true,
    }
    handle.recordFirstResponse(firstResponse)
    handle.recordFirstResponse({
      ...firstResponse,
      at: "2026-09-07T11:59:59.250Z",
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
    expect(detail?.lifecycle.map(({ at, kind }) => ({ at, kind }))).toEqual([
      { at: "2026-09-07T11:59:59.000Z", kind: "accepted" },
      { at: "2026-09-07T11:59:59.100Z", kind: "dispatch-started" },
      { at: "2026-09-07T11:59:59.200Z", kind: "response-started" },
      { at: "2026-09-07T12:00:00.000Z", kind: "completed" },
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
    expect(recovered?.lifecycle.at(-1)).toMatchObject({
      kind: "completed",
      state: "completed",
      outcome: "cancelled",
    })
    await reopened.close()
  })

  test("removes orphan lifecycle rows without disturbing valid history", async () => {
    const first = observer()
    const valid = first.beginRequest(
      start("valid-history", "2026-09-07T11:00:00.000Z"),
    )
    valid.complete(finish("2026-09-07T11:00:01.000Z"))
    await first.close()

    const dbPath = path.join(temporaryDirectory, "traffic.sqlite")
    const raw = new Database(dbPath)
    raw.run("PRAGMA foreign_keys = OFF")
    raw
      .query(
        `INSERT INTO traffic_request_lifecycle
        (request_id, sequence, at_ms, at_utc, kind, state, outcome)
       VALUES (?, 0, ?, ?, 'accepted', 'accepted', NULL)`,
      )
      .run("orphan", 1, "1970-01-01T00:00:00.001Z")
    raw.close()

    const reopened = observer({ dbPath })
    const detail = await reopened.getRequest("valid-history")
    expect(detail?.lifecycle.map(({ kind }) => kind)).toEqual([
      "accepted",
      "completed",
    ])
    await reopened.close()

    const checked = new Database(dbPath)
    const orphan = checked
      .query<{ count: number }, []>(
        "SELECT COUNT(*) AS count FROM traffic_request_lifecycle WHERE request_id = 'orphan'",
      )
      .get()
    expect(orphan?.count).toBe(0)
    checked.close()
  })

  test("backfills bounded token rows once with input-side context usage", async () => {
    recordTokenUsageEvent({
      endpoint: "responses",
      input_tokens: 7,
      output_tokens: 3,
      cache_read_input_tokens: 5,
      cache_creation_input_tokens: 2,
      model: `  ${"g".repeat(250)}  `,
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
    expect(first.items[0]?.attribution.model).toBe("g".repeat(200))
    expect(first.items[0]?.tokens).toMatchObject({
      inputTokens: 7,
      outputTokens: 3,
      cacheReadInputTokens: 5,
      cacheCreationInputTokens: 2,
      totalTokens: 17,
    })
    expect(first.items[0]?.context.usedTokens).toBe(14)
    const existingApi = await getTokenUsageEventsPage({
      page: 1,
      pageSize: 10,
      period: "all",
    })
    expect(existingApi.total).toBe(1)
    expect(existingApi.items[0]).toMatchObject({
      input_tokens: 7,
      output_tokens: 3,
      cache_read_input_tokens: 5,
      cache_creation_input_tokens: 2,
      total_tokens: 17,
    })
    const legacyStartedAt = first.items[0]?.timing.acceptedAt
    expect(legacyStartedAt).toBeDefined()
    const overview = await traffic.getOverview(
      TrafficOverviewQuerySchema.parse({
        filters: {
          range: { from: legacyStartedAt, to: legacyStartedAt },
        },
      }),
    )
    TrafficOverviewSchema.parse(overview)
    expect(overview.flow.nodes.find(({ kind }) => kind === "model")).toEqual({
      id: `model:${"g".repeat(177)}:addb7c13362c592a`,
      kind: "model",
      label: "g".repeat(200),
      requestCount: 1,
      totalTokens: 17,
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

  test("persists one terminal token snapshot and rejects later writes", async () => {
    const traffic = observer()
    const requestId = "terminal-tokens"
    traffic.beginRequest(start(requestId, "2026-09-07T11:59:59.000Z"))
    traffic.recordContext(requestId, {
      at: "2026-09-07T11:59:59.050Z",
      context: {
        messageCount: null,
        toolDefinitionCount: null,
        contextWindowTokens: 200,
        requestedMaxOutputTokens: null,
        usedTokens: null,
        usedRatio: null,
      },
    })
    const tokens = {
      inputTokens: 70,
      outputTokens: 100,
      cacheReadInputTokens: 20,
      cacheCreationInputTokens: 10,
      reasoningTokens: 40,
      totalTokens: 200,
      totalNanoAiu: 17,
    }
    traffic.complete(requestId, {
      ...finish("2026-09-07T12:00:00.000Z"),
      tokens,
    })
    traffic.complete(requestId, {
      ...finish("2026-09-07T12:00:01.000Z", "failed"),
      tokens: { ...tokens, totalTokens: 999 },
    })
    traffic.recordContext(requestId, {
      at: "2026-09-07T12:00:02.000Z",
      context: {
        messageCount: 99,
        toolDefinitionCount: 99,
        contextWindowTokens: 99,
        requestedMaxOutputTokens: 99,
        usedTokens: 99,
        usedRatio: 1,
      },
    })

    const detail = await traffic.getRequest(requestId)
    expect(detail?.request).toMatchObject({
      outcome: "succeeded",
      tokens,
      context: {
        messageCount: 1,
        toolDefinitionCount: 0,
        contextWindowTokens: 200,
        requestedMaxOutputTokens: 100,
        usedTokens: 100,
        usedRatio: 0.5,
      },
    })
    expect(
      detail?.lifecycle.filter(({ kind }) => kind === "completed"),
    ).toHaveLength(1)
    expect(detail?.request.timing.completedAt).toBe("2026-09-07T12:00:00.000Z")
    await traffic.close()
  })

  test("persists exact terminal failure metadata", async () => {
    const traffic = observer()
    const handle = traffic.beginRequest(
      start("failed-request", "2026-09-07T11:59:59.000Z"),
    )
    handle.complete(finish("2026-09-07T12:00:00.000Z", "failed"))

    const detail = await traffic.getRequest("failed-request")
    expect(detail?.request.error).toEqual({
      category: "provider",
      code: "upstream_failure",
      message: "Provider request failed",
      retryable: true,
    })
    await traffic.close()
  })

  test("applies inclusive ranges and excludes past-retention and future rows", async () => {
    const traffic = observer({ retentionDays: 2 })
    for (const [id, acceptedAt] of [
      ["before", "2026-09-05T11:59:59.000Z"],
      ["from", "2026-09-05T12:00:00.000Z"],
      ["inside", "2026-09-06T12:00:00.000Z"],
      ["to", "2026-09-07T12:00:00.000Z"],
      ["after", "2026-09-07T12:00:01.000Z"],
    ] as const) {
      const handle = traffic.beginRequest(start(id, acceptedAt))
      handle.complete(finish(acceptedAt))
    }

    const overview = await traffic.getOverview(
      TrafficOverviewQuerySchema.parse({}),
    )
    expect(overview.range).toEqual({
      from: "2026-09-05T12:00:00.000Z",
      to: "2026-09-07T12:00:00.000Z",
    })
    expect(overview.totals.requests).toBe(3)

    const page = await traffic.listRequests(
      TrafficRequestListQuerySchema.parse({
        limit: 10,
        direction: "ascending",
        filters: { range: overview.range },
      }),
    )
    expect(page.items.map((item) => item.identity.requestId)).toEqual([
      "from",
      "inside",
      "to",
    ])
    await traffic.close()
  })

  test("applies every request-list filter with inclusive duration bounds", async () => {
    const traffic = observer()
    const targetStart = start("target", "2026-09-07T11:57:00.000Z")
    const target = traffic.beginRequest({
      ...targetStart,
      attribution: {
        ...targetStart.attribution,
        client: "cursor",
        project: "project-a",
        model: "alpha",
      },
    })
    const targetCompletion = finish("2026-09-07T11:57:01.000Z")
    target.complete({
      ...targetCompletion,
      dispatch: {
        ...targetCompletion.dispatch,
        requestedModel: "alpha",
        resolvedModel: "alpha",
      },
    })

    const otherStart = start("other", "2026-09-07T11:58:00.000Z")
    const other = traffic.beginRequest({
      ...otherStart,
      route: {
        method: "POST",
        path: "/v1/responses",
        operation: "responses",
      },
      attribution: {
        ...otherStart.attribution,
        source: "provider",
        client: "vscode",
        project: "project-b",
        provider: "external",
        model: "beta",
      },
    })
    const otherCompletion = finish("2026-09-07T11:58:02.000Z", "failed")
    other.complete({
      ...otherCompletion,
      dispatch: {
        ...otherCompletion.dispatch,
        streamed: false,
        requestedModel: "beta",
        resolvedModel: "beta",
      },
    })

    const activeStart = start("active", "2026-09-07T11:59:00.000Z")
    traffic.beginRequest({
      ...activeStart,
      route: {
        method: "POST",
        path: "/v1/embeddings",
        operation: "embeddings",
      },
      attribution: {
        ...activeStart.attribution,
        client: null,
        project: null,
        provider: null,
        model: null,
      },
    })

    const cases = [
      [{ states: ["accepted"] }, ["active"]],
      [{ outcomes: ["failed"] }, ["other"]],
      [{ operations: ["messages"] }, ["target"]],
      [{ providers: ["copilot"] }, ["target"]],
      [{ models: ["alpha"] }, ["target"]],
      [{ clients: ["cursor"] }, ["target"]],
      [{ projects: ["project-a"] }, ["target"]],
      [{ streaming: true }, ["target"]],
      [{ minimumDurationMs: 1_000, maximumDurationMs: 1_000 }, ["target"]],
      [{ search: "ALPHA" }, ["target"]],
    ] as const
    for (const [filters, expected] of cases) {
      const page = await traffic.listRequests(
        TrafficRequestListQuerySchema.parse({
          direction: "ascending",
          filters,
          limit: 10,
        }),
      )
      expect(page.items.map(({ identity }) => identity.requestId)).toEqual([
        ...expected,
      ])
      const overview = await traffic.getOverview(
        TrafficOverviewQuerySchema.parse({ filters }),
      )
      expect(overview.totals.requests).toBe(expected.length)
    }

    const targetSummary = (await traffic.getRequest("target"))?.request
    const activeSummary = (await traffic.getRequest("active"))?.request
    expect(targetSummary).toBeDefined()
    expect(activeSummary).toBeDefined()
    if (!targetSummary || !activeSummary) throw new Error("missing fixtures")
    const defaults = TrafficRequestListQuerySchema.parse({}).filters
    expect(matchesFilters(activeSummary, defaults)).toBe(true)
    expect(
      matchesFilters(targetSummary, {
        ...defaults,
        range: {
          from: "2026-09-07T11:57:00.001Z",
          to: "2026-09-07T12:00:00.000Z",
        },
      }),
    ).toBe(false)
    expect(
      matchesFilters(targetSummary, {
        ...defaults,
        range: {
          from: "2026-09-07T11:00:00.000Z",
          to: "2026-09-07T11:56:59.999Z",
        },
      }),
    ).toBe(false)
    for (const filters of [
      { outcomes: ["succeeded"] },
      { providers: ["copilot"] },
      { models: ["alpha"] },
      { projects: ["project-a"] },
      { clients: ["cursor"] },
    ] satisfies Array<Partial<typeof defaults>>) {
      expect(matchesFilters(activeSummary, { ...defaults, ...filters })).toBe(
        false,
      )
    }
    const withoutDuration = {
      ...targetSummary,
      timing: { ...targetSummary.timing, durationMs: null },
    }
    expect(
      matchesFilters(withoutDuration, {
        ...defaults,
        minimumDurationMs: 0,
      }),
    ).toBe(false)
    expect(
      matchesFilters(withoutDuration, {
        ...defaults,
        maximumDurationMs: 1,
      }),
    ).toBe(false)
    expect(
      matchesFilters(targetSummary, {
        ...defaults,
        minimumDurationMs: 1_001,
      }),
    ).toBe(false)
    expect(
      matchesFilters(targetSummary, {
        ...defaults,
        search: "LPH",
      }),
    ).toBe(true)
    expect(
      matchesFilters(targetSummary, {
        ...defaults,
        search: "targettrace-target",
      }),
    ).toBe(false)
    await traffic.close()
  })

  test("calculates exact latency, flow, and token-series aggregates", async () => {
    const traffic = observer()
    for (const fixture of [
      {
        acceptedAt: "2026-09-07T11:00:30.000Z",
        completedAt: "2026-09-07T11:00:33.000Z",
        id: "slow",
        multiplier: 3,
      },
      {
        acceptedAt: "2026-09-07T11:00:10.000Z",
        completedAt: "2026-09-07T11:00:11.000Z",
        id: "fast",
        multiplier: 1,
      },
      {
        acceptedAt: "2026-09-07T11:00:20.000Z",
        completedAt: "2026-09-07T11:00:22.000Z",
        id: "medium",
        multiplier: 2,
      },
    ] as const) {
      const handle = traffic.beginRequest(start(fixture.id, fixture.acceptedAt))
      const terminal = finish(fixture.completedAt)
      handle.complete({
        ...terminal,
        tokens: {
          inputTokens: fixture.multiplier,
          outputTokens: fixture.multiplier * 2,
          cacheReadInputTokens: fixture.multiplier * 3,
          cacheCreationInputTokens: fixture.multiplier * 4,
          reasoningTokens: 0,
          totalTokens: fixture.multiplier * 10,
          totalNanoAiu: 0,
        },
      })
    }

    const overview = await traffic.getOverview(
      TrafficOverviewQuerySchema.parse({
        filters: {
          range: {
            from: "2026-09-07T11:00:00.000Z",
            to: "2026-09-07T11:01:00.000Z",
          },
        },
        tokenBucketMs: 60_000,
      }),
    )
    expect(overview.latency.total).toEqual({
      sampleCount: 3,
      p50Ms: 2_000,
      p90Ms: 3_000,
      p95Ms: 3_000,
      p99Ms: 3_000,
    })
    expect(
      overview.flow.edges.find(
        ({ source, target }) =>
          source === "client:unknown" && target === "route:messages",
      ),
    ).toMatchObject({
      requestCount: 3,
      totalTokens: 60,
      averageDurationMs: 2_000,
    })
    expect(overview.tokens).toEqual({
      bucketMs: 60_000,
      points: [
        {
          start: "2026-09-07T11:00:00.000Z",
          end: "2026-09-07T11:01:00.000Z",
          requestCount: 3,
          inputTokens: 6,
          outputTokens: 12,
          cacheReadInputTokens: 18,
          cacheCreationInputTokens: 24,
          totalTokens: 60,
        },
      ],
    })
    expect(percentile([3_000, 1_000, 2_000])).toEqual({
      sampleCount: 3,
      p50Ms: 2_000,
      p90Ms: 3_000,
      p95Ms: 3_000,
      p99Ms: 3_000,
    })
    expect(percentile([])).toEqual({
      sampleCount: 0,
      p50Ms: null,
      p90Ms: null,
      p95Ms: null,
      p99Ms: null,
    })

    const automatic = await traffic.getOverview(
      TrafficOverviewQuerySchema.parse({
        filters: {
          range: {
            from: "2026-09-07T11:00:00.000Z",
            to: "2026-09-07T11:01:00.000Z",
          },
        },
      }),
    )
    expect(automatic.tokens.bucketMs).toBe(1_000)
    expect(automatic.tokens.points.map(({ start }) => start)).toEqual([
      "2026-09-07T11:00:10.000Z",
      "2026-09-07T11:00:20.000Z",
      "2026-09-07T11:00:30.000Z",
    ])

    const slowSummary = (await traffic.getRequest("slow"))?.request
    const fastSummary = (await traffic.getRequest("fast"))?.request
    const mediumSummary = (await traffic.getRequest("medium"))?.request
    if (!slowSummary || !fastSummary || !mediumSummary)
      throw new Error("missing token-series fixtures")
    expect(
      buildTokenSeries(
        [slowSummary, fastSummary, mediumSummary],
        automatic.range,
        null,
      ).points.map(({ start }) => start),
    ).toEqual([
      "2026-09-07T11:00:10.000Z",
      "2026-09-07T11:00:20.000Z",
      "2026-09-07T11:00:30.000Z",
    ])

    const cappedFrom = Date.parse("2026-09-07T11:00:00.000Z")
    const capped = buildTokenSeries(
      Array.from({ length: 1_001 }, (_, index) => ({
        ...fastSummary,
        identity: {
          ...fastSummary.identity,
          requestId: `capped-${index}`,
        },
        timing: {
          ...fastSummary.timing,
          acceptedAt: new Date(cappedFrom + index).toISOString(),
        },
      })),
      {
        from: "2026-09-07T11:00:00.000Z",
        to: "2026-09-07T11:00:01.000Z",
      },
      1,
    )
    expect(capped.points).toHaveLength(1_000)
    expect(capped.points.at(-1)?.start).toBe("2026-09-07T11:00:00.999Z")
    await traffic.close()
  })

  test("caps completed durations at the query snapshot", async () => {
    const traffic = observer()
    const handle = traffic.beginRequest(
      start("future-completion", "2026-09-07T11:59:00.000Z"),
    )
    handle.complete(finish("2026-09-07T12:05:00.000Z"))

    const page = await traffic.listRequests(
      TrafficRequestListQuerySchema.parse({ limit: 10 }),
    )
    expect(page.items[0]?.timing.durationMs).toBe(60_000)
    await traffic.close()
  })

  test("prunes expired requests and their lifecycle after the daily check", async () => {
    const initialNow = new Date("2026-09-07T12:00:00.000Z")
    const clock = [initialNow]
    const traffic = observer({
      now: () => clock.at(-1) ?? initialNow,
      retentionDays: 1,
    })
    const expired = traffic.beginRequest(
      start("expired", "2026-09-05T12:00:00.000Z"),
    )
    expired.complete(finish("2026-09-05T12:00:01.000Z"))
    const retained = traffic.beginRequest(
      start("retained", "2026-09-07T12:00:00.001Z"),
    )
    retained.complete(finish("2026-09-07T12:00:01.001Z"))
    expect(await traffic.getRequest("expired")).not.toBeNull()

    const boundaryNow = new Date("2026-09-08T12:00:00.000Z")
    clock.push(boundaryNow)
    const boundary = traffic.beginRequest(
      start("boundary", boundaryNow.toISOString()),
    )
    boundary.complete(finish(boundaryNow.toISOString()))
    expect(await traffic.getRequest("expired")).toBeNull()
    expect((await traffic.getRequest("retained"))?.request.state).toBe(
      "completed",
    )

    const currentNow = new Date("2026-09-08T12:00:01.001Z")
    clock.push(currentNow)
    const current = traffic.beginRequest(
      start("current", currentNow.toISOString()),
    )
    current.complete(finish(currentNow.toISOString()))
    expect((await traffic.getRequest("retained"))?.request.state).toBe(
      "completed",
    )
    expect((await traffic.getRequest("current"))?.request.state).toBe(
      "completed",
    )
    await traffic.close()

    const db = new Database(path.join(temporaryDirectory, "traffic.sqlite"))
    const lifecycle = db
      .query<{ count: number }, [string]>(
        "SELECT COUNT(*) AS count FROM traffic_request_lifecycle WHERE request_id = ?",
      )
      .get("expired")
    expect(lifecycle?.count).toBe(0)
    expect(db.query("PRAGMA foreign_key_check").all()).toEqual([])
    db.close()
  })

  test("emits complete monotonic invalidations for lifecycle changes", async () => {
    const invalidations: Array<TrafficInvalidation> = []
    const traffic = observer({
      onInvalidation: (invalidation) => {
        invalidations.push(TrafficInvalidationSchema.parse(invalidation))
      },
    })
    const requestId = "invalidated-request"
    const observation = start(requestId, "2026-09-07T11:59:59.000Z")
    const handle = traffic.beginRequest(observation)
    handle.recordDispatch({
      at: "2026-09-07T11:59:59.100Z",
      attribution: observation.attribution,
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
    handle.complete(finish("2026-09-07T12:00:00.000Z"))

    await traffic.getRequest(requestId)
    expect(invalidations.map(({ revision }) => revision)).toEqual([1, 2, 3])
    expect(invalidations.map(({ activeCount }) => activeCount)).toEqual([
      1, 1, 0,
    ])
    for (const invalidation of invalidations) {
      expect(invalidation).toMatchObject({
        overflow: false,
        scopes: ["requests", "request-detail", "overview"],
        requestIds: [requestId],
      })
    }
    await traffic.close()
  })

  test("rolls back a terminal update when lifecycle insertion fails", async () => {
    const dbPath = path.join(temporaryDirectory, "traffic.sqlite")
    const opened: { db?: Database } = {}
    const traffic = new SqliteTrafficObserver({
      dbPath,
      now: () => new Date("2026-09-07T12:00:00.000Z"),
      open: (filename) => {
        const db = new Database(filename)
        opened.db = db
        return Promise.resolve(db)
      },
    })
    const requestId = "rollback-request"
    const handle = traffic.beginRequest(
      start(requestId, "2026-09-07T11:59:59.000Z"),
    )
    await traffic.getRequest(requestId)
    const raw = opened.db
    if (!raw) throw new Error("Expected the traffic database to be open")
    raw.run(`CREATE TRIGGER fail_completed_lifecycle
      BEFORE INSERT ON traffic_request_lifecycle
      WHEN NEW.kind = 'completed'
      BEGIN
        SELECT RAISE(ABORT, 'forced lifecycle failure');
      END`)

    handle.complete(finish("2026-09-07T12:00:00.000Z"))
    const rolledBack = await traffic.getRequest(requestId)
    expect(rolledBack?.request.state).toBe("accepted")
    expect(
      rolledBack?.lifecycle.filter(({ kind }) => kind === "completed"),
    ).toEqual([])

    raw.run("DROP TRIGGER fail_completed_lifecycle")
    traffic.complete(requestId, finish("2026-09-07T12:00:01.000Z"))
    const recovered = await traffic.getRequest(requestId)
    expect(recovered?.request.state).toBe("completed")
    expect(
      recovered?.lifecycle.filter(({ kind }) => kind === "completed"),
    ).toHaveLength(1)
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
  firstResponseObservations: Array<TrafficFirstResponseObservation> = []
  tokens: Array<TrafficTokenObservation> = []
  dispatches = 0
  firstResponses = 0
  complete(observation: TrafficCompletionObservation): void {
    this.completions.push(TrafficCompletionObservationSchema.parse(observation))
  }
  recordContext(observation: TrafficContextObservation): void {
    this.contexts.push(TrafficContextObservationSchema.parse(observation))
  }
  recordDispatch(observation: TrafficDispatchObservation): void {
    this.dispatches += 1
    this.dispatchObservations.push(
      TrafficDispatchObservationSchema.parse(observation),
    )
  }
  recordFirstResponse(observation: TrafficFirstResponseObservation): void {
    this.firstResponses += 1
    this.firstResponseObservations.push(
      TrafficFirstResponseObservationSchema.parse(observation),
    )
  }
  recordTokens(observation: TrafficTokenObservation): void {
    this.tokens.push(TrafficTokenObservationSchema.parse(observation))
  }
}

class CaptureObserver implements TrafficObserver {
  readonly handles: Array<CaptureHandle> = []
  readonly starts: Array<TrafficObservationStart> = []
  beginRequest(observation: TrafficObservationStart): TrafficObservationHandle {
    this.starts.push(TrafficObservationStartSchema.parse(observation))
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
  test("registers every exact and wildcard inference path", () => {
    const exact = [
      "/chat/completions",
      "/embeddings",
      "/responses",
      "/v1/chat/completions",
      "/v1/embeddings",
      "/v1/messages",
      "/v1/messages/count_tokens",
      "/v1/responses",
    ]
    expect(observedInferencePaths()).toEqual([
      ...exact,
      ...exact.map((path) => `${path}/*`),
      "/:provider/v1/messages",
      "/:provider/v1/messages/*",
    ])
  })

  test("accumulates repeated token events for one ingress request", () => {
    const handle = new CaptureHandle()
    requestContext.run(
      {
        traceId: "trace-cumulative",
        startTime: Date.now(),
        userAgent: "test",
        sessionAffinity: undefined,
        parentSessionId: "  parent-session  ",
        trafficObservation: handle,
        trafficRequestId: "request-cumulative",
      },
      () => {
        recordTokenUsageEvent({
          endpoint: "messages",
          input_tokens: 10,
          output_tokens: 2,
          cache_read_input_tokens: 1,
          cache_creation_input_tokens: 3,
          reasoning_tokens: 4,
          total_tokens: 20,
          total_nano_aiu: 5,
          model: "claude-test",
          source: "copilot",
        })
        recordTokenUsageEvent({
          endpoint: "provider_messages",
          input_tokens: 5,
          output_tokens: 7,
          cache_read_input_tokens: 11,
          cache_creation_input_tokens: 13,
          reasoning_tokens: 17,
          total_tokens: 30,
          total_nano_aiu: 19,
          model: `  ${"m".repeat(250)}  `,
          providerName: `  ${"p".repeat(250)}  `,
          source: "provider",
        })
      },
    )

    expect(handle.tokens).toHaveLength(2)
    expect(handle.tokens[1]?.tokens).toEqual({
      inputTokens: 15,
      outputTokens: 9,
      cacheReadInputTokens: 12,
      cacheCreationInputTokens: 16,
      reasoningTokens: 21,
      totalTokens: 50,
      totalNanoAiu: 24,
    })
    expect(handle.dispatchObservations[1]?.attribution).toMatchObject({
      source: "provider",
      provider: "p".repeat(200),
      model: "m".repeat(200),
      parentSessionId: "parent-session",
      subagent: true,
    })
  })

  test("suppresses zero-token events before annotation and publication", async () => {
    const handle = new CaptureHandle()
    let published = 0
    const unsubscribe = onTokenUsageRecorded(() => {
      published += 1
    })
    try {
      requestContext.run(
        {
          traceId: "trace-zero",
          startTime: Date.now(),
          userAgent: "test",
          sessionAffinity: undefined,
          parentSessionId: undefined,
          trafficObservation: handle,
          trafficRequestId: "request-zero",
        },
        () => {
          recordTokenUsageEvent({
            endpoint: "messages",
            input_tokens: 0,
            output_tokens: 0,
            model: "claude-test",
            source: "copilot",
          })
        },
      )
    } finally {
      unsubscribe()
    }

    expect(published).toBe(0)
    expect(handle.tokens).toEqual([])
    expect(handle.dispatchObservations).toEqual([])
    expect(
      (
        await getTokenUsageEventsPage({
          page: 1,
          pageSize: 10,
          period: "all",
        })
      ).total,
    ).toBe(0)
  })

  test("forwards token snapshots through the passive ingress handle", async () => {
    const capture = new CaptureObserver()
    const app = new Hono()
    app.use(traceIdMiddleware)
    app.use("/v1/messages", createTrafficObservationMiddleware(capture))
    app.post("/v1/messages", (c) => {
      recordTokenUsageEvent({
        endpoint: "messages",
        input_tokens: 3,
        output_tokens: 2,
        model: "claude-test",
        source: "copilot",
      })
      return c.text("ok")
    })

    const response = await app.request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-test", messages: [] }),
    })
    expect(await response.text()).toBe("ok")
    expect(capture.handles[0]?.tokens).toHaveLength(1)
    expect(capture.handles[0]?.tokens[0]?.tokens).toEqual({
      inputTokens: 3,
      outputTokens: 2,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      reasoningTokens: 0,
      totalTokens: 5,
      totalNanoAiu: 0,
    })
    const tokenDispatch = capture.handles[0]?.dispatchObservations.find(
      ({ dispatch }) => dispatch.resolvedModel === "claude-test",
    )
    expect(tokenDispatch?.attribution).toMatchObject({
      provider: "copilot",
      subagent: null,
    })
    expect(tokenDispatch?.dispatch).toMatchObject({
      attemptCount: 1,
      retryCount: 0,
      resolvedModel: "claude-test",
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

  test("records first response only after a semantic SSE frame", async () => {
    const capture = new CaptureObserver()
    const encoder = new TextEncoder()
    let source: ReadableStreamDefaultController<Uint8Array> | undefined
    const app = middlewareApp(
      capture,
      () =>
        new ReadableStream({
          start(controller) {
            source = controller
          },
        }),
    )
    const response = await app.request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-test", messages: [] }),
    })
    const reader = response.body?.getReader()
    expect(reader).toBeDefined()
    expect(source).toBeDefined()

    const readChunk = async (value: string): Promise<void> => {
      const pending = reader?.read()
      source?.enqueue(encoder.encode(value))
      expect((await pending)?.done).toBe(false)
    }
    await readChunk(": keepalive\n\ndata: [DONE]\n\n")
    expect(capture.handles[0]?.firstResponses).toBe(0)
    await readChunk('data: {"type":"content_')
    expect(capture.handles[0]?.firstResponses).toBe(0)
    await readChunk('block_delta"}\r\n\r\n')
    expect(capture.handles[0]?.firstResponses).toBe(1)
    source?.close()
    expect((await reader?.read())?.done).toBe(true)
    expect(capture.handles[0]?.firstResponses).toBe(1)
  })

  test("records a response-stream failure once and preserves the error", async () => {
    const capture = new CaptureObserver()
    const failure = new Error("stream failed")
    const app = middlewareApp(
      capture,
      () =>
        new ReadableStream({
          pull() {
            throw failure
          },
        }),
    )
    const response = await app.request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-test", messages: [] }),
    })

    let observedError: unknown
    try {
      await response.text()
    } catch (error) {
      observedError = error
    }
    expect(observedError).toBe(failure)
    expect(capture.handles[0]?.completions).toHaveLength(1)
    expect(capture.handles[0]?.completions[0]).toMatchObject({
      outcome: "failed",
      error: {
        category: "transport",
        code: "response_stream_error",
        retryable: true,
      },
    })
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
          recordContext() {
            throw new Error("context sink failed")
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

  test("records handled request failures once after response consumption", async () => {
    const capture = new CaptureObserver()
    const failure = new Error("handler failed")
    let observedError: unknown
    const app = new Hono()
    app.use(traceIdMiddleware)
    app.use("/v1/messages", createTrafficObservationMiddleware(capture))
    app.onError((error, c) => {
      observedError = error
      return c.text("handled", 500)
    })
    app.post("/v1/messages", () => {
      throw failure
    })

    const response = await app.request("/v1/messages", {
      method: "POST",
      headers: {
        "content-length": "42",
        "content-type": "application/json",
      },
    })
    expect(observedError).toBe(failure)
    expect(response.status).toBe(500)
    expect(await response.text()).toBe("handled")
    expect(capture.handles[0]?.completions).toHaveLength(1)
    expect(capture.handles[0]?.completions[0]).toMatchObject({
      outcome: "failed",
      dispatch: { statusCode: 500, streamed: false },
      size: { requestBytes: null, responseBytes: 7, responseChunks: 1 },
      error: {
        category: "internal",
        code: "http_500",
        retryable: true,
      },
    })
  })

  test("records exceptions once when error handling rethrows", async () => {
    const capture = new CaptureObserver()
    const failure = new Error("handler failed")
    const app = new Hono()
    app.use(traceIdMiddleware)
    app.use("/v1/messages", createTrafficObservationMiddleware(capture))
    app.onError((error) => {
      throw error
    })
    app.post("/v1/messages", () => {
      throw failure
    })

    let observedError: unknown
    try {
      await app.request("/v1/messages", {
        method: "POST",
        headers: {
          "content-length": "42",
          "content-type": "application/json",
        },
      })
    } catch (error) {
      observedError = error
    }
    expect(observedError).toBe(failure)
    expect(capture.handles[0]?.completions).toHaveLength(1)
    expect(capture.handles[0]?.completions[0]).toMatchObject({
      outcome: "failed",
      dispatch: { statusCode: 500, streamed: false },
      size: { requestBytes: 42, responseBytes: 0, responseChunks: 0 },
      error: {
        category: "internal",
        code: "request_handler_error",
        retryable: false,
      },
    })
  })

  test("supports observers without late context annotation", async () => {
    const completions: Array<TrafficCompletionObservation> = []
    const observerWithoutContext: TrafficObserver = {
      beginRequest() {
        return {
          recordDispatch() {},
          recordFirstResponse() {},
          recordTokens() {},
          complete(observation) {
            completions.push(observation)
          },
        }
      },
    }
    const app = new Hono()
    app.use(traceIdMiddleware)
    app.use(
      "/v1/messages",
      createTrafficObservationMiddleware(observerWithoutContext),
    )
    app.post("/v1/messages", (c) => c.text("ok"))

    const response = await app.request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-test", messages: [] }),
    })
    expect(await response.text()).toBe("ok")
    expect(completions).toHaveLength(1)
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

  test("normalizes exact, wildcard, provider, and fallback routes", async () => {
    const capture = new CaptureObserver()
    const app = new Hono()
    app.use(traceIdMiddleware)
    app.use("*", createTrafficObservationMiddleware(capture))
    app.all("*", (c) => c.text("ok"))
    const cases = [
      [
        "/v1/messages/count_tokens/private",
        "/v1/messages/count_tokens",
        "count-tokens",
      ],
      [
        "/hosted/v1/messages/count_tokens/private",
        "/:provider/v1/messages/count_tokens",
        "count-tokens",
      ],
      [
        "/hosted/v1/messages/count_tokens",
        "/:provider/v1/messages/count_tokens",
        "count-tokens",
      ],
      ["/hosted/v1/messages", "/:provider/v1/messages", "messages"],
      ["/chat/completions/private", "/chat/completions", "chat-completions"],
      ["/v1/embeddings", "/v1/embeddings", "embeddings"],
      ["/responses/private", "/responses", "responses"],
      ["/v1/messages/private", "/v1/messages", "messages"],
      ["/unknown", "/inference", "messages"],
    ] as const

    for (const [requestPath] of cases) {
      const response = await app.request(requestPath, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [] }),
      })
      expect(await response.text()).toBe("ok")
    }

    expect(
      capture.starts.map(({ route }) => [route.path, route.operation]),
    ).toEqual(cases.map(([, routePath, operation]) => [routePath, operation]))
    expect(capture.starts[1]?.attribution).toMatchObject({
      source: "provider",
      provider: "hosted",
    })
  })

  test("derives bounded request metadata and only known client labels", async () => {
    const capture = new CaptureObserver()
    const app = new Hono()
    app.use(traceIdMiddleware)
    app.use("*", createTrafficObservationMiddleware(capture))
    app.all("*", (c) => c.text("ok"))
    const clients = [
      ["Claude-Code/1.0", "claude-code"],
      ["Cursor/2.0", "cursor"],
      ["VSCode/3.0", "vscode"],
      ["OpenAI/Node", "openai-sdk"],
      ["Anthropic SDK", "anthropic-sdk"],
      ["private-client-value", null],
    ] as const
    const body = {
      model: "  bounded-model  ",
      input: ["one", "two"],
      tools: [{}, {}, {}],
      context_window: -1,
      context_window_tokens: 8192,
      max_tokens: 64,
      max_output_tokens: 128,
    }

    for (const [userAgent] of clients) {
      const response = await app.request("/v1/responses", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": userAgent,
        },
        body: JSON.stringify(body),
      })
      expect(await response.text()).toBe("ok")
    }

    expect(
      capture.handles.map(
        (handle) => handle.dispatchObservations[1]?.attribution.client,
      ),
    ).toEqual(clients.map(([, client]) => client))
    expect(
      capture.handles[0]?.dispatchObservations[1]?.attribution,
    ).toMatchObject({
      source: "copilot",
      provider: "copilot",
      model: "bounded-model",
    })
    expect(capture.handles[0]?.contexts[0]?.context).toEqual({
      messageCount: 2,
      toolDefinitionCount: 3,
      contextWindowTokens: 8192,
      requestedMaxOutputTokens: 64,
      usedTokens: null,
      usedRatio: null,
    })
    expect(JSON.stringify(capture.starts)).not.toContain("private-client-value")
  })

  test("uses valid fallback limits and attributes parent sessions", async () => {
    const capture = new CaptureObserver()
    const app = new Hono()
    app.use(traceIdMiddleware)
    app.use("*", createTrafficObservationMiddleware(capture))
    app.all("*", (c) => c.text("ok"))
    const response = await app.request("/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-parent-session-id": `  ${"p".repeat(250)}  `,
      },
      body: JSON.stringify({
        model: 123,
        messages: [{}],
        input: [{}, {}],
        context_window: 1.5,
        context_window_tokens: 0,
        max_tokens: -1,
        max_output_tokens: 0,
      }),
    })
    expect(await response.text()).toBe("ok")
    expect(
      capture.handles[0]?.dispatchObservations[1]?.attribution,
    ).toMatchObject({
      model: null,
      parentSessionId: "p".repeat(200),
      subagent: true,
    })
    expect(capture.handles[0]?.contexts[0]?.context).toMatchObject({
      messageCount: 1,
      contextWindowTokens: 0,
      requestedMaxOutputTokens: 0,
    })
  })

  test("validates request sizes and captures complete ingress metadata", async () => {
    const capture = new CaptureObserver()
    const app = new Hono()
    app.use(traceIdMiddleware)
    app.use("*", createTrafficObservationMiddleware(capture))
    app.all("*", (c) => c.text("ok"))
    const sizes = [
      ["42", 42],
      ["0", 0],
      ["-1", null],
      ["1.5", null],
      [String(16 * 1024 * 1024), 16 * 1024 * 1024],
      [String(16 * 1024 * 1024 + 1), null],
      [String(Number.MAX_SAFE_INTEGER + 1), null],
    ] as const

    for (const [contentLength] of sizes) {
      const response = await app.request("/v1/messages", {
        method: "POST",
        headers: {
          "content-length": contentLength,
          "x-session-affinity": "session-1",
          "x-trace-id": "trace-request",
        },
      })
      expect(await response.text()).toBe("ok")
    }

    expect(capture.starts.map(({ size }) => size.requestBytes)).toEqual(
      sizes.map(([, expected]) => expected),
    )
    const startObservation = capture.starts[0]
    expect(startObservation.identity).toMatchObject({
      traceId: "trace-request",
      sessionId: "session-1",
      parentRequestId: null,
      clientRequestId: null,
    })
    expect(startObservation.identity.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    )
    expect(Number.isFinite(Date.parse(startObservation.acceptedAt))).toBe(true)
    expect(startObservation.route).toEqual({
      method: "POST",
      path: "/v1/messages",
      operation: "messages",
    })
    expect(startObservation.size).toEqual({
      requestBytes: 42,
      responseBytes: null,
      responseChunks: null,
    })
    expect(capture.handles[0]?.dispatchObservations[0]).toMatchObject({
      attribution: { model: null },
      dispatch: {
        attemptCount: 1,
        retryCount: 0,
        statusCode: null,
        streamed: null,
        upstreamRequestId: null,
        requestedModel: null,
        resolvedModel: null,
      },
    })
  })

  test("classifies status failures and handles empty responses", async () => {
    const capture = new CaptureObserver()
    const app = new Hono()
    app.use(traceIdMiddleware)
    app.use("*", createTrafficObservationMiddleware(capture))
    app.all("/:status", (c) => {
      const status = Number(c.req.param("status"))
      return new Response(status === 204 || status === 400 ? null : "status", {
        status,
      })
    })
    const cases = [
      [200, "succeeded", null],
      [204, "succeeded", null],
      [400, "failed", ["client", "http_400", false]],
      [408, "failed", ["client", "http_408", true]],
      [429, "failed", ["client", "http_429", true]],
      [500, "failed", ["internal", "http_500", true]],
    ] as const

    for (const [status] of cases) {
      const response = await app.request(`/${status}`, { method: "POST" })
      expect(response.status).toBe(status)
      await response.text()
    }

    expect(
      capture.handles.map((handle) => {
        const result = handle.completions[0]
        return [
          result.outcome,
          result.error === null ?
            null
          : [result.error.category, result.error.code, result.error.retryable],
        ]
      }),
    ).toEqual(
      cases.map(([, outcome, error]) => [
        outcome,
        error === null ? null : [...error],
      ]),
    )
    expect(capture.handles[1]?.completions[0]?.size).toMatchObject({
      responseBytes: 0,
      responseChunks: 0,
    })
    expect(capture.handles[2]?.completions[0]).toMatchObject({
      outcome: "failed",
      dispatch: { statusCode: 400, streamed: false },
      size: { responseBytes: 0, responseChunks: 0 },
      error: { category: "client", code: "http_400", retryable: false },
    })
    expect(capture.handles[2]?.firstResponseObservations).toHaveLength(1)
    expect(capture.handles[2]?.firstResponseObservations[0]).toMatchObject({
      statusCode: 400,
      streamed: false,
    })
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

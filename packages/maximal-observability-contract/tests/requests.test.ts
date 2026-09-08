import assert from "node:assert/strict"
import test from "node:test"

import {
  TRAFFIC_OBSERVABILITY_CONTRACT_VERSION,
  TRAFFIC_REQUEST_PAGE_SIZE_MAX,
  TrafficRequestDetailSchema,
  TrafficRequestFiltersSchema,
  TrafficRequestListQuerySchema,
  TrafficRequestListSchema,
  TrafficRequestSummarySchema,
  TrafficTimeRangeSchema,
} from "../src/index.ts"
import { completedRequest, timestamp } from "./fixtures.ts"

void test("request filters and cursor query have stable defaults", () => {
  assert.deepEqual(TrafficRequestFiltersSchema.parse({}), {
    range: null,
    states: [],
    outcomes: [],
    operations: [],
    providers: [],
    models: [],
    clients: [],
    search: null,
    minimumDurationMs: null,
    maximumDurationMs: null,
  })
  assert.deepEqual(TrafficRequestListQuerySchema.parse({}), {
    filters: TrafficRequestFiltersSchema.parse({}),
    cursor: null,
    limit: 50,
    sort: "acceptedAt",
    direction: "descending",
  })

  assert.throws(() => TrafficRequestListQuerySchema.parse({ limit: 0 }))
  assert.throws(() =>
    TrafficRequestListQuerySchema.parse({
      limit: TRAFFIC_REQUEST_PAGE_SIZE_MAX + 1,
    }),
  )
  assert.throws(() =>
    TrafficRequestFiltersSchema.parse({
      minimumDurationMs: 20,
      maximumDurationMs: 10,
    }),
  )
  assert.throws(() =>
    TrafficRequestFiltersSchema.parse({ providers: ["one", "one"] }),
  )
})

void test("time ranges are ordered and use offset timestamps", () => {
  assert.deepEqual(
    TrafficTimeRangeSchema.parse({
      from: "2026-09-07T10:00:00.000Z",
      to: timestamp,
    }),
    {
      from: "2026-09-07T10:00:00.000Z",
      to: timestamp,
    },
  )
  assert.throws(() =>
    TrafficTimeRangeSchema.parse({
      from: timestamp,
      to: "2026-09-07T10:00:00.000Z",
    }),
  )
})

void test("request state, outcome, and error metadata remain consistent", () => {
  const request = completedRequest()
  assert.deepEqual(TrafficRequestSummarySchema.parse(request), request)

  assert.throws(() =>
    TrafficRequestSummarySchema.parse({ ...request, outcome: null }),
  )
  assert.throws(() =>
    TrafficRequestSummarySchema.parse({
      ...request,
      state: "streaming",
      outcome: "succeeded",
    }),
  )
  assert.throws(() =>
    TrafficRequestSummarySchema.parse({
      ...request,
      error: {
        category: "provider",
        code: "failed",
        message: "failed",
        retryable: false,
      },
    }),
  )
})

void test("cursor pages are versioned, bounded, and cursor-consistent", () => {
  const page = {
    contractVersion: TRAFFIC_OBSERVABILITY_CONTRACT_VERSION,
    items: [completedRequest()],
    nextCursor: "opaque-cursor",
    hasMore: true,
  }
  assert.deepEqual(TrafficRequestListSchema.parse(page), page)

  assert.throws(() =>
    TrafficRequestListSchema.parse({ ...page, contractVersion: 2 }),
  )
  assert.throws(() =>
    TrafficRequestListSchema.parse({ ...page, nextCursor: null }),
  )
})

void test("request detail carries an ordered, bounded lifecycle", () => {
  const detail = {
    contractVersion: TRAFFIC_OBSERVABILITY_CONTRACT_VERSION,
    request: completedRequest(),
    lifecycle: [
      {
        sequence: 0,
        at: timestamp,
        kind: "accepted" as const,
        state: "accepted" as const,
        outcome: null,
      },
      {
        sequence: 1,
        at: "2026-09-07T12:00:00.500Z",
        kind: "completed" as const,
        state: "completed" as const,
        outcome: "succeeded" as const,
      },
    ],
  }
  assert.deepEqual(TrafficRequestDetailSchema.parse(detail), detail)

  assert.throws(() =>
    TrafficRequestDetailSchema.parse({
      ...detail,
      lifecycle: [...detail.lifecycle].reverse(),
    }),
  )
})

import assert from "node:assert/strict"
import test from "node:test"

import {
  TRAFFIC_OBSERVABILITY_CONTRACT_VERSION,
  TrafficFlowSchema,
  TrafficLatencyPercentilesSchema,
  TrafficOverviewSchema,
  TrafficOverviewTotalsSchema,
  TrafficTokenSeriesSchema,
} from "../src/index.ts"
import { timestamp } from "./fixtures.ts"

const emptyPercentiles = {
  sampleCount: 0,
  p50Ms: null,
  p90Ms: null,
  p95Ms: null,
  p99Ms: null,
}

const totals = {
  requests: 2,
  active: 1,
  succeeded: 1,
  failed: 0,
  cancelled: 0,
  inputTokens: 20,
  outputTokens: 10,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  totalTokens: 30,
  requestBytes: 512,
  responseBytes: 1_024,
}

const flow = {
  nodes: [
    {
      id: "route:messages",
      kind: "route" as const,
      label: "messages",
      requestCount: 2,
      totalTokens: 30,
    },
    {
      id: "provider:anthropic",
      kind: "provider" as const,
      label: "anthropic",
      requestCount: 2,
      totalTokens: 30,
    },
  ],
  edges: [
    {
      source: "route:messages",
      target: "provider:anthropic",
      requestCount: 2,
      totalTokens: 30,
      averageDurationMs: 500,
    },
  ],
}

const tokens = {
  bucketMs: 60_000,
  points: [
    {
      start: timestamp,
      end: "2026-09-07T12:01:00.000Z",
      requestCount: 1,
      inputTokens: 20,
      outputTokens: 10,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      totalTokens: 30,
    },
  ],
}

void test("overview totals account for every request", () => {
  assert.deepEqual(TrafficOverviewTotalsSchema.parse(totals), totals)
  assert.throws(() =>
    TrafficOverviewTotalsSchema.parse({ ...totals, requests: 3 }),
  )
})

void test("latency percentiles describe valid monotonic populations", () => {
  assert.deepEqual(
    TrafficLatencyPercentilesSchema.parse(emptyPercentiles),
    emptyPercentiles,
  )
  assert.deepEqual(
    TrafficLatencyPercentilesSchema.parse({
      sampleCount: 4,
      p50Ms: 10,
      p90Ms: 20,
      p95Ms: 30,
      p99Ms: 40,
    }),
    {
      sampleCount: 4,
      p50Ms: 10,
      p90Ms: 20,
      p95Ms: 30,
      p99Ms: 40,
    },
  )
  assert.throws(() =>
    TrafficLatencyPercentilesSchema.parse({
      sampleCount: 4,
      p50Ms: 20,
      p90Ms: 10,
      p95Ms: 30,
      p99Ms: 40,
    }),
  )
})

void test("flow edges reference unique declared nodes", () => {
  assert.deepEqual(TrafficFlowSchema.parse(flow), flow)
  assert.throws(() =>
    TrafficFlowSchema.parse({
      ...flow,
      edges: [{ ...flow.edges[0], target: "provider:missing" }],
    }),
  )
  assert.throws(() =>
    TrafficFlowSchema.parse({
      ...flow,
      nodes: [...flow.nodes, flow.nodes[0]],
    }),
  )
})

void test("token series is bounded, ordered, and non-overlapping", () => {
  assert.deepEqual(TrafficTokenSeriesSchema.parse(tokens), tokens)
  assert.throws(() =>
    TrafficTokenSeriesSchema.parse({
      ...tokens,
      points: [
        ...tokens.points,
        {
          ...tokens.points[0],
          start: "2026-09-07T12:00:30.000Z",
          end: "2026-09-07T12:01:30.000Z",
        },
      ],
    }),
  )
})

void test("overview snapshot composes totals, latency, flow, and tokens", () => {
  const overview = {
    contractVersion: TRAFFIC_OBSERVABILITY_CONTRACT_VERSION,
    generatedAt: timestamp,
    range: {
      from: timestamp,
      to: "2026-09-07T13:00:00.000Z",
    },
    totals,
    latency: {
      queue: emptyPercentiles,
      timeToFirstResponse: emptyPercentiles,
      total: emptyPercentiles,
    },
    flow,
    tokens,
  }

  assert.deepEqual(TrafficOverviewSchema.parse(overview), overview)
  assert.throws(() =>
    TrafficOverviewSchema.parse({ ...overview, contractVersion: 0 }),
  )
})

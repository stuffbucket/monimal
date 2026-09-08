import type {
  TrafficInvalidation,
  TrafficInvalidationListener,
  TrafficOverview,
  TrafficRequestDetail,
  TrafficRequestPage,
  TrafficRequestSummary,
} from "@stuffbucket/maximal-observability-contract"

import type { ObservabilitySource } from "../src/source.ts"

export const REQUEST: TrafficRequestSummary = {
  identity: {
    requestId: "req-1",
    traceId: "trace-1",
    sessionId: null,
    parentRequestId: null,
    clientRequestId: null,
  },
  state: "completed",
  outcome: "succeeded",
  timing: {
    acceptedAt: "2026-09-07T20:00:00.000Z",
    dispatchStartedAt: "2026-09-07T20:00:00.010Z",
    firstResponseAt: "2026-09-07T20:00:00.100Z",
    completedAt: "2026-09-07T20:00:01.000Z",
    queueMs: 10,
    timeToFirstResponseMs: 100,
    durationMs: 1_000,
  },
  route: { method: "POST", path: "/v1/messages", operation: "messages.create" },
  attribution: {
    source: "sdk",
    client: "Claude Code",
    project: "monimal",
    provider: "copilot",
    model: "claude-sonnet",
  },
  dispatch: {
    attemptCount: 1,
    retryCount: 0,
    statusCode: 200,
    streamed: true,
    upstreamRequestId: "up-1",
  },
  tokens: {
    inputTokens: 120,
    outputTokens: 80,
    cacheReadInputTokens: 20,
    cacheCreationInputTokens: 10,
    reasoningTokens: 0,
    totalTokens: 200,
  },
  context: {
    messageCount: 4,
    toolDefinitionCount: 2,
    contextWindowTokens: 200_000,
    requestedMaxOutputTokens: 4_096,
  },
  size: { requestBytes: 2_048, responseBytes: 4_096, responseChunks: 8 },
  error: null,
}

const percentile = {
  sampleCount: 1,
  p50Ms: 100,
  p90Ms: 200,
  p95Ms: 250,
  p99Ms: 300,
}

export const OVERVIEW: TrafficOverview = {
  contractVersion: 1,
  generatedAt: "2026-09-07T20:01:00.000Z",
  range: { from: "2026-09-07T19:00:00.000Z", to: "2026-09-07T20:01:00.000Z" },
  totals: {
    requests: 1,
    active: 0,
    succeeded: 1,
    failed: 0,
    cancelled: 0,
    inputTokens: 120,
    outputTokens: 80,
    cacheReadInputTokens: 20,
    cacheCreationInputTokens: 10,
    totalTokens: 200,
    requestBytes: 2_048,
    responseBytes: 4_096,
  },
  latency: {
    queue: percentile,
    timeToFirstResponse: percentile,
    total: percentile,
  },
  flow: {
    nodes: [
      {
        id: "client:claude",
        kind: "client",
        label: "Claude Code",
        requestCount: 1,
        totalTokens: 200,
      },
      {
        id: "route:messages",
        kind: "route",
        label: "messages.create",
        requestCount: 1,
        totalTokens: 200,
      },
      {
        id: "provider:copilot",
        kind: "provider",
        label: "copilot",
        requestCount: 1,
        totalTokens: 200,
      },
      {
        id: "model:sonnet",
        kind: "model",
        label: "claude-sonnet",
        requestCount: 1,
        totalTokens: 200,
      },
      {
        id: "outcome:succeeded",
        kind: "outcome",
        label: "succeeded",
        requestCount: 1,
        totalTokens: 200,
      },
    ],
    edges: [
      {
        source: "client:claude",
        target: "route:messages",
        requestCount: 1,
        totalTokens: 200,
        averageDurationMs: 1_000,
      },
      {
        source: "route:messages",
        target: "provider:copilot",
        requestCount: 1,
        totalTokens: 200,
        averageDurationMs: 1_000,
      },
      {
        source: "provider:copilot",
        target: "model:sonnet",
        requestCount: 1,
        totalTokens: 200,
        averageDurationMs: 1_000,
      },
      {
        source: "model:sonnet",
        target: "outcome:succeeded",
        requestCount: 1,
        totalTokens: 200,
        averageDurationMs: 1_000,
      },
    ],
  },
  tokens: {
    bucketMs: 60_000,
    points: [
      {
        start: "2026-09-07T20:00:00.000Z",
        end: "2026-09-07T20:01:00.000Z",
        requestCount: 1,
        inputTokens: 120,
        outputTokens: 80,
        cacheReadInputTokens: 20,
        cacheCreationInputTokens: 10,
        totalTokens: 200,
      },
    ],
  },
}

export const PAGE: TrafficRequestPage = {
  contractVersion: 1,
  items: [REQUEST],
  nextCursor: null,
  hasMore: false,
}

export const DETAIL: TrafficRequestDetail = {
  contractVersion: 1,
  request: REQUEST,
  lifecycle: [
    {
      sequence: 0,
      at: REQUEST.timing.acceptedAt,
      kind: "accepted",
      state: "accepted",
      outcome: null,
    },
    {
      sequence: 1,
      at: REQUEST.timing.completedAt ?? REQUEST.timing.acceptedAt,
      kind: "completed",
      state: "completed",
      outcome: "succeeded",
    },
  ],
}

export class FakeSource implements ObservabilitySource {
  overviewReads = 0
  requestReads = 0
  detailReads = 0
  listener: TrafficInvalidationListener | null = null

  readOverview() {
    this.overviewReads += 1
    return Promise.resolve({ status: "ready" as const, data: OVERVIEW })
  }

  readRequests() {
    this.requestReads += 1
    return Promise.resolve({ status: "ready" as const, data: PAGE })
  }

  readRequestDetail() {
    this.detailReads += 1
    return Promise.resolve({ status: "ready" as const, data: DETAIL })
  }

  subscribeTrafficInvalidation(listener: TrafficInvalidationListener) {
    this.listener = listener
    return () => {
      this.listener = null
    }
  }

  invalidate(invalidation: TrafficInvalidation) {
    this.listener?.(invalidation)
  }
}

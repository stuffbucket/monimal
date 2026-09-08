import type {
  TrafficRequestSummary,
  TrafficTokenMetadata,
} from "../src/index.ts"

export const timestamp = "2026-09-07T12:00:00.000Z"

export const emptyTokens: TrafficTokenMetadata = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  reasoningTokens: 0,
  totalTokens: 0,
  totalNanoAiu: 0,
}

export const completedRequest = (
  requestId = "request-1",
): TrafficRequestSummary => ({
  identity: {
    requestId,
    traceId: "trace-1",
    sessionId: "session-1",
    parentRequestId: null,
    clientRequestId: null,
  },
  state: "completed",
  outcome: "succeeded",
  timing: {
    acceptedAt: timestamp,
    dispatchStartedAt: "2026-09-07T12:00:00.010Z",
    firstResponseAt: "2026-09-07T12:00:00.100Z",
    completedAt: "2026-09-07T12:00:00.500Z",
    queueMs: 10,
    timeToFirstResponseMs: 100,
    durationMs: 500,
  },
  route: {
    method: "POST",
    path: "/v1/messages",
    operation: "messages",
  },
  attribution: {
    source: "proxy",
    client: "cli",
    project: null,
    provider: "anthropic",
    model: "model-1",
    parentSessionId: null,
    subagent: null,
    compactType: null,
  },
  dispatch: {
    attemptCount: 1,
    retryCount: 0,
    statusCode: 200,
    streamed: true,
    upstreamRequestId: "upstream-1",
    requestedModel: "model-1",
    resolvedModel: "model-1",
  },
  tokens: {
    ...emptyTokens,
    inputTokens: 20,
    outputTokens: 10,
    totalTokens: 30,
  },
  context: {
    messageCount: 2,
    toolDefinitionCount: 1,
    contextWindowTokens: 200_000,
    requestedMaxOutputTokens: 1_024,
    usedTokens: 20,
    usedRatio: 0.0001,
  },
  size: {
    requestBytes: 512,
    responseBytes: 1_024,
    responseChunks: 4,
  },
  response: {
    stopReason: "end_turn",
    toolUseCount: 0,
  },
  error: null,
})

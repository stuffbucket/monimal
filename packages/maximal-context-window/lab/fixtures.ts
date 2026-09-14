import type { TrafficRequestSummary } from "@stuffbucket/maximal-observability-contract"

const CONTEXT_WINDOW_TOKENS = 200_000
const REQUESTED_MAX_OUTPUT_TOKENS = 8_192

function turn({
  index,
  sessionId,
  minutesAgo,
  inputTokens,
  outputTokens,
  cacheReadInputTokens,
  cacheCreationInputTokens,
  model,
}: {
  index: number
  sessionId: string
  minutesAgo: number
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  model: string
}): TrafficRequestSummary {
  const acceptedAt = new Date(Date.now() - minutesAgo * 60_000).toISOString()
  const usedTokens =
    inputTokens + cacheReadInputTokens + cacheCreationInputTokens
  return {
    identity: {
      requestId: `req-${sessionId}-${String(index)}`,
      traceId: `trace-${sessionId}-${String(index)}`,
      sessionId,
      parentRequestId: null,
      clientRequestId: null,
    },
    state: "completed",
    outcome: "succeeded",
    timing: {
      acceptedAt,
      dispatchStartedAt: acceptedAt,
      firstResponseAt: acceptedAt,
      completedAt: acceptedAt,
      queueMs: 12,
      timeToFirstResponseMs: 340,
      durationMs: 1_800 + index * 220,
    },
    route: {
      method: "POST",
      path: "/v1/messages",
      operation: "messages.create",
    },
    attribution: {
      source: "sdk",
      client: "Claude Code",
      project: "monimal",
      provider: "copilot",
      model,
      parentSessionId: null,
      subagent: null,
      compactType: null,
    },
    dispatch: {
      attemptCount: 1,
      retryCount: 0,
      statusCode: 200,
      streamed: true,
      upstreamRequestId: `up-${sessionId}-${String(index)}`,
      requestedModel: model,
      resolvedModel: model,
    },
    tokens: {
      inputTokens,
      outputTokens,
      cacheReadInputTokens,
      cacheCreationInputTokens,
      reasoningTokens: 0,
      totalTokens: inputTokens + outputTokens,
      totalNanoAiu: 0,
    },
    context: {
      messageCount: 2 + index * 3,
      toolDefinitionCount: 6,
      contextWindowTokens: CONTEXT_WINDOW_TOKENS,
      requestedMaxOutputTokens: REQUESTED_MAX_OUTPUT_TOKENS,
      usedTokens,
      usedRatio: usedTokens / CONTEXT_WINDOW_TOKENS,
    },
    size: { requestBytes: 4_096, responseBytes: 8_192, responseChunks: 12 },
    response: { stopReason: "end_turn", toolUseCount: index % 3 },
    error: null,
  }
}

// A long-running session that escalates from a small opening turn toward the
// context window's limit, the way an agentic coding session accumulates
// history across many tool calls.
const LONG_SESSION: Array<TrafficRequestSummary> = [
  turn({
    index: 1,
    sessionId: "session-long-running",
    minutesAgo: 42,
    inputTokens: 1_200,
    outputTokens: 600,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 1_200,
    model: "claude-sonnet-4.5",
  }),
  turn({
    index: 2,
    sessionId: "session-long-running",
    minutesAgo: 37,
    inputTokens: 3_400,
    outputTokens: 1_100,
    cacheReadInputTokens: 1_200,
    cacheCreationInputTokens: 2_200,
    model: "claude-sonnet-4.5",
  }),
  turn({
    index: 3,
    sessionId: "session-long-running",
    minutesAgo: 30,
    inputTokens: 9_800,
    outputTokens: 2_400,
    cacheReadInputTokens: 4_600,
    cacheCreationInputTokens: 5_200,
    model: "claude-sonnet-4.5",
  }),
  turn({
    index: 4,
    sessionId: "session-long-running",
    minutesAgo: 21,
    inputTokens: 26_000,
    outputTokens: 4_800,
    cacheReadInputTokens: 12_000,
    cacheCreationInputTokens: 14_000,
    model: "claude-sonnet-4.5",
  }),
  turn({
    index: 5,
    sessionId: "session-long-running",
    minutesAgo: 9,
    inputTokens: 50_000,
    outputTokens: 7_200,
    cacheReadInputTokens: 30_000,
    cacheCreationInputTokens: 20_000,
    model: "claude-sonnet-4.5",
  }),
  turn({
    index: 6,
    sessionId: "session-long-running",
    minutesAgo: 1,
    inputTokens: 70_000,
    outputTokens: 8_000,
    cacheReadInputTokens: 50_000,
    cacheCreationInputTokens: 30_000,
    model: "claude-sonnet-4.5",
  }),
]

// A short, lightweight session using a smaller model, shown for contrast.
const SHORT_SESSION: Array<TrafficRequestSummary> = [
  turn({
    index: 1,
    sessionId: "session-quick-question",
    minutesAgo: 5,
    inputTokens: 800,
    outputTokens: 240,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    model: "claude-haiku-4.5",
  }),
  turn({
    index: 2,
    sessionId: "session-quick-question",
    minutesAgo: 4,
    inputTokens: 1_400,
    outputTokens: 320,
    cacheReadInputTokens: 800,
    cacheCreationInputTokens: 0,
    model: "claude-haiku-4.5",
  }),
]

export const LAB_REQUESTS: Array<TrafficRequestSummary> = [
  ...LONG_SESSION,
  ...SHORT_SESSION,
]

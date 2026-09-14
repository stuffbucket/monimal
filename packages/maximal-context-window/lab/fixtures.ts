import type { TrafficRequestSummary } from "@stuffbucket/maximal-observability-contract"

import type { ContextInputSegment } from "../src/context-window.ts"

const CONTEXT_WINDOW_TOKENS = 200_000
const REQUESTED_MAX_OUTPUT_TOKENS = 8_192

/**
 * Sums a turn's input segments into the whole-request token counters the
 * observability contract actually reports, so the fixture's detailed
 * breakdown (which a real backend cannot report) and the totals a real
 * backend *would* report never disagree with each other.
 */
function tokensFromSegments(
  segments: Array<ContextInputSegment>,
  outputTokens: number,
): NonNullable<TrafficRequestSummary["tokens"]> {
  const cacheReadInputTokens = segments.reduce(
    (sum, segment) => sum + segment.cachedTokens,
    0,
  )
  const inputTokens = segments.reduce(
    (sum, segment) => sum + (segment.tokens - segment.cachedTokens),
    0,
  )
  return {
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens: 0,
    reasoningTokens: 0,
    totalTokens: inputTokens + cacheReadInputTokens + outputTokens,
    totalNanoAiu: 0,
  }
}

function turn({
  index,
  sessionId,
  minutesAgo,
  segments,
  outputTokens,
  model,
}: {
  index: number
  sessionId: string
  minutesAgo: number
  segments: Array<ContextInputSegment>
  outputTokens: number
  model: string
}): { request: TrafficRequestSummary; segments: Array<ContextInputSegment> } {
  const acceptedAt = new Date(Date.now() - minutesAgo * 60_000).toISOString()
  const tokens = tokensFromSegments(segments, outputTokens)
  const usedTokens =
    tokens.inputTokens
    + tokens.cacheReadInputTokens
    + tokens.cacheCreationInputTokens
  const request: TrafficRequestSummary = {
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
    tokens,
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
  return { request, segments }
}

// A long-running agentic coding session. The system prompt, tool
// definitions, MCP definitions, and skills are a stable prefix: uncached on
// the first turn (a cold cache), then fully cached on every turn after.
// The user-facing conversation grows every turn; only its newest slice is
// ever uncached, since the model has already seen (and cached) the rest.
const STATIC_PREFIX = { system: 900, tools: 1_400, mcp: 700, skills: 500 }

function staticPrefixSegments(cached: boolean): Array<ContextInputSegment> {
  return [
    {
      category: "system",
      tokens: STATIC_PREFIX.system,
      cachedTokens: cached ? STATIC_PREFIX.system : 0,
    },
    {
      category: "tools",
      tokens: STATIC_PREFIX.tools,
      cachedTokens: cached ? STATIC_PREFIX.tools : 0,
    },
    {
      category: "mcp",
      tokens: STATIC_PREFIX.mcp,
      cachedTokens: cached ? STATIC_PREFIX.mcp : 0,
    },
    {
      category: "skills",
      tokens: STATIC_PREFIX.skills,
      cachedTokens: cached ? STATIC_PREFIX.skills : 0,
    },
  ]
}

const LONG_SESSION_TURNS: Array<{
  minutesAgo: number
  userInputTokens: number
  userInputCachedTokens: number
  outputTokens: number
}> = [
  {
    minutesAgo: 42,
    userInputTokens: 800,
    userInputCachedTokens: 0,
    outputTokens: 600,
  },
  {
    minutesAgo: 37,
    userInputTokens: 2_200,
    userInputCachedTokens: 800,
    outputTokens: 1_100,
  },
  {
    minutesAgo: 30,
    userInputTokens: 7_500,
    userInputCachedTokens: 2_200,
    outputTokens: 2_400,
  },
  {
    minutesAgo: 21,
    userInputTokens: 22_000,
    userInputCachedTokens: 7_500,
    outputTokens: 4_800,
  },
  {
    minutesAgo: 9,
    userInputTokens: 55_000,
    userInputCachedTokens: 22_000,
    outputTokens: 7_200,
  },
  {
    minutesAgo: 1,
    userInputTokens: 95_000,
    userInputCachedTokens: 55_000,
    outputTokens: 8_000,
  },
]

const LONG_SESSION = LONG_SESSION_TURNS.map((data, position) => {
  const index = position + 1
  return turn({
    index,
    sessionId: "session-long-running",
    minutesAgo: data.minutesAgo,
    segments: [
      ...staticPrefixSegments(index > 1),
      {
        category: "userInput",
        tokens: data.userInputTokens,
        cachedTokens: data.userInputCachedTokens,
      },
    ],
    outputTokens: data.outputTokens,
    model: "claude-sonnet-4.5",
  })
})

// A short, lightweight session using a smaller model and no MCP servers or
// skills, shown for contrast.
const SHORT_SESSION_TURNS: Array<{
  minutesAgo: number
  userInputTokens: number
  userInputCachedTokens: number
  outputTokens: number
}> = [
  {
    minutesAgo: 5,
    userInputTokens: 300,
    userInputCachedTokens: 0,
    outputTokens: 240,
  },
  {
    minutesAgo: 4,
    userInputTokens: 900,
    userInputCachedTokens: 300,
    outputTokens: 320,
  },
]

const SHORT_STATIC_PREFIX = { system: 300, tools: 200 }

const SHORT_SESSION = SHORT_SESSION_TURNS.map((data, position) => {
  const index = position + 1
  const cached = index > 1
  return turn({
    index,
    sessionId: "session-quick-question",
    minutesAgo: data.minutesAgo,
    segments: [
      {
        category: "system",
        tokens: SHORT_STATIC_PREFIX.system,
        cachedTokens: cached ? SHORT_STATIC_PREFIX.system : 0,
      },
      {
        category: "tools",
        tokens: SHORT_STATIC_PREFIX.tools,
        cachedTokens: cached ? SHORT_STATIC_PREFIX.tools : 0,
      },
      {
        category: "userInput",
        tokens: data.userInputTokens,
        cachedTokens: data.userInputCachedTokens,
      },
    ],
    outputTokens: data.outputTokens,
    model: "claude-haiku-4.5",
  })
})

const LAB_TURNS = [...LONG_SESSION, ...SHORT_SESSION]

export const LAB_REQUESTS: Array<TrafficRequestSummary> = LAB_TURNS.map(
  ({ request }) => request,
)

/** The detailed input breakdown behind each lab request, keyed by request
 * id -- stands in for a source that can attribute its own prompt, which
 * the observability contract itself cannot do. See
 * `ContextWindowSessionPanel`'s `inputSegmentsFor` prop. */
export const LAB_INPUT_SEGMENTS: Map<
  string,
  Array<ContextInputSegment>
> = new Map(
  LAB_TURNS.map(({ request, segments }) => [
    request.identity.requestId,
    segments,
  ]),
)

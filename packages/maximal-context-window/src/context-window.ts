import type { TrafficRequestSummary } from "@stuffbucket/maximal-observability-contract"

export const CONTEXT_CELL_COUNT = 32

export interface ContextSession {
  id: string
  turns: Array<TrafficRequestSummary>
}

export interface ContextCells {
  input: number
  output: number
  available: number
}

export function deriveContextSessions(
  requests: Array<TrafficRequestSummary>,
): Array<ContextSession> {
  const sessions = new Map<string, Array<TrafficRequestSummary>>()
  for (const request of requests) {
    const sessionId = request.identity.sessionId
    if (sessionId === null) continue
    const turns = sessions.get(sessionId) ?? []
    turns.push(request)
    sessions.set(sessionId, turns)
  }
  return [...sessions].map(([id, turns]) => ({
    id,
    turns: turns.toSorted((left, right) =>
      left.timing.acceptedAt.localeCompare(right.timing.acceptedAt),
    ),
  }))
}

export function deriveContextCells({
  inputTokens,
  outputTokens,
  contextWindowTokens,
  cellCount = CONTEXT_CELL_COUNT,
}: {
  inputTokens: number
  outputTokens: number
  contextWindowTokens: number
  cellCount?: number
}): ContextCells | null {
  if (contextWindowTokens <= 0 || cellCount <= 0) return null
  const boundedInput = Math.min(inputTokens, contextWindowTokens)
  const boundedOutput = Math.min(
    outputTokens,
    Math.max(0, contextWindowTokens - boundedInput),
  )
  let input = Math.round((boundedInput / contextWindowTokens) * cellCount)
  let output = Math.round((boundedOutput / contextWindowTokens) * cellCount)
  if (boundedInput > 0 && input === 0) input = 1
  if (boundedOutput > 0 && output === 0) output = 1
  if (input + output > cellCount) {
    output = Math.max(0, cellCount - input)
  }
  return {
    input,
    output,
    available: Math.max(0, cellCount - input - output),
  }
}

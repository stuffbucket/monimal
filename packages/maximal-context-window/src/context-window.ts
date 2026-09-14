import type { TrafficRequestSummary } from "@stuffbucket/maximal-observability-contract"

export const CONTEXT_GRID_CELL_COUNT = 240
export const CONTEXT_GRID_COLUMNS = 20

export interface ContextSession {
  id: string
  turns: Array<TrafficRequestSummary>
}

/**
 * The categories a turn's context window is broken into, in fill order.
 * `cached`/`created` come from the prompt cache, `input` is the fresh,
 * uncached portion of the request, `output` is what the model actually
 * generated, `reserved` is the slice of the requested output budget left
 * unused, and `free` is whatever capacity remains unclaimed.
 */
export type ContextGridCategory =
  "cached" | "created" | "input" | "output" | "reserved" | "free"

export interface ContextGridSegment {
  category: ContextGridCategory
  tokens: number
  cells: number
}

export interface ContextGrid {
  contextWindowTokens: number
  segments: Array<ContextGridSegment>
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

/**
 * Approximates a turn's context window as a fixed number of equally sized
 * cells, categorized and ordered the way the window actually fills: cached
 * and newly created prompt-cache entries, then fresh input, generated
 * output, the unused slice of the requested output budget, and finally
 * whatever capacity is left over. Returns `null` when the turn does not
 * report enough token accounting to place it on the grid.
 */
export function deriveContextGrid({
  request,
  cellCount = CONTEXT_GRID_CELL_COUNT,
}: {
  request: TrafficRequestSummary
  cellCount?: number
}): ContextGrid | null {
  const contextWindowTokens = request.context.contextWindowTokens
  const tokens = request.tokens
  if (
    contextWindowTokens === null
    || contextWindowTokens <= 0
    || cellCount <= 0
    || tokens === null
  ) {
    return null
  }
  const {
    outputTokens,
    cacheReadInputTokens: cachedTokens,
    cacheCreationInputTokens: createdTokens,
    inputTokens,
  } = tokens

  const requestedMaxOutputTokens = request.context.requestedMaxOutputTokens
  const reservedTokens =
    requestedMaxOutputTokens === null ? 0 : (
      Math.max(0, requestedMaxOutputTokens - outputTokens)
    )

  // Claim tokens against the window's remaining budget in fill order, so a
  // turn that over-reports (for example, a reserved output budget that would
  // push past the window on its own) never claims more than is actually
  // left.
  let budget = contextWindowTokens
  const claim = (tokens: number): number => {
    const used = Math.max(0, Math.min(tokens, budget))
    budget -= used
    return used
  }
  const boundedTokens: Record<Exclude<ContextGridCategory, "free">, number> = {
    cached: claim(cachedTokens),
    created: claim(createdTokens),
    input: claim(inputTokens),
    output: claim(outputTokens),
    reserved: claim(reservedTokens),
  }
  const freeTokens = Math.max(0, budget)

  let cellsLeft = cellCount
  const toCells = (tokens: number): number => {
    let cells = Math.round((tokens / contextWindowTokens) * cellCount)
    if (tokens > 0 && cells === 0) cells = 1
    cells = Math.min(cells, cellsLeft)
    cellsLeft -= cells
    return cells
  }

  const segments: Array<ContextGridSegment> = (
    ["cached", "created", "input", "output", "reserved"] as const
  ).map((category) => ({
    category,
    tokens: boundedTokens[category],
    cells: toCells(boundedTokens[category]),
  }))
  segments.push({
    category: "free",
    tokens: freeTokens,
    cells: Math.max(0, cellsLeft),
  })

  return { contextWindowTokens, segments }
}

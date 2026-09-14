import type { TrafficRequestSummary } from "@stuffbucket/maximal-observability-contract"

/** Grid is 10 blocks wide, each representing a fixed 2k-token slice of the
 * context window (not scaled to the window size), so the grid's height
 * grows with the window instead of every window looking equally full. */
export const CONTEXT_GRID_COLUMNS = 10
export const CONTEXT_GRID_CELL_TOKENS = 2_000
export const CONTEXT_GRID_HALF_CELL_TOKENS = CONTEXT_GRID_CELL_TOKENS / 2

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
 *
 * The observability contract does not break a request down by system
 * prompt, MCP servers, skills, or tool definitions the way Claude Code's
 * `/context` does, so those are not represented here -- only categories
 * backed by real reported token counts are.
 */
export type ContextGridCategory =
  "cached" | "created" | "input" | "output" | "reserved" | "free"

export interface ContextGridSegment {
  category: ContextGridCategory
  tokens: number
}

/** Half a cell (roughly 1k tokens), the smallest unit the grid renders. */
export interface ContextGridHalf {
  category: ContextGridCategory
  tokens: number
}

export interface ContextGridCell {
  left: ContextGridHalf
  right: ContextGridHalf
}

export interface ContextGrid {
  contextWindowTokens: number
  columns: number
  cellTokens: number
  /** True per-category totals, for the legend -- unaffected by the
   * small-category rounding the rendered `cells` apply. */
  segments: Array<ContextGridSegment>
  cells: Array<ContextGridCell>
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

function boundedCategoryTokens(
  request: TrafficRequestSummary,
): Record<Exclude<ContextGridCategory, "free">, number> | null {
  const contextWindowTokens = request.context.contextWindowTokens
  const tokens = request.tokens
  if (
    contextWindowTokens === null
    || contextWindowTokens <= 0
    || tokens === null
  )
    return null

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
  const claim = (amount: number): number => {
    const used = Math.max(0, Math.min(amount, budget))
    budget -= used
    return used
  }
  return {
    cached: claim(cachedTokens),
    created: claim(createdTokens),
    input: claim(inputTokens),
    output: claim(outputTokens),
    reserved: claim(reservedTokens),
  }
}

const FILL_ORDER = ["cached", "created", "input", "output", "reserved"] as const

/**
 * Groups the fill-order categories into visual chunks: a category with at
 * least a half-cell (`minTokens`) of its own becomes its own chunk; smaller
 * categories accumulate with whichever categories follow until they reach
 * roughly a half-cell, so a handful of tiny categories don't each demand
 * their own sliver. The chunk is tagged with its largest contributor for
 * coloring; this is a rendering approximation, not a precise accounting --
 * `segments` on the returned grid carries the true per-category totals.
 */
function chunkCategories(
  bounded: Record<Exclude<ContextGridCategory, "free">, number>,
  minTokens: number,
): Array<{ category: ContextGridCategory; tokens: number }> {
  const chunks: Array<{ category: ContextGridCategory; tokens: number }> = []
  let pending: Array<{ category: ContextGridCategory; tokens: number }> = []

  const flush = () => {
    if (pending.length === 0) return
    const tokens = pending.reduce((sum, entry) => sum + entry.tokens, 0)
    const dominant = pending.toSorted((a, b) => b.tokens - a.tokens)[0]
    if (dominant) chunks.push({ category: dominant.category, tokens })
    pending = []
  }

  for (const category of FILL_ORDER) {
    const tokens = bounded[category]
    if (tokens <= 0) continue
    pending.push({ category, tokens })
    const pendingTokens = pending.reduce((sum, entry) => sum + entry.tokens, 0)
    if (pendingTokens >= minTokens) flush()
  }
  flush()

  return chunks
}

/**
 * Splits a chunk's (possibly rounded-up) visual token weight into ~1k
 * halves, each carrying the chunk's category.
 */
function halvesFor(
  category: ContextGridCategory,
  visualTokens: number,
  halfTokens: number,
): Array<ContextGridHalf> {
  if (visualTokens <= 0) return []
  const count = Math.max(1, Math.round(visualTokens / halfTokens))
  const halves: Array<ContextGridHalf> = []
  let remaining = visualTokens
  for (let index = 0; index < count; index += 1) {
    const isLast = index === count - 1
    const tokens = isLast ? remaining : Math.round(visualTokens / count)
    halves.push({ category, tokens })
    remaining -= tokens
  }
  return halves
}

/**
 * Renders a turn's context window as a grid of fixed-size cells (each
 * `cellTokens`, split into two halves), filled in the order the window
 * actually fills. A category under half a cell is rounded up to roughly
 * half a cell -- and small adjacent categories are combined toward that
 * same half-cell -- so small pieces of data stay visible without the grid
 * trying to be precise about it. Two halves of the same category render as
 * one solid cell (even when they came from different turns' contributions
 * to a category that only grows over a session); two different categories
 * split a cell in half; a category that trails off mid-cell leaves the rest
 * of that cell to free space. Returns `null` when the turn does not report
 * enough token accounting to place it on the grid.
 */
export function deriveContextGrid({
  request,
  cellTokens = CONTEXT_GRID_CELL_TOKENS,
  columns = CONTEXT_GRID_COLUMNS,
}: {
  request: TrafficRequestSummary
  cellTokens?: number
  columns?: number
}): ContextGrid | null {
  const bounded = boundedCategoryTokens(request)
  const contextWindowTokens = request.context.contextWindowTokens
  if (bounded === null || contextWindowTokens === null || cellTokens <= 0)
    return null

  const halfTokens = cellTokens / 2
  const chunks = chunkCategories(bounded, halfTokens)
  const usedVisualTokens = chunks.reduce(
    (sum, chunk) => sum + Math.max(chunk.tokens, halfTokens),
    0,
  )
  const freeTokens = Math.max(0, contextWindowTokens - usedVisualTokens)

  const halves = [
    ...chunks.flatMap((chunk) =>
      halvesFor(chunk.category, Math.max(chunk.tokens, halfTokens), halfTokens),
    ),
    ...halvesFor("free", freeTokens, halfTokens),
  ]
  if (halves.length % 2 === 1) halves.push({ category: "free", tokens: 0 })

  const cells: Array<ContextGridCell> = []
  for (let index = 0; index < halves.length; index += 2) {
    const left = halves[index]
    const right = halves[index + 1]
    if (left && right) cells.push({ left, right })
  }

  const segments: Array<ContextGridSegment> = [
    ...FILL_ORDER.map((category): ContextGridSegment => ({
      category,
      tokens: bounded[category],
    })),
    {
      category: "free",
      tokens: Math.max(
        0,
        contextWindowTokens - Object.values(bounded).reduce((a, b) => a + b, 0),
      ),
    },
  ]

  return { contextWindowTokens, columns, cellTokens, segments, cells }
}

export interface TurnComposition {
  segments: Array<ContextGridSegment>
  totalTokens: number
}

/**
 * The token composition of a single turn's own request, unlike
 * `deriveContextGrid` which reports the cumulative window at that turn.
 * Scaled to itself (not to the context window), this stays legible for a
 * small turn that would otherwise barely register against a large window.
 */
export function deriveTurnComposition(
  request: TrafficRequestSummary,
): TurnComposition | null {
  const tokens = request.tokens
  if (tokens === null) return null

  const outputTokens = tokens.outputTokens
  const requestedMaxOutputTokens = request.context.requestedMaxOutputTokens
  const reservedTokens =
    requestedMaxOutputTokens === null ? 0 : (
      Math.max(0, requestedMaxOutputTokens - outputTokens)
    )

  const allSegments: Array<ContextGridSegment> = [
    { category: "cached", tokens: tokens.cacheReadInputTokens },
    { category: "created", tokens: tokens.cacheCreationInputTokens },
    { category: "input", tokens: tokens.inputTokens },
    { category: "output", tokens: outputTokens },
    { category: "reserved", tokens: reservedTokens },
  ]
  const segments = allSegments.filter((segment) => segment.tokens > 0)

  const totalTokens = segments.reduce((sum, segment) => sum + segment.tokens, 0)
  if (totalTokens <= 0) return null

  return { segments, totalTokens }
}

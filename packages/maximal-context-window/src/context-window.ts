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
 * The parts of a turn's *input* -- the full prompt sent to the model for
 * that turn -- that the visualization can place explicitly, in the order
 * they actually appear in the context window: the system prompt, tool
 * definitions, MCP server definitions, skill descriptions, the user-facing
 * conversation, and (when a source cannot attribute the rest) whatever is
 * left unclassified.
 *
 * These are content categories, not cache states: a system prompt is still
 * "system" whether or not it happened to be served from the prompt cache
 * this turn. See `ContextInputSegment.cachedTokens`.
 */
export type ContextContentCategory =
  "system" | "tools" | "mcp" | "skills" | "userInput" | "other"

/**
 * A grid cell's category: a content category (part of input), or one of
 * the non-input categories that describe the response side of the window
 * (`output`, the space still reserved for it) or the capacity left over
 * (`free`).
 */
export type ContextGridCategory =
  ContextContentCategory | "output" | "reserved" | "free"

/**
 * One piece of a turn's input. `tokens` is its total size and
 * `cachedTokens` is the subset of those tokens that were served from the
 * prompt cache rather than processed fresh this turn -- the rest is *new
 * content*, processed fresh. Cached content is not a separate category
 * with its own position in the window; it is an attribute of whichever
 * content it belongs to (typically the earlier, more stable parts of a
 * turn's input, such as the system prompt or older conversation history),
 * rendered as a texture rather than a color so a category's position stays
 * legible whether or not it happened to be cached this turn.
 */
export interface ContextInputSegment {
  category: ContextContentCategory
  tokens: number
  cachedTokens: number
}

/** A category's true, unrounded totals, for the legend. */
export interface ContextGridSegment {
  category: ContextGridCategory
  tokens: number
  cachedTokens: number
}

/** Half a cell (roughly 1k tokens), the smallest unit the grid renders. */
export interface ContextGridHalf {
  category: ContextGridCategory
  /** Whether this half falls within its category's cached span. Rendered
   * as a texture, never a color, so position stays legible either way. */
  cached: boolean
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

/**
 * Resolves a turn's input into content segments, in the order they should
 * fill the grid.
 *
 * The observability contract reports only whole-request token counters --
 * it does not break a request down by system prompt, MCP servers, skills,
 * or tool definitions the way Claude Code's `/context` does -- so when the
 * caller does not supply a breakdown, the entire input renders as a single,
 * honestly-labeled "other" segment rather than guessing at a split.
 *
 * When a caller does supply a breakdown (for example, fixture or lab data
 * standing in for a source that can attribute its own prompt), the given
 * segments are scaled to reconcile with the request's actually-reported
 * totals, so the legend and capacity summary remain accurate even if the
 * supplied breakdown does not add up exactly.
 */
function resolveInputSegments(
  request: TrafficRequestSummary,
  inputSegments: Array<ContextInputSegment> | undefined,
): Array<ContextInputSegment> {
  const tokens = request.tokens
  if (tokens === null) return []

  const cachedTotal = tokens.cacheReadInputTokens
  const newTotal = tokens.cacheCreationInputTokens + tokens.inputTokens
  const totalTokens = cachedTotal + newTotal

  if (inputSegments === undefined || inputSegments.length === 0) {
    return totalTokens > 0 ?
        [{ category: "other", tokens: totalTokens, cachedTokens: cachedTotal }]
      : []
  }
  return reconcileInputSegments(inputSegments, totalTokens, cachedTotal)
}

/** Scales a supplied breakdown so its totals match the request's actually
 * reported totals, preserving the relative shape the caller supplied. */
function reconcileInputSegments(
  segments: Array<ContextInputSegment>,
  totalTokens: number,
  cachedTotal: number,
): Array<ContextInputSegment> {
  const sumTokens = segments.reduce(
    (sum, segment) => sum + Math.max(0, segment.tokens),
    0,
  )
  if (sumTokens <= 0 || totalTokens <= 0) return []

  const sumCached = segments.reduce(
    (sum, segment) =>
      sum
      + Math.min(
        Math.max(0, segment.cachedTokens),
        Math.max(0, segment.tokens),
      ),
    0,
  )
  const tokenScale = totalTokens / sumTokens
  const cachedScale = sumCached > 0 ? cachedTotal / sumCached : 0

  return segments
    .map((segment): ContextInputSegment => {
      const scaledTokens = Math.max(0, segment.tokens) * tokenScale
      const scaledCached =
        sumCached > 0 ?
          Math.min(
            scaledTokens,
            Math.max(0, segment.cachedTokens) * cachedScale,
          )
        : 0
      return {
        category: segment.category,
        tokens: scaledTokens,
        cachedTokens: scaledCached,
      }
    })
    .filter((segment) => segment.tokens > 0)
}

/** An atomic (category, cache-state) piece of the window, already clamped
 * to the window's remaining budget and in fill order. */
interface ContextGridPiece {
  category: ContextGridCategory
  cached: boolean
  tokens: number
}

function boundedPieces(
  request: TrafficRequestSummary,
  inputSegments: Array<ContextInputSegment> | undefined,
): {
  pieces: Array<ContextGridPiece>
  segments: Array<ContextGridSegment>
} | null {
  const contextWindowTokens = request.context.contextWindowTokens
  const tokens = request.tokens
  if (
    contextWindowTokens === null
    || contextWindowTokens <= 0
    || tokens === null
  )
    return null

  const requestedMaxOutputTokens = request.context.requestedMaxOutputTokens
  const reservedTokens =
    requestedMaxOutputTokens === null ? 0 : (
      Math.max(0, requestedMaxOutputTokens - tokens.outputTokens)
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

  const pieces: Array<ContextGridPiece> = []
  const segments: Array<ContextGridSegment> = []

  for (const segment of resolveInputSegments(request, inputSegments)) {
    // Cached content is claimed first: it represents the earlier, already
    // -processed part of this content, with any newly processed content
    // for that same category following it.
    const cachedClaimed = claim(segment.cachedTokens)
    const newClaimed = claim(Math.max(0, segment.tokens - segment.cachedTokens))
    if (cachedClaimed > 0)
      pieces.push({
        category: segment.category,
        cached: true,
        tokens: cachedClaimed,
      })
    if (newClaimed > 0)
      pieces.push({
        category: segment.category,
        cached: false,
        tokens: newClaimed,
      })
    segments.push({
      category: segment.category,
      tokens: cachedClaimed + newClaimed,
      cachedTokens: cachedClaimed,
    })
  }

  const outputClaimed = claim(tokens.outputTokens)
  if (outputClaimed > 0)
    pieces.push({ category: "output", cached: false, tokens: outputClaimed })
  segments.push({ category: "output", tokens: outputClaimed, cachedTokens: 0 })

  const reservedClaimed = claim(reservedTokens)
  if (reservedClaimed > 0)
    pieces.push({
      category: "reserved",
      cached: false,
      tokens: reservedClaimed,
    })
  segments.push(
    {
      category: "reserved",
      tokens: reservedClaimed,
      cachedTokens: 0,
    },
    { category: "free", tokens: budget, cachedTokens: 0 },
  )

  return { pieces, segments }
}

/**
 * Groups fill-order pieces into visual chunks. Pieces of different
 * categories are never merged with each other, even when both are smaller
 * than a half-cell -- doing so would let a small category (a few hundred
 * tokens of skills, say) disappear entirely into whichever unrelated
 * category happened to be adjacent in fill order, rather than getting its
 * own (rounded-up) sliver. Within one category, consecutive pieces (a
 * cached/new split, typically) accumulate until they clear `minTokens`
 * (roughly a half-cell) before starting a new chunk, so a handful of tiny
 * same-category slivers don't each demand their own box; a piece that
 * already clears `minTokens` on its own still gets its own chunk, keeping
 * a real cached/new boundary visible rather than blending it away.
 */
function chunkPieces(
  pieces: Array<ContextGridPiece>,
  minTokens: number,
): Array<ContextGridPiece> {
  const chunks: Array<ContextGridPiece> = []
  let pending: Array<ContextGridPiece> = []

  const flushPending = () => {
    if (pending.length === 0) return
    const tokens = pending.reduce((sum, piece) => sum + piece.tokens, 0)
    const dominant = pending.toSorted((a, b) => b.tokens - a.tokens)[0]
    if (dominant)
      chunks.push({
        category: dominant.category,
        cached: dominant.cached,
        tokens,
      })
    pending = []
  }

  for (const piece of pieces) {
    if (piece.tokens <= 0) continue
    // A category change always starts a fresh chunk: never let one
    // category's leftover accumulation absorb a different category.
    if (pending.length > 0 && pending[0]?.category !== piece.category)
      flushPending()
    pending.push(piece)
    const pendingTokens = pending.reduce((sum, entry) => sum + entry.tokens, 0)
    if (pendingTokens >= minTokens) flushPending()
  }
  flushPending()

  return chunks
}

/**
 * Splits a chunk's (possibly rounded-up) visual token weight into ~1k
 * halves, each carrying the chunk's category and cache state. Rounds the
 * count *up* (not to the nearest whole half) so a category that clears a
 * half-cell's worth by any amount claims the next box rather than being
 * compressed into the same single box as a category half its size -- a
 * 1,400-token category should visibly take up more room than a 900-token
 * one, not read as the same one box.
 */
function halvesFor(
  piece: {
    category: ContextGridCategory
    cached: boolean
    visualTokens: number
  },
  halfTokens: number,
): Array<ContextGridHalf> {
  const { category, cached, visualTokens } = piece
  if (visualTokens <= 0) return []
  const count = Math.max(1, Math.ceil(visualTokens / halfTokens))
  const halves: Array<ContextGridHalf> = []
  let remaining = visualTokens
  for (let index = 0; index < count; index += 1) {
    const isLast = index === count - 1
    const tokens = isLast ? remaining : Math.round(visualTokens / count)
    halves.push({ category, cached, tokens })
    remaining -= tokens
  }
  return halves
}

/**
 * Renders a turn's context window as a grid of fixed-size cells (each
 * `cellTokens`, split into two halves), filled in the order the window
 * actually fills. A category under half a cell is rounded up to roughly
 * half a cell -- and small adjacent pieces are combined toward that same
 * half-cell -- so small pieces of data stay visible without the grid
 * trying to be precise about it. Two halves of the same category and cache
 * state render as one solid, untextured (or fully textured) cell; a
 * category that trails off mid-cell leaves the rest of that cell to free
 * space. Returns `null` when the turn does not report enough token
 * accounting to place it on the grid.
 *
 * `inputSegments`, when supplied, breaks the turn's input down into
 * explicit content categories (system, tools, MCP, skills, user input)
 * instead of the single undifferentiated "other" bucket used when a source
 * cannot attribute its own prompt.
 */
export function deriveContextGrid({
  request,
  cellTokens = CONTEXT_GRID_CELL_TOKENS,
  columns = CONTEXT_GRID_COLUMNS,
  inputSegments,
}: {
  request: TrafficRequestSummary
  cellTokens?: number
  columns?: number
  inputSegments?: Array<ContextInputSegment> | undefined
}): ContextGrid | null {
  const contextWindowTokens = request.context.contextWindowTokens
  if (
    contextWindowTokens === null
    || contextWindowTokens <= 0
    || cellTokens <= 0
  )
    return null

  const bounded = boundedPieces(request, inputSegments)
  if (bounded === null) return null

  const halfTokens = cellTokens / 2
  const chunks = chunkPieces(bounded.pieces, halfTokens)
  const usedVisualTokens = chunks.reduce(
    (sum, chunk) => sum + Math.max(chunk.tokens, halfTokens),
    0,
  )
  const freeTokens = Math.max(0, contextWindowTokens - usedVisualTokens)

  const halves = [
    ...chunks.flatMap((chunk) =>
      halvesFor(
        {
          category: chunk.category,
          cached: chunk.cached,
          visualTokens: Math.max(chunk.tokens, halfTokens),
        },
        halfTokens,
      ),
    ),
    ...halvesFor(
      { category: "free", cached: false, visualTokens: freeTokens },
      halfTokens,
    ),
  ]
  if (halves.length % 2 === 1)
    halves.push({ category: "free", cached: false, tokens: 0 })

  const cells: Array<ContextGridCell> = []
  for (let index = 0; index < halves.length; index += 2) {
    const left = halves[index]
    const right = halves[index + 1]
    if (left && right) cells.push({ left, right })
  }

  return {
    contextWindowTokens,
    columns,
    cellTokens,
    segments: bounded.segments,
    cells,
  }
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
 *
 * `inputSegments` breaks the turn's own input down the same way
 * `deriveContextGrid` does; see its documentation.
 */
export function deriveTurnComposition(
  request: TrafficRequestSummary,
  inputSegments?: Array<ContextInputSegment>,
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
    ...resolveInputSegments(request, inputSegments).map(
      (segment): ContextGridSegment => ({
        category: segment.category,
        tokens: segment.tokens,
        cachedTokens: segment.cachedTokens,
      }),
    ),
    { category: "output", tokens: outputTokens, cachedTokens: 0 },
    { category: "reserved", tokens: reservedTokens, cachedTokens: 0 },
  ]
  const segments = allSegments.filter((segment) => segment.tokens > 0)

  const totalTokens = segments.reduce((sum, segment) => sum + segment.tokens, 0)
  if (totalTokens <= 0) return null

  return { segments, totalTokens }
}

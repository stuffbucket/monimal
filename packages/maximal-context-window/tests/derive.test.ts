import { describe, expect, it } from "vitest"

import {
  deriveContextGrid,
  deriveContextSessions,
  deriveTurnComposition,
  type ContextInputSegment,
} from "../src/context-window.ts"
import { REQUEST, TOKENS } from "./fixtures.ts"

describe("session grouping", () => {
  it("groups turns by session id and ignores session-less requests", () => {
    const request = {
      ...REQUEST,
      identity: { ...REQUEST.identity, sessionId: "session-a" },
    }
    const sessionless = {
      ...REQUEST,
      identity: { ...REQUEST.identity, sessionId: null },
    }
    const sessions = deriveContextSessions([request, sessionless])
    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.id).toBe("session-a")
    expect(sessions[0]?.turns).toHaveLength(1)
  })

  it("sorts turns within a session by acceptance time", () => {
    const first = {
      ...REQUEST,
      identity: { ...REQUEST.identity, sessionId: "session-a" },
      timing: { ...REQUEST.timing, acceptedAt: "2026-09-07T20:01:00.000Z" },
    }
    const second = {
      ...REQUEST,
      identity: { ...REQUEST.identity, sessionId: "session-a" },
      timing: { ...REQUEST.timing, acceptedAt: "2026-09-07T20:00:00.000Z" },
    }
    const sessions = deriveContextSessions([first, second])
    expect(sessions[0]?.turns.map(({ timing }) => timing.acceptedAt)).toEqual([
      "2026-09-07T20:00:00.000Z",
      "2026-09-07T20:01:00.000Z",
    ])
  })
})

describe("deriveContextGrid", () => {
  it("returns null when the context window has no capacity", () => {
    const request = {
      ...REQUEST,
      context: { ...REQUEST.context, contextWindowTokens: 0 },
    }
    expect(deriveContextGrid({ request })).toBeNull()
  })

  it("returns null when token accounting is not available", () => {
    const request = { ...REQUEST, tokens: null }
    expect(deriveContextGrid({ request })).toBeNull()
  })

  it("falls back to a single, honestly undifferentiated 'other' category when no breakdown is supplied", () => {
    // The observability contract cannot attribute a request's prompt to a
    // system/tools/mcp/skills breakdown, so real traffic must not invent
    // one -- it renders as one "other" segment.
    const request = {
      ...REQUEST,
      tokens: {
        ...TOKENS,
        inputTokens: 4_000,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
      context: {
        ...REQUEST.context,
        contextWindowTokens: 4_000,
        requestedMaxOutputTokens: 0,
      },
    }
    const grid = deriveContextGrid({ request, cellTokens: 2_000 })
    expect(grid?.cells).toHaveLength(2)
    for (const cell of grid?.cells ?? []) {
      expect(cell.left.category).toBe("other")
      expect(cell.left.cached).toBe(false)
      expect(cell.right.category).toBe("other")
    }
  })

  it("splits a cell between input content and output at a fill boundary", () => {
    const request = {
      ...REQUEST,
      tokens: {
        ...TOKENS,
        inputTokens: 1_000,
        outputTokens: 1_000,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
      context: {
        ...REQUEST.context,
        contextWindowTokens: 2_000,
        requestedMaxOutputTokens: 1_000,
      },
    }
    const grid = deriveContextGrid({ request, cellTokens: 2_000 })
    expect(grid?.cells).toEqual([
      {
        left: { category: "other", cached: false, tokens: 1_000 },
        right: { category: "output", cached: false, tokens: 1_000 },
      },
    ])
  })

  it("rounds a sub-half-cell category up so it still renders as a half-filled cell", () => {
    const request = {
      ...REQUEST,
      tokens: {
        ...TOKENS,
        inputTokens: 200,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
      context: {
        ...REQUEST.context,
        contextWindowTokens: 100_000,
        requestedMaxOutputTokens: 0,
      },
    }
    const grid = deriveContextGrid({ request, cellTokens: 2_000 })
    expect(grid?.cells[0]).toEqual({
      left: { category: "other", cached: false, tokens: 1_000 },
      right: { category: "free", cached: false, tokens: 1_000 },
    })
    expect(
      grid?.segments.find((segment) => segment.category === "other")?.tokens,
    ).toBe(200)
  })

  it("places the cached portion of input before the newly processed portion, as one category rather than two", () => {
    // Cached content is an attribute of input, not a peer category with
    // its own position: the same "other" category should occupy both
    // halves of the fill, textured differently, not two separate colors.
    const request = {
      ...REQUEST,
      tokens: {
        ...TOKENS,
        cacheReadInputTokens: 1_000,
        cacheCreationInputTokens: 0,
        inputTokens: 1_000,
        outputTokens: 0,
      },
      context: {
        ...REQUEST.context,
        contextWindowTokens: 2_000,
        requestedMaxOutputTokens: 0,
      },
    }
    const grid = deriveContextGrid({ request, cellTokens: 2_000 })
    expect(grid?.cells).toEqual([
      {
        left: { category: "other", cached: true, tokens: 1_000 },
        right: { category: "other", cached: false, tokens: 1_000 },
      },
    ])
    const segment = grid?.segments.find((entry) => entry.category === "other")
    expect(segment?.tokens).toBe(2_000)
    expect(segment?.cachedTokens).toBe(1_000)
  })

  it("combines a tiny cached span with the new content that follows it into one visual chunk", () => {
    const request = {
      ...REQUEST,
      tokens: {
        ...TOKENS,
        cacheReadInputTokens: 300,
        cacheCreationInputTokens: 0,
        inputTokens: 450,
        outputTokens: 0,
      },
      context: {
        ...REQUEST.context,
        contextWindowTokens: 2_000,
        requestedMaxOutputTokens: 0,
      },
    }
    const grid = deriveContextGrid({ request, cellTokens: 2_000 })
    expect(grid?.cells).toHaveLength(1)
    // The chunk is tagged with its dominant (larger) contributor: the 450
    // new tokens outweigh the 300 cached tokens, so it renders uncached.
    expect(grid?.cells[0]?.left).toEqual({
      category: "other",
      cached: false,
      tokens: 1_000,
    })
    const segment = grid?.segments.find((entry) => entry.category === "other")
    expect(segment?.tokens).toBe(750)
    expect(segment?.cachedTokens).toBe(300)
  })

  it("never claims more tokens than remain in the context window", () => {
    const request = {
      ...REQUEST,
      tokens: {
        ...TOKENS,
        inputTokens: 90,
        outputTokens: 90,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
      context: {
        ...REQUEST.context,
        contextWindowTokens: 100,
        requestedMaxOutputTokens: 200,
      },
    }
    const grid = deriveContextGrid({ request, cellTokens: 20 })
    const total =
      grid?.segments.reduce((sum, segment) => sum + segment.tokens, 0) ?? -1
    expect(total).toBe(100)
  })
})

describe("deriveContextGrid: explicit input segments", () => {
  it("places explicit content segments (system, tools, mcp, skills, user input) in the order supplied", () => {
    const inputSegments: Array<ContextInputSegment> = [
      { category: "system", tokens: 500, cachedTokens: 500 },
      { category: "tools", tokens: 500, cachedTokens: 500 },
      { category: "mcp", tokens: 500, cachedTokens: 500 },
      { category: "skills", tokens: 500, cachedTokens: 0 },
      { category: "userInput", tokens: 1_000, cachedTokens: 0 },
    ]
    const request = {
      ...REQUEST,
      tokens: {
        ...TOKENS,
        cacheReadInputTokens: 1_500,
        cacheCreationInputTokens: 0,
        inputTokens: 1_500,
        outputTokens: 0,
      },
      context: {
        ...REQUEST.context,
        contextWindowTokens: 3_000,
        requestedMaxOutputTokens: 0,
      },
    }
    const grid = deriveContextGrid({
      request,
      cellTokens: 1_000,
      inputSegments,
    })
    expect(
      grid?.segments.map(({ category, tokens, cachedTokens }) => ({
        category,
        tokens,
        cachedTokens,
      })),
    ).toEqual([
      { category: "system", tokens: 500, cachedTokens: 500 },
      { category: "tools", tokens: 500, cachedTokens: 500 },
      { category: "mcp", tokens: 500, cachedTokens: 500 },
      { category: "skills", tokens: 500, cachedTokens: 0 },
      { category: "userInput", tokens: 1_000, cachedTokens: 0 },
      { category: "output", tokens: 0, cachedTokens: 0 },
      { category: "reserved", tokens: 0, cachedTokens: 0 },
      { category: "free", tokens: 0, cachedTokens: 0 },
    ])
    // system/tools/mcp are fully cached and fill their own half-cells first.
    expect(grid?.cells.slice(0, 3)).toEqual([
      {
        left: { category: "system", cached: true, tokens: 500 },
        right: { category: "tools", cached: true, tokens: 500 },
      },
      {
        left: { category: "mcp", cached: true, tokens: 500 },
        right: { category: "skills", cached: false, tokens: 500 },
      },
      {
        left: { category: "userInput", cached: false, tokens: 500 },
        right: { category: "userInput", cached: false, tokens: 500 },
      },
    ])
  })

  it("keeps two adjacent small categories separately visible rather than merging one into the other", () => {
    // mcp (700) and skills (500) each fall short of a half-cell (1,000) on
    // their own, but merging them together -- as chunking-by-threshold
    // alone would -- makes skills disappear into mcp's category entirely.
    // Each must round up and render on its own instead.
    const inputSegments: Array<ContextInputSegment> = [
      { category: "mcp", tokens: 700, cachedTokens: 700 },
      { category: "skills", tokens: 500, cachedTokens: 500 },
      { category: "userInput", tokens: 800, cachedTokens: 0 },
    ]
    const request = {
      ...REQUEST,
      tokens: {
        ...TOKENS,
        cacheReadInputTokens: 1_200,
        cacheCreationInputTokens: 0,
        inputTokens: 1_200,
        outputTokens: 0,
      },
      context: {
        ...REQUEST.context,
        contextWindowTokens: 2_000,
        requestedMaxOutputTokens: 0,
      },
    }
    const grid = deriveContextGrid({
      request,
      cellTokens: 2_000,
      inputSegments,
    })
    expect(grid?.cells).toEqual([
      {
        left: { category: "mcp", cached: true, tokens: 1_000 },
        right: { category: "skills", cached: true, tokens: 1_000 },
      },
      {
        left: { category: "userInput", cached: false, tokens: 1_000 },
        right: { category: "free", cached: false, tokens: 0 },
      },
    ])
  })

  it("gives a category more than one box once it clears more than one half-cell's worth", () => {
    // 1,400 tokens is 1.4 half-cells (1,000 each, the default cell's
    // half-width); rounding to the nearest whole half would compress it
    // into the same single box as a 900-token category, so it must round
    // up to two boxes instead.
    const inputSegments: Array<ContextInputSegment> = [
      { category: "tools", tokens: 1_400, cachedTokens: 1_400 },
      { category: "userInput", tokens: 600, cachedTokens: 0 },
    ]
    const request = {
      ...REQUEST,
      tokens: {
        ...TOKENS,
        cacheReadInputTokens: 1_400,
        cacheCreationInputTokens: 0,
        inputTokens: 600,
        outputTokens: 0,
      },
      context: {
        ...REQUEST.context,
        contextWindowTokens: 2_000,
        requestedMaxOutputTokens: 0,
      },
    }
    const grid = deriveContextGrid({
      request,
      inputSegments,
    })
    expect(grid?.cells).toEqual([
      {
        left: { category: "tools", cached: true, tokens: 700 },
        right: { category: "tools", cached: true, tokens: 700 },
      },
      {
        left: { category: "userInput", cached: false, tokens: 1_000 },
        right: { category: "free", cached: false, tokens: 0 },
      },
    ])
  })

  it("scales a supplied breakdown to reconcile with the request's actually reported totals", () => {
    const inputSegments: Array<ContextInputSegment> = [
      { category: "system", tokens: 1, cachedTokens: 1 },
      { category: "userInput", tokens: 1, cachedTokens: 0 },
    ]
    const request = {
      ...REQUEST,
      tokens: {
        ...TOKENS,
        cacheReadInputTokens: 1_000,
        cacheCreationInputTokens: 0,
        inputTokens: 1_000,
        outputTokens: 0,
      },
      context: {
        ...REQUEST.context,
        contextWindowTokens: 2_000,
        requestedMaxOutputTokens: 0,
      },
    }
    const grid = deriveContextGrid({
      request,
      cellTokens: 2_000,
      inputSegments,
    })
    const system = grid?.segments.find(
      (segment) => segment.category === "system",
    )
    const userInput = grid?.segments.find(
      (segment) => segment.category === "userInput",
    )
    expect(system?.tokens).toBe(1_000)
    expect(system?.cachedTokens).toBe(1_000)
    expect(userInput?.tokens).toBe(1_000)
    expect(userInput?.cachedTokens).toBe(0)
  })
})

describe("this turn's own composition", () => {
  it("returns the non-cumulative breakdown for a single turn, with cached content as an attribute of input", () => {
    const request = {
      ...REQUEST,
      tokens: {
        ...TOKENS,
        cacheReadInputTokens: 20,
        cacheCreationInputTokens: 10,
        inputTokens: 90,
        outputTokens: 80,
      },
      context: {
        ...REQUEST.context,
        requestedMaxOutputTokens: 100,
      },
    }
    const composition = deriveTurnComposition(request)
    expect(composition?.totalTokens).toBe(220)
    expect(composition?.segments).toEqual([
      { category: "other", tokens: 120, cachedTokens: 20 },
      { category: "output", tokens: 80, cachedTokens: 0 },
      { category: "reserved", tokens: 20, cachedTokens: 0 },
    ])
  })

  it("omits categories with no tokens", () => {
    const request = {
      ...REQUEST,
      tokens: {
        ...TOKENS,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        inputTokens: 50,
        outputTokens: 50,
      },
      context: {
        ...REQUEST.context,
        requestedMaxOutputTokens: 50,
      },
    }
    const composition = deriveTurnComposition(request)
    expect(composition?.segments).toEqual([
      { category: "other", tokens: 50, cachedTokens: 0 },
      { category: "output", tokens: 50, cachedTokens: 0 },
    ])
  })

  it("returns null when token accounting is not available", () => {
    const request = { ...REQUEST, tokens: null }
    expect(deriveTurnComposition(request)).toBeNull()
  })

  it("uses a supplied breakdown to name the turn's own content segments", () => {
    const inputSegments: Array<ContextInputSegment> = [
      { category: "system", tokens: 30, cachedTokens: 30 },
      { category: "userInput", tokens: 90, cachedTokens: 0 },
    ]
    const request = {
      ...REQUEST,
      tokens: {
        ...TOKENS,
        cacheReadInputTokens: 30,
        cacheCreationInputTokens: 0,
        inputTokens: 90,
        outputTokens: 80,
      },
      context: {
        ...REQUEST.context,
        requestedMaxOutputTokens: 80,
      },
    }
    const composition = deriveTurnComposition(request, inputSegments)
    expect(composition?.segments).toEqual([
      { category: "system", tokens: 30, cachedTokens: 30 },
      { category: "userInput", tokens: 90, cachedTokens: 0 },
      { category: "output", tokens: 80, cachedTokens: 0 },
    ])
  })
})

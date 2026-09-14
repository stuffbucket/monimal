import { describe, expect, it } from "vitest"

import {
  deriveContextGrid,
  deriveContextSessions,
  deriveTurnComposition,
} from "../src/context-window.ts"
import { REQUEST, TOKENS } from "./fixtures.ts"

describe("context window derivation", () => {
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

  it("fills two whole cells solid when a single category spans them", () => {
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
    const grid = deriveContextGrid({
      request,
      cellTokens: 2_000,
    })
    expect(grid?.cells).toHaveLength(2)
    for (const cell of grid?.cells ?? []) {
      expect(cell.left.category).toBe("input")
      expect(cell.right.category).toBe("input")
    }
  })

  it("splits a cell between two categories at a fill boundary", () => {
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
    const grid = deriveContextGrid({
      request,
      cellTokens: 2_000,
    })
    expect(grid?.cells).toEqual([
      {
        left: { category: "input", tokens: 1_000 },
        right: { category: "output", tokens: 1_000 },
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
    const grid = deriveContextGrid({
      request,
      cellTokens: 2_000,
    })
    expect(grid?.cells[0]).toEqual({
      left: { category: "input", tokens: 1_000 },
      right: { category: "free", tokens: 1_000 },
    })
    expect(
      grid?.segments.find((segment) => segment.category === "input")?.tokens,
    ).toBe(200)
  })

  it("combines several tiny categories toward one visual chunk instead of one sliver each", () => {
    const request = {
      ...REQUEST,
      tokens: {
        ...TOKENS,
        cacheReadInputTokens: 400,
        cacheCreationInputTokens: 300,
        inputTokens: 350,
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
    })
    expect(grid?.cells).toHaveLength(1)
    expect(grid?.cells[0]?.left.category).toBe("cached")
    expect(
      grid?.segments.find((segment) => segment.category === "cached")?.tokens,
    ).toBe(400)
    expect(
      grid?.segments.find((segment) => segment.category === "created")?.tokens,
    ).toBe(300)
    expect(
      grid?.segments.find((segment) => segment.category === "input")?.tokens,
    ).toBe(350)
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
    const grid = deriveContextGrid({
      request,
      cellTokens: 20,
    })
    const total =
      grid?.segments.reduce((sum, segment) => sum + segment.tokens, 0) ?? -1
    expect(total).toBe(100)
  })
})

describe("this turn's own composition", () => {
  it("returns the non-cumulative breakdown for a single turn", () => {
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
      { category: "cached", tokens: 20 },
      { category: "created", tokens: 10 },
      { category: "input", tokens: 90 },
      { category: "output", tokens: 80 },
      { category: "reserved", tokens: 20 },
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
      { category: "input", tokens: 50 },
      { category: "output", tokens: 50 },
    ])
  })

  it("returns null when token accounting is not available", () => {
    const request = { ...REQUEST, tokens: null }
    expect(deriveTurnComposition(request)).toBeNull()
  })
})

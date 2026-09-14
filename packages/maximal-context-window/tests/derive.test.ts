import { describe, expect, it } from "vitest"

import {
  deriveContextGrid,
  deriveContextSessions,
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

  it("bounds cell counts to the requested cell count", () => {
    const request = {
      ...REQUEST,
      tokens: {
        ...TOKENS,
        inputTokens: 90,
        outputTokens: 8,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
      context: {
        ...REQUEST.context,
        contextWindowTokens: 100,
        requestedMaxOutputTokens: 8,
      },
    }
    expect(deriveContextGrid({ request, cellCount: 10 })).toEqual({
      contextWindowTokens: 100,
      segments: [
        { category: "cached", tokens: 0, cells: 0 },
        { category: "created", tokens: 0, cells: 0 },
        { category: "input", tokens: 90, cells: 9 },
        { category: "output", tokens: 8, cells: 1 },
        { category: "reserved", tokens: 0, cells: 0 },
        { category: "free", tokens: 2, cells: 0 },
      ],
    })
  })

  it("guarantees a non-zero cell for any positive token count", () => {
    const request = {
      ...REQUEST,
      tokens: {
        ...TOKENS,
        inputTokens: 1,
        outputTokens: 1,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
      context: {
        ...REQUEST.context,
        contextWindowTokens: 1_000,
        requestedMaxOutputTokens: 1,
      },
    }
    expect(deriveContextGrid({ request, cellCount: 10 })).toEqual({
      contextWindowTokens: 1_000,
      segments: [
        { category: "cached", tokens: 0, cells: 0 },
        { category: "created", tokens: 0, cells: 0 },
        { category: "input", tokens: 1, cells: 1 },
        { category: "output", tokens: 1, cells: 1 },
        { category: "reserved", tokens: 0, cells: 0 },
        { category: "free", tokens: 998, cells: 8 },
      ],
    })
  })

  it("accounts for the unused portion of the requested output budget as reserved", () => {
    const request = {
      ...REQUEST,
      tokens: {
        ...TOKENS,
        inputTokens: 0,
        outputTokens: 10,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
      context: {
        ...REQUEST.context,
        contextWindowTokens: 100,
        requestedMaxOutputTokens: 40,
      },
    }
    const grid = deriveContextGrid({ request, cellCount: 10 })
    expect(
      grid?.segments.find((segment) => segment.category === "reserved"),
    ).toEqual({ category: "reserved", tokens: 30, cells: 3 })
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
    const grid = deriveContextGrid({ request, cellCount: 10 })
    const total =
      grid?.segments.reduce((sum, segment) => sum + segment.tokens, 0) ?? -1
    expect(total).toBe(100)
    const totalCells =
      grid?.segments.reduce((sum, segment) => sum + segment.cells, 0) ?? -1
    expect(totalCells).toBe(10)
  })

  it("returns null when the context window has no capacity", () => {
    const request = {
      ...REQUEST,
      context: { ...REQUEST.context, contextWindowTokens: 0 },
    }
    expect(deriveContextGrid({ request, cellCount: 10 })).toBeNull()
  })

  it("returns null when token accounting is not available", () => {
    const request = { ...REQUEST, tokens: null }
    expect(deriveContextGrid({ request })).toBeNull()
  })
})

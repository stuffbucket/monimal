import { describe, expect, it } from "vitest"

import {
  deriveContextCells,
  deriveContextSessions,
} from "../src/context-window.ts"
import { REQUEST } from "./fixtures.ts"

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
    expect(
      deriveContextCells({
        inputTokens: 90,
        outputTokens: 10,
        contextWindowTokens: 100,
        cellCount: 10,
      }),
    ).toEqual({ input: 9, output: 1, available: 0 })
  })

  it("guarantees a non-zero cell for any positive token count", () => {
    expect(
      deriveContextCells({
        inputTokens: 1,
        outputTokens: 1,
        contextWindowTokens: 1_000,
        cellCount: 10,
      }),
    ).toEqual({ input: 1, output: 1, available: 8 })
  })

  it("returns null when the context window has no capacity", () => {
    expect(
      deriveContextCells({
        inputTokens: 1,
        outputTokens: 1,
        contextWindowTokens: 0,
        cellCount: 10,
      }),
    ).toBeNull()
  })
})

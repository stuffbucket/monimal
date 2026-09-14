import axe from "axe-core"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { deriveContextSessions } from "../src/context-window.ts"
import { ContextWindowSessionPanel } from "../src/ContextWindowSessionPanel.tsx"
import { REQUEST, TOKENS } from "./fixtures.ts"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  container.className = "sb-shell"
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (element) => element.textContent.trim() === label,
  )
  if (!(found instanceof HTMLButtonElement))
    throw new Error(`Button not found: ${label}`)
  return found
}

describe("ContextWindowSessionPanel", () => {
  it("renders the session picker, compact capacity summary, and colored grid accessibly", () => {
    const [session] = deriveContextSessions([REQUEST])
    if (!session) throw new Error("Fixture session missing")

    act(() =>
      root.render(
        <ContextWindowSessionPanel
          session={session}
          sessionIds={[session.id]}
          onSelectSession={() => undefined}
        />,
      ),
    )

    expect(container.textContent).toContain("session-1")
    expect(container.textContent).toContain("claude-sonnet")
    expect(container.textContent).toContain("2.1% full")
    expect(
      container.querySelector(".mcw-capacity-bar")?.getAttribute("aria-label"),
    ).toContain("2.1% full")
    expect(
      container.querySelector(".mcw-grid")?.getAttribute("aria-label"),
    ).toContain("Input: 90 tokens")
    expect(
      container
        .querySelector(".mcw-turn-bar-track")
        ?.getAttribute("aria-label"),
    ).toContain("Input: 90 tokens")
  })

  it("switches the displayed turn when a turn picker button is pressed", () => {
    const earlier = {
      ...REQUEST,
      identity: { ...REQUEST.identity, requestId: "req-0" },
      timing: { ...REQUEST.timing, acceptedAt: "2026-09-07T19:00:00.000Z" },
      tokens: { ...TOKENS, inputTokens: 5 },
    }
    const [session] = deriveContextSessions([earlier, REQUEST])
    if (!session) throw new Error("Fixture session missing")

    act(() =>
      root.render(
        <ContextWindowSessionPanel
          session={session}
          sessionIds={[session.id]}
          onSelectSession={() => undefined}
        />,
      ),
    )

    // Defaults to the latest turn.
    expect(
      container.querySelector(".mcw-grid")?.getAttribute("aria-label"),
    ).toContain("Input: 90 tokens")
    expect(button("Turn 1").getAttribute("aria-pressed")).toBe("false")
    expect(button("Turn 2").getAttribute("aria-pressed")).toBe("true")

    act(() => button("Turn 1").click())
    expect(button("Turn 1").getAttribute("aria-pressed")).toBe("true")
    expect(
      container.querySelector(".mcw-grid")?.getAttribute("aria-label"),
    ).toContain("Input: 5 tokens")
  })

  it("passes axe with no violations", async () => {
    const [session] = deriveContextSessions([REQUEST])
    if (!session) throw new Error("Fixture session missing")

    act(() =>
      root.render(
        <ContextWindowSessionPanel
          session={session}
          sessionIds={[session.id]}
          onSelectSession={() => undefined}
        />,
      ),
    )

    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    })
    expect(results.violations.map(({ id }) => id)).toEqual([])
  })
})

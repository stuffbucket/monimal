import axe from "axe-core"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { deriveContextSessions } from "../src/context-window.ts"
import { ContextWindowSessionPanel } from "../src/ContextWindowSessionPanel.tsx"
import { REQUEST } from "./fixtures.ts"

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

describe("ContextWindowSessionPanel", () => {
  it("renders the session picker, fields, and ASCII cell map accessibly", () => {
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
    expect(container.textContent).toContain("0.1%")
    expect(
      container.querySelector(".mcw-cells")?.getAttribute("aria-label"),
    ).toContain("120 input tokens")
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

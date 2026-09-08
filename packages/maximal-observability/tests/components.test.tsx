import axe from "axe-core"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { ObservabilitySource } from "../src/source.ts"

import {
  ObservabilityProvider,
  OverviewInspector,
  OverviewMain,
  OverviewRail,
  OverviewStatus,
  TrafficExplorerInspector,
  TrafficExplorerMain,
  TrafficExplorerStatus,
} from "../src/index.ts"
import { FakeSource } from "./fixtures.ts"
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

async function settle() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

const unsubscribe = () => undefined

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (element) => element.textContent.trim() === label,
  )
  if (!(found instanceof HTMLButtonElement))
    throw new Error(`Button not found: ${label}`)
  return found
}

describe("observability components", () => {
  it("renders composable slots, switches measure, selects metadata, and passes axe", async () => {
    const source = new FakeSource()
    act(() =>
      root.render(
        <ObservabilityProvider
          source={source}
          now={() => new Date("2026-09-07T20:01:00.000Z")}
        >
          <OverviewRail />
          <OverviewMain />
          <OverviewInspector />
          <OverviewStatus />
        </ObservabilityProvider>,
      ),
    )
    await settle()

    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(container.textContent).toContain("Traffic flow")
    expect(container.textContent).toContain("Token volume")
    expect(source.overviewReads).toBe(1)
    expect(source.requestReads).toBe(1)

    act(() => button("Tokens").click())
    expect(button("Tokens").getAttribute("aria-pressed")).toBe("true")
    const overviewResults = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    })
    expect(overviewResults.violations.map(({ id }) => id)).toEqual([])

    act(() =>
      root.render(
        <ObservabilityProvider
          source={source}
          now={() => new Date("2026-09-07T20:01:00.000Z")}
        >
          <TrafficExplorerMain />
          <TrafficExplorerInspector />
          <TrafficExplorerStatus />
        </ObservabilityProvider>,
      ),
    )
    act(() => button("req-1").click())
    await settle()
    expect(source.detailReads).toBe(1)
    expect(container.textContent).toContain("trace-1")
    expect(container.textContent).toContain("Lifecycle")
    const explorerResults = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    })
    expect(explorerResults.violations.map(({ id }) => id)).toEqual([])
  })

  it("pauses live invalidation and exposes unsupported states", async () => {
    const source = new FakeSource()
    act(() =>
      root.render(
        <ObservabilityProvider
          source={source}
          now={() => new Date("2026-09-07T20:01:00.000Z")}
        >
          <OverviewRail />
          <OverviewMain />
        </ObservabilityProvider>,
      ),
    )
    await settle()
    const liveSwitch = container.querySelector('[role="switch"]')
    if (!(liveSwitch instanceof HTMLButtonElement))
      throw new Error("Live switch not found")
    act(() => liveSwitch.click())
    source.invalidate({
      contractVersion: 1,
      revision: 1,
      emittedAt: "2026-09-07T20:02:00.000Z",
      activeCount: 0,
      overflow: false,
      scopes: ["overview"],
      requestIds: [],
    })
    await settle()
    expect(source.overviewReads).toBe(1)

    const unsupported: ObservabilitySource = {
      readOverview: () =>
        Promise.resolve({
          status: "unsupported",
          message: "Upgrade the traffic service.",
        }),
      readRequests: () =>
        Promise.resolve({
          status: "unsupported",
          message: "Upgrade the traffic service.",
        }),
      readRequestDetail: () =>
        Promise.resolve({
          status: "unsupported",
          message: "Upgrade the traffic service.",
        }),
      subscribeTrafficInvalidation: () => unsubscribe,
    }
    act(() =>
      root.render(
        <ObservabilityProvider source={unsupported}>
          <OverviewMain />
        </ObservabilityProvider>,
      ),
    )
    await settle()
    expect(container.textContent).toContain("Observability is not supported.")
  })

  it("can render against a fake source without a browser global", () => {
    const source = new FakeSource()
    const html = renderToString(
      <ObservabilityProvider source={source}>
        <OverviewStatus />
      </ObservabilityProvider>,
    )
    expect(html).toContain("Live")
    expect(source.overviewReads).toBe(0)
  })
})

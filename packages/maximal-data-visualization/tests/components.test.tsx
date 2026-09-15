import axe from "axe-core"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  DataVizLegend,
  DataVizMeter,
  DataVizSegmentedControl,
} from "../src/index.ts"

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe("data visualization primitives", () => {
  it("composes controls, legends, and meters accessibly", async () => {
    let selected = "requests"
    act(() =>
      root.render(
        <>
          <DataVizSegmentedControl
            ariaLabel="Measure"
            value={selected}
            options={[
              { value: "requests", label: "Requests" },
              { value: "tokens", label: "Tokens" },
            ]}
            onChange={(value) => {
              selected = value
            }}
          />
          <DataVizLegend
            ariaLabel="Series"
            items={[
              {
                id: "input",
                label: "Input",
                swatch: <span data-testid="input-swatch" />,
                value: "12",
              },
            ]}
          />
          <DataVizMeter ariaLabel="75 percent full" percent={75} />
        </>,
      ),
    )

    const tokens = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Tokens",
    )
    act(() => tokens?.click())
    expect(selected).toBe("tokens")
    expect(
      container.querySelector(".data-viz-meter")?.getAttribute("aria-label"),
    ).toBe("75 percent full")
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    })
    expect(results.violations.map(({ id }) => id)).toEqual([])
  })
})

import { afterEach, describe, expect, it } from "vitest"

import {
  installReactComponentInspector,
  type ReactFiber,
} from "../src/client.js"

const TARGET_ATTRIBUTE = "data-maximal-react-component-target"

afterEach(() => {
  document.head.replaceChildren()
  document.body.replaceChildren()
})

describe("React component inspector SVG targets", () => {
  it("inspects an SVG path through its owning HTML control", () => {
    const button = document.createElement("button")
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
    icon.append(path)
    button.append(icon)
    document.body.append(button)

    const owner: ReactFiber = {
      type: { displayName: "IconButton" },
      _debugSource: {
        fileName: "/workspace/src/IconButton.tsx",
        lineNumber: 8,
        columnNumber: 5,
      },
    }
    const pathFiber: ReactFiber = {
      type: "path",
      _debugOwner: owner,
      _debugSource: {
        fileName: "/workspace/src/Icon.tsx",
        lineNumber: 12,
        columnNumber: 7,
      },
    }
    Object.defineProperty(path, "__reactFiber$oracle", {
      enumerable: true,
      value: pathFiber,
    })

    const dispose = installReactComponentInspector({
      root: "/workspace",
      base: "/",
    })
    globalThis.window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Alt" }),
    )
    path.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))
    expect(button.getAttribute(TARGET_ATTRIBUTE)).toBe("")

    path.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
      }),
    )

    const card = document.querySelector<HTMLElement>(
      "#maximal-react-component-card",
    )
    expect(card?.textContent).toContain("IconButton")
    expect(card?.textContent).toContain("src/IconButton.tsx:8:5")
    expect(button.getAttribute(TARGET_ATTRIBUTE)).toBe("")
    globalThis.window.dispatchEvent(new KeyboardEvent("keyup", { key: "Alt" }))
    dispose()
  })
})

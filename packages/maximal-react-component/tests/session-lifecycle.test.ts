import { afterEach, describe, expect, it } from "vitest"

import {
  installReactComponentInspector,
  type ReactFiber,
} from "../src/client.js"

const TARGET_ATTRIBUTE = "data-maximal-react-component-target"

function targetWithFiber(): HTMLButtonElement {
  const target = document.createElement("button")
  const fiber: ReactFiber = {
    type: "button",
    _debugSource: {
      fileName: "/workspace/src/Button.tsx",
      lineNumber: 4,
      columnNumber: 3,
    },
  }
  Object.defineProperty(target, "__reactFiber$oracle", {
    enumerable: true,
    value: fiber,
  })
  document.body.append(target)
  return target
}

function activate(target: HTMLElement): void {
  target.dispatchEvent(
    new MouseEvent("contextmenu", {
      altKey: true,
      bubbles: true,
      cancelable: true,
    }),
  )
}

afterEach(() => {
  globalThis.window.__MAXIMAL_REACT_COMPONENT_INSPECTOR_DISPOSE__?.()
  document.body.replaceChildren()
})

describe("React component inspector session lifecycle", () => {
  it("replaces an existing injected session instead of stacking listeners", () => {
    const target = targetWithFiber()
    const firstDispose = installReactComponentInspector({
      root: "/workspace",
      base: "/",
    })
    installReactComponentInspector({ root: "/workspace", base: "/" })

    activate(target)

    expect(
      document.querySelectorAll("#maximal-react-component-card"),
    ).toHaveLength(1)
    firstDispose()
    expect(
      document.querySelector("#maximal-react-component-card"),
    ).not.toBeNull()
  })

  it("recovers when an external DOM change detaches the active card", () => {
    const target = targetWithFiber()
    installReactComponentInspector({ root: "/workspace", base: "/" })
    activate(target)
    document.querySelector("#maximal-react-component-card")?.remove()

    target.dispatchEvent(
      new MouseEvent("mousemove", { altKey: true, bubbles: true }),
    )
    expect(target.getAttribute(TARGET_ATTRIBUTE)).toBe("")
    activate(target)
    expect(
      document.querySelector("#maximal-react-component-card"),
    ).not.toBeNull()
  })
})

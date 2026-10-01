import { afterEach, describe, expect, it, vi } from "vitest"

import { installCardGeometry } from "../src/card-geometry.js"

function mouse(
  target: EventTarget,
  type: "mousedown" | "mousemove" | "mouseup",
  position: { x: number; y: number },
): void {
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      clientX: position.x,
      clientY: position.y,
    }),
  )
}

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe("inspector card geometry", () => {
  it("drags from non-interactive surfaces and clamps to the viewport", () => {
    const card = document.createElement("section")
    const button = document.createElement("button")
    card.append(button)
    document.body.append(card)
    card.getBoundingClientRect = () =>
      ({
        height: 120,
        left: 100,
        top: 80,
        width: 300,
      }) as DOMRect
    Object.defineProperties(card, {
      offsetHeight: { configurable: true, value: 120 },
      offsetWidth: { configurable: true, value: 300 },
    })
    const onExpandedChange = vi.fn()
    const dispose = installCardGeometry({
      card,
      onExpandedChange,
      window: globalThis.window,
    })

    mouse(button, "mousedown", { x: 100, y: 80 })
    mouse(globalThis.window, "mousemove", { x: 140, y: 120 })
    expect(card.dataset["interacting"]).toBeUndefined()

    card.style.right = "20px"
    card.style.bottom = "30px"
    const dragStart = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 80,
    })
    card.dispatchEvent(dragStart)
    expect(dragStart.defaultPrevented).toBe(true)
    expect(card.style.left).toBe("100px")
    expect(card.style.top).toBe("80px")
    expect(card.style.right).toBe("")
    expect(card.style.bottom).toBe("")
    mouse(globalThis.window, "mousemove", { x: -1000, y: -1000 })
    expect(card.dataset["interacting"]).toBe("drag")
    expect(card.style.left).toBe("16px")
    expect(card.style.top).toBe("16px")
    mouse(globalThis.window, "mousemove", { x: 2000, y: 2000 })
    expect(card.style.left).toBe("708px")
    expect(card.style.top).toBe("632px")
    mouse(globalThis.window, "mouseup", { x: 0, y: 0 })
    expect(card.dataset["interacting"]).toBeUndefined()
    expect(onExpandedChange).toHaveBeenLastCalledWith(false)

    dispose()
    card.style.left = ""
    mouse(card, "mousedown", { x: 100, y: 80 })
    mouse(globalThis.window, "mousemove", { x: 200, y: 180 })
    expect(card.style.left).toBe("")
  })

  it("expands from either resize edge and preserves the opposite edge", () => {
    const card = document.createElement("section")
    const top = document.createElement("div")
    top.dataset["resizeEdge"] = "top"
    const bottom = document.createElement("div")
    bottom.dataset["resizeEdge"] = "bottom"
    card.append(top, bottom)
    document.body.append(card)
    card.getBoundingClientRect = () => {
      const height = Number.parseFloat(card.style.height) || 120
      const top = Number.parseFloat(card.style.top) || 300
      return {
        bottom: top + height,
        height,
        left: 100,
        top,
        width: 300,
      } as DOMRect
    }
    const onExpandedChange = vi.fn()
    const dispose = installCardGeometry({
      card,
      onExpandedChange,
      window: globalThis.window,
    })

    mouse(bottom, "mousedown", { x: 100, y: 420 })
    mouse(globalThis.window, "mousemove", { x: 100, y: 540 })
    expect(card.style.height).toBe("240px")
    expect(card.style.getPropertyPriority("height")).toBe("important")
    expect(onExpandedChange).toHaveBeenLastCalledWith(true)
    mouse(globalThis.window, "mouseup", { x: 100, y: 540 })
    expect(card.style.height).toBe("")

    mouse(top, "mousedown", { x: 100, y: 300 })
    mouse(globalThis.window, "mousemove", { x: 100, y: 100 })
    expect(card.style.height).toBe("320px")
    expect(card.style.top).toBe("100px")
    mouse(globalThis.window, "mouseup", { x: 100, y: 100 })
    expect(card.style.top).toBe("300px")

    mouse(bottom, "mousedown", { x: 100, y: 420 })
    mouse(globalThis.window, "mousemove", { x: 100, y: 2000 })
    expect(card.style.height).toBe("736px")
    dispose()
  })

  it("resizes horizontally from either side and retains the chosen width", () => {
    const card = document.createElement("section")
    const left = document.createElement("div")
    left.dataset["resizeEdge"] = "left"
    const right = document.createElement("div")
    right.dataset["resizeEdge"] = "right"
    card.append(left, right)
    document.body.append(card)
    card.getBoundingClientRect = () =>
      ({
        height: 120,
        left: 100,
        top: 80,
        width: 300,
      }) as DOMRect
    const onExpandedChange = vi.fn()
    const dispose = installCardGeometry({
      card,
      onExpandedChange,
      window: globalThis.window,
    })

    mouse(right, "mousedown", { x: 400, y: 100 })
    mouse(globalThis.window, "mousemove", { x: 2000, y: 100 })
    expect(card.style.getPropertyValue("width")).toBe("908px")
    expect(card.style.getPropertyPriority("width")).toBe("important")
    mouse(globalThis.window, "mouseup", { x: 2000, y: 100 })
    expect(card.style.getPropertyValue("width")).toBe("908px")
    expect(onExpandedChange).not.toHaveBeenCalled()

    mouse(left, "mousedown", { x: 100, y: 100 })
    mouse(globalThis.window, "mousemove", { x: -1000, y: 100 })
    expect(card.style.getPropertyValue("width")).toBe("384px")
    expect(card.style.left).toBe("16px")
    mouse(globalThis.window, "mouseup", { x: -1000, y: 100 })
    expect(onExpandedChange).not.toHaveBeenCalled()
    dispose()
  })
})

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  BOX_OVERLAY_ATTRIBUTE,
  BOX_OVERLAY_LABEL_ATTRIBUTE,
  createBoxOverlay,
} from "../src/box-overlay.js"

const animationFrameDescriptor = Object.getOwnPropertyDescriptor(
  globalThis.window,
  "requestAnimationFrame",
)
const cancelFrameDescriptor = Object.getOwnPropertyDescriptor(
  globalThis.window,
  "cancelAnimationFrame",
)
const resizeObserverDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "ResizeObserver",
)

afterEach(() => {
  document.body.replaceChildren()
  for (const [name, descriptor] of [
    ["requestAnimationFrame", animationFrameDescriptor],
    ["cancelAnimationFrame", cancelFrameDescriptor],
  ] as const) {
    if (descriptor) {
      Object.defineProperty(globalThis.window, name, descriptor)
    } else {
      Reflect.deleteProperty(globalThis.window, name)
    }
    if (resizeObserverDescriptor) {
      Object.defineProperty(
        globalThis,
        "ResizeObserver",
        resizeObserverDescriptor,
      )
    } else {
      Reflect.deleteProperty(globalThis, "ResizeObserver")
    }
  }
  vi.restoreAllMocks()
})

describe("box-model page overlay", () => {
  it("renders non-zero boundaries and replaces them on every inspection", () => {
    const target = document.createElement("div")
    target.style.cssText = "border: 2px solid; margin: 4px; padding: 8px 10px;"
    target.getBoundingClientRect = () =>
      ({
        height: 100,
        left: 50,
        top: 60,
        width: 200,
      }) as DOMRect
    document.body.append(target)
    const overlay = createBoxOverlay(document, globalThis.window)

    overlay.show(target)

    const boundaries = document.querySelectorAll(`[${BOX_OVERLAY_ATTRIBUTE}]`)
    expect(boundaries).toHaveLength(4)
    expect(
      Array.from(boundaries).map((boundary) => [
        boundary.getAttribute(BOX_OVERLAY_ATTRIBUTE),
        (boundary as HTMLElement).style.left,
        (boundary as HTMLElement).style.top,
        (boundary as HTMLElement).style.width,
        (boundary as HTMLElement).style.height,
      ]),
    ).toEqual([
      ["margin", "46px", "56px", "208px", "108px"],
      ["border", "50px", "60px", "200px", "100px"],
      ["padding", "52px", "62px", "196px", "96px"],
      ["content", "62px", "70px", "176px", "80px"],
    ])
    const label = document.querySelector<HTMLElement>(
      `[${BOX_OVERLAY_LABEL_ATTRIBUTE}]`,
    )
    expect(label?.style.left).toBe("50px")
    expect(label?.style.top).toBe("16px")
    expect(
      Array.from(label?.children ?? []).map((entry) => [
        entry.tagName,
        entry.textContent,
      ]),
    ).toEqual([
      ["STRONG", "div"],
      ["SPAN", "200 × 100"],
    ])

    target.style.cssText = ""
    overlay.show(target)
    expect(
      document.querySelectorAll(`[${BOX_OVERLAY_ATTRIBUTE}]`),
    ).toHaveLength(4)
    expect(
      Array.from(document.querySelectorAll(`[${BOX_OVERLAY_ATTRIBUTE}]`)).map(
        (boundary) => boundary.getAttribute(BOX_OVERLAY_ATTRIBUTE),
      ),
    ).toEqual(["margin", "border", "padding", "content"])
    expect(
      document.querySelector<HTMLElement>(
        `[${BOX_OVERLAY_ATTRIBUTE}="content"]`,
      )?.style.cssText,
    ).toBe("left: 50px; top: 60px; width: 200px; height: 100px;")

    target.style.padding = "100px"
    target.getBoundingClientRect = () =>
      ({ height: 100, left: 50, top: 60, width: 100 }) as DOMRect
    overlay.show(target)
    expect(
      document.querySelector(`[${BOX_OVERLAY_ATTRIBUTE}="content"]`),
    ).toBeNull()

    target.getBoundingClientRect = () =>
      ({ height: 100, left: 50, top: 60, width: 201 }) as DOMRect
    overlay.show(target)
    expect(
      document.querySelector(`[${BOX_OVERLAY_ATTRIBUTE}="content"]`),
    ).toBeNull()

    target.getBoundingClientRect = () =>
      ({ height: 201, left: 50, top: 60, width: 100 }) as DOMRect
    overlay.show(target)
    expect(
      document.querySelector(`[${BOX_OVERLAY_ATTRIBUTE}="content"]`),
    ).toBeNull()
    overlay.clear()
    expect(document.querySelector(`[${BOX_OVERLAY_ATTRIBUTE}]`)).toBeNull()
    expect(
      document.querySelector(`[${BOX_OVERLAY_LABEL_ATTRIBUTE}]`),
    ).toBeNull()
  })
})

describe("live box-model page overlay", () => {
  it("keeps boundaries anchored while the target moves", () => {
    const frames: Array<FrameRequestCallback> = []
    const cancelAnimationFrame = vi.fn()
    const observe = vi.spyOn(globalThis.MutationObserver.prototype, "observe")
    const disconnect = vi.spyOn(
      globalThis.MutationObserver.prototype,
      "disconnect",
    )
    const observeResize = vi.fn()
    const disconnectResize = vi.fn()
    class TestResizeObserver {
      disconnect = disconnectResize
      observe = observeResize
    }
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: TestResizeObserver,
    })
    const addEventListener = vi.spyOn(globalThis.window, "addEventListener")
    const removeEventListener = vi.spyOn(
      globalThis.window,
      "removeEventListener",
    )
    Object.defineProperties(globalThis.window, {
      cancelAnimationFrame: {
        configurable: true,
        value: cancelAnimationFrame,
      },
      requestAnimationFrame: {
        configurable: true,
        value: (callback: FrameRequestCallback) => {
          frames.push(callback)
          return frames.length
        },
      },
    })
    const target = document.createElement("div")
    target.style.padding = "8px"
    let left = 50
    target.getBoundingClientRect = () =>
      ({
        height: 100,
        left,
        top: 60,
        width: 200,
      }) as DOMRect
    document.body.append(target)
    const overlay = createBoxOverlay(document, globalThis.window)
    overlay.show(target)
    expect(observe).toHaveBeenCalledWith(target, {
      attributeFilter: ["class", "style"],
      attributes: true,
    })
    expect(observeResize).toHaveBeenCalledWith(target)
    expect(addEventListener).toHaveBeenCalledWith(
      "resize",
      expect.any(Function),
    )
    expect(addEventListener).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function),
      true,
    )
    expect(
      document.querySelector<HTMLElement>(
        `[${BOX_OVERLAY_ATTRIBUTE}="content"]`,
      )?.style.left,
    ).toBe("58px")
    const unchangedBoundary = document.querySelector(
      `[${BOX_OVERLAY_ATTRIBUTE}="content"]`,
    )
    frames.shift()?.(0)
    expect(document.querySelector(`[${BOX_OVERLAY_ATTRIBUTE}="content"]`)).toBe(
      unchangedBoundary,
    )

    left = 90
    globalThis.window.dispatchEvent(new Event("resize"))
    expect(
      document.querySelector<HTMLElement>(
        `[${BOX_OVERLAY_ATTRIBUTE}="content"]`,
      )?.style.left,
    ).toBe("98px")

    target.style.padding = "12px"
    globalThis.window.dispatchEvent(new Event("resize"))
    expect(
      document.querySelector<HTMLElement>(
        `[${BOX_OVERLAY_ATTRIBUTE}="content"]`,
      )?.style.left,
    ).toBe("102px")

    left = 120
    frames.shift()?.(1)
    expect(
      document.querySelector<HTMLElement>(
        `[${BOX_OVERLAY_ATTRIBUTE}="content"]`,
      )?.style.left,
    ).toBe("132px")

    overlay.clear()
    expect(cancelAnimationFrame).toHaveBeenCalled()
    expect(disconnect).toHaveBeenCalled()
    expect(disconnectResize).toHaveBeenCalled()
    expect(removeEventListener).toHaveBeenCalledWith(
      "resize",
      expect.any(Function),
    )
    expect(removeEventListener).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function),
      true,
    )

    overlay.show(target)
    target.remove()
    frames.pop()?.(2)
    expect(document.querySelector(`[${BOX_OVERLAY_ATTRIBUTE}]`)).toBeNull()
    expect(
      document.querySelector(`[${BOX_OVERLAY_LABEL_ATTRIBUTE}]`),
    ).toBeNull()
  })
})

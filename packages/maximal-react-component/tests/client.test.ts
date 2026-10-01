import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  getLayersForElement,
  getReactInstanceForElement,
  inspectorStyles,
  installReactComponentInspector,
  maxAncestorZIndex,
  sourcePath,
  type InspectorEnvironment,
  type ReactFiber,
} from "../src/client.js"

const ROOT = "/workspace/maximal"
const TARGET_ATTRIBUTE = "data-maximal-react-component-target"

let target: HTMLButtonElement
let requests: Array<string>
let dispose: (() => void) | undefined

beforeEach(() => {
  document.head.replaceChildren()
  document.body.replaceChildren()
  document.body.style.pointerEvents = ""
  delete globalThis.window.__REACT_DEVTOOLS_GLOBAL_HOOK__
  Object.defineProperty(globalThis.window, "innerHeight", {
    configurable: true,
    value: 800,
  })
  Object.defineProperty(globalThis.window, "innerWidth", {
    configurable: true,
    value: 1000,
  })
  target = document.createElement("button")
  document.body.append(target)
  requests = []
  const fetcher: typeof fetch = (input) => {
    requests.push(requestUrl(input))
    return Promise.resolve(new Response())
  }
  const environment: InspectorEnvironment = {
    document,
    fetch: fetcher,
    window: globalThis.window,
  }
  dispose = installReactComponentInspector(
    { root: ROOT, base: "/desktop/" },
    environment,
  )
})

afterEach(() => {
  dispose?.()
  dispose = undefined
  delete globalThis.window.__REACT_DEVTOOLS_GLOBAL_HOOK__
})

function fiber(
  type: ReactFiber["type"],
  fileName = `${ROOT}/src/Button.tsx`,
  owner?: ReactFiber,
): ReactFiber {
  return {
    type,
    _debugSource: { fileName, lineNumber: 12, columnNumber: 7 },
    ...(owner ? { _debugOwner: owner } : {}),
  }
}

function attachFiber(element: Element, value: ReactFiber): void {
  Object.defineProperty(element, "__reactFiber$oracle", {
    configurable: true,
    enumerable: true,
    value,
  })
}

function rect(values: Partial<DOMRect>): DOMRect {
  return {
    bottom: 40,
    height: 20,
    left: 10,
    right: 110,
    top: 20,
    width: 100,
    x: 10,
    y: 20,
    toJSON: () => ({}),
    ...values,
  }
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.href
  return input.url
}

function contextMenu(element: EventTarget): MouseEvent {
  const event = new MouseEvent("contextmenu", {
    altKey: true,
    bubbles: true,
    cancelable: true,
  })
  element.dispatchEvent(event)
  return event
}

function inspectorCard(): HTMLElement {
  const card = document.querySelector<HTMLElement>(
    "#maximal-react-component-card",
  )
  expect(card).not.toBeNull()
  if (!card) throw new Error("Expected the inspector card")
  return card
}

function selectedName(card: HTMLElement): string | null {
  return (
    card.querySelector(".maximal-react-component-name-link[data-active='true']")
      ?.textContent ?? null
  )
}

function attachLayeredTarget(): {
  middle: HTMLElement
  outer: HTMLElement
} {
  const outer = document.createElement("main")
  const middle = document.createElement("section")
  outer.append(middle)
  middle.append(target)
  document.body.append(outer)

  outer.getBoundingClientRect = () =>
    rect({ bottom: 300, height: 200, left: 100, right: 500, top: 100 })
  middle.getBoundingClientRect = () =>
    rect({ bottom: 260, height: 120, left: 140, right: 460, top: 140 })
  target.getBoundingClientRect = () => rect({})

  const app = fiber({ displayName: "App" }, `${ROOT}/src/App.tsx`)
  app.child = { stateNode: outer, type: "main" }
  const panel = fiber({ displayName: "Panel" }, `${ROOT}/src/Panel.tsx`, app)
  panel.child = { stateNode: middle, type: "section" }
  const button = fiber("button", `${ROOT}/src/Button.tsx`, panel)
  button.stateNode = target
  attachFiber(target, button)
  return { middle, outer }
}

describe("React component source discovery", () => {
  it("matches the oracle's source path defaults and precedence", () => {
    expect(
      sourcePath({
        type: "button",
        _debugInfo: { fileName: "/fallback.tsx" },
      }),
    ).toBe("/fallback.tsx:1:1")
    expect(
      sourcePath({
        type: "button",
        _debugInfo: { fileName: "/fallback.tsx" },
        _debugSource: {
          fileName: "/preferred.tsx",
          lineNumber: 4,
          columnNumber: 9,
        },
      }),
    ).toBe("/preferred.tsx:4:9")
    expect(sourcePath({ type: "button" })).toBeUndefined()
  })

  it("uses React DevTools before element fallbacks", () => {
    const element = document.createElement("button")
    const expected = fiber("button")
    const other = fiber("aside")
    attachFiber(element, other)
    const rendererFailure = {
      findFiberByHostInstance: () => {
        throw new Error("different renderer")
      },
    }
    const rendererMiss = { findFiberByHostInstance: () => undefined }
    const rendererMatch = { findFiberByHostInstance: () => expected }
    Object.defineProperty(globalThis.window, "__REACT_DEVTOOLS_GLOBAL_HOOK__", {
      configurable: true,
      value: {
        renderers: new Map<
          unknown,
          {
            findFiberByHostInstance(element: Element): ReactFiber | undefined
          }
        >([
          ["failure", rendererFailure],
          ["miss", rendererMiss],
          ["match", rendererMatch],
        ]),
      },
    })

    expect(getReactInstanceForElement(element, globalThis.window)).toBe(
      expected,
    )
  })

  it("falls back to legacy roots and element fiber properties", () => {
    const rootElement = document.createElement("div")
    const rootFiber = fiber("main")
    Object.defineProperty(rootElement, "_reactRootContainer", {
      configurable: true,
      value: { _internalRoot: { current: { child: rootFiber } } },
    })
    expect(getReactInstanceForElement(rootElement, globalThis.window)).toBe(
      rootFiber,
    )

    const fiberElement = document.createElement("div")
    const attachedFiber = fiber("section")
    Object.defineProperty(fiberElement, "unrelated", {
      enumerable: true,
      value: "not a fiber",
    })
    attachFiber(fiberElement, attachedFiber)
    expect(getReactInstanceForElement(fiberElement, globalThis.window)).toBe(
      attachedFiber,
    )
    expect(
      getReactInstanceForElement(
        document.createElement("div"),
        globalThis.window,
      ),
    ).toBeUndefined()
  })

  it("normalizes owners from the window toward the targeted component", () => {
    const element = document.createElement("button")
    const outerElement = document.createElement("main")
    const middleElement = document.createElement("section")
    document.body.append(outerElement, middleElement)
    const renderOwner = fiber({ render: { name: "Forwarded" } })
    renderOwner.child = { type: "main", stateNode: outerElement }
    const noSourceOwner: ReactFiber = {
      type: { displayName: "NoSource" },
      _debugOwner: renderOwner,
    }
    const namedOwner = fiber(
      { name: "Named" },
      `${ROOT}/src/Named.tsx`,
      noSourceOwner,
    )
    namedOwner.child = { type: "section", stateNode: middleElement }
    const displayOwner = fiber(
      { displayName: "Displayed", name: "Ignored" },
      `${ROOT}/src/Displayed.tsx`,
      namedOwner,
    )
    const unknownOwner = fiber({}, `${ROOT}/src/Unknown.tsx`, displayOwner)
    attachFiber(
      element,
      fiber("button", `${ROOT}/src/Button.tsx`, unknownOwner),
    )

    const layers = getLayersForElement(element, globalThis.window)
    expect(layers.map(({ name }) => name)).toEqual([
      "Forwarded",
      "Named",
      "Displayed",
      "undefined",
      "button",
    ])
    expect(layers.map(({ target }) => target)).toEqual([
      outerElement,
      middleElement,
      element,
      element,
      element,
    ])
  })
})

describe("React component inspector overlay", () => {
  it("uses package-owned styles and removes interactions on disposal", () => {
    expect(document.head.querySelector("style")).toBeNull()
    expect(inspectorStyles).toContain(`[${TARGET_ATTRIBUTE}]`)
    expect(inspectorStyles).toContain("#maximal-react-component-card")

    target.dispatchEvent(
      new MouseEvent("mousemove", { altKey: true, bubbles: true }),
    )
    dispose?.()
    dispose = undefined
    expect(target.hasAttribute(TARGET_ATTRIBUTE)).toBe(false)

    target.dispatchEvent(
      new MouseEvent("mousemove", { altKey: true, bubbles: true }),
    )
    expect(target.hasAttribute(TARGET_ATTRIBUTE)).toBe(false)
  })

  it("supports browser globals without a supplied environment", () => {
    dispose?.()
    dispose = installReactComponentInspector({ root: ROOT, base: "/" })

    expect(document.head.querySelector("style")).toBeNull()
  })

  it("removes every interaction listener with matching capture options", () => {
    dispose?.()
    const remove = vi.spyOn(globalThis.window, "removeEventListener")
    dispose = installReactComponentInspector({ root: ROOT, base: "/" })

    dispose()
    dispose = undefined

    expect(remove).toHaveBeenCalledWith("click", expect.any(Function), true)
    expect(remove).toHaveBeenCalledWith("keydown", expect.any(Function))
    expect(remove).toHaveBeenCalledWith("keyup", expect.any(Function))
    expect(remove).toHaveBeenCalledWith("wheel", expect.any(Function))
    remove.mockRestore()
  })

  it("outlines only the current Option-hovered HTML element", () => {
    const other = document.createElement("span")
    document.body.append(other)

    target.dispatchEvent(
      new MouseEvent("mousemove", { altKey: true, bubbles: true }),
    )
    expect(target.hasAttribute(TARGET_ATTRIBUTE)).toBe(true)
    expect(target.getAttribute(TARGET_ATTRIBUTE)).toBe("")

    target.dispatchEvent(
      new MouseEvent("mousemove", { altKey: true, bubbles: true }),
    )
    expect(target.hasAttribute(TARGET_ATTRIBUTE)).toBe(true)

    other.dispatchEvent(
      new MouseEvent("mousemove", { altKey: true, bubbles: true }),
    )
    expect(target.hasAttribute(TARGET_ATTRIBUTE)).toBe(false)
    expect(other.hasAttribute(TARGET_ATTRIBUTE)).toBe(true)

    other.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))
    expect(other.hasAttribute(TARGET_ATTRIBUTE)).toBe(false)

    target.dispatchEvent(
      new MouseEvent("mousemove", { altKey: true, bubbles: true }),
    )
    globalThis.window.dispatchEvent(
      new MouseEvent("mousemove", { altKey: true, bubbles: true }),
    )
    expect(target.hasAttribute(TARGET_ATTRIBUTE)).toBe(false)
  })

  it("ignores ordinary context menus and targets without React layers", () => {
    const ordinary = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    })
    target.dispatchEvent(ordinary)
    expect(ordinary.defaultPrevented).toBe(false)

    const modified = new MouseEvent("contextmenu", {
      altKey: true,
      bubbles: true,
      cancelable: true,
    })
    target.dispatchEvent(modified)
    expect(modified.defaultPrevented).toBe(true)
    expect(document.querySelector("#maximal-react-component-card")).toBeNull()

    expect(contextMenu(document).defaultPrevented).toBe(false)
    expect(
      document.body.hasAttribute("data-maximal-react-component-unlocked"),
    ).toBe(false)
  })
})

describe("React component inspector card", () => {
  it("renders the React owner stack and opens the focused source", async () => {
    const owner = fiber({ displayName: "Panel" }, `${ROOT}/src/Panel.tsx`)
    attachFiber(target, fiber("button", `${ROOT}/src/Button.tsx`, owner))
    target.getBoundingClientRect = () => rect({})
    document.body.style.pointerEvents = "none"

    target.dispatchEvent(
      new MouseEvent("mousemove", { altKey: true, bubbles: true }),
    )
    contextMenu(target)

    const card = inspectorCard()
    expect(card.style.top).toBe("48px")
    expect(card.style.bottom).toBe("")
    expect(card.style.left).toBe("16px")
    expect(card.style.right).toBe("")
    expect(card.style.maxHeight).toBe("736px")
    expect(card.style.zIndex).toBe("2147483647")
    expect(document.activeElement).toBe(card)
    expect(selectedName(card)).toBe("Panel")
    expect(card.textContent).toContain("src/Panel.tsx:12:7")
    expect(card.textContent).toContain("1 / 2")
    expect(document.body.style.pointerEvents).toBe("auto")
    expect(
      document.body.hasAttribute("data-maximal-react-component-unlocked"),
    ).toBe(true)

    card
      .querySelector<HTMLButtonElement>(".maximal-react-component-next")
      ?.click()
    expect(selectedName(card)).toBe("button")
    expect(card.textContent).toContain("src/Button.tsx:12:7")
    expect(card.textContent).toContain("2 / 2")
    card
      .querySelector<HTMLButtonElement>(
        "[aria-label='Select button; double-click to open source']",
      )
      ?.dispatchEvent(
        new MouseEvent("dblclick", {
          bubbles: true,
          detail: 2,
        }),
      )
    await Promise.resolve()
    expect(requests).toEqual([
      "/desktop/__open-in-editor?file="
        + encodeURIComponent(`${ROOT}/src/Button.tsx:12:7`),
    ])
    expect(document.querySelector("#maximal-react-component-card")).toBeNull()
    expect(target.hasAttribute(TARGET_ATTRIBUTE)).toBe(false)
    expect(document.body.style.pointerEvents).toBe("none")
    expect(
      document.body.hasAttribute("data-maximal-react-component-unlocked"),
    ).toBe(false)
  })

  it("positions cards above and to the right", () => {
    attachFiber(target, fiber("button"))
    target.getBoundingClientRect = () =>
      rect({
        bottom: 760,
        left: 800,
        right: 900,
        top: 700,
      })

    contextMenu(target)

    const card = inspectorCard()
    expect(card.style.bottom).toBe("108px")
    expect(card.style.top).toBe("")
    expect(card.style.right).toBe("100px")
    expect(card.style.left).toBe("")
    expect(card.style.maxHeight).toBe("676px")

    target.getBoundingClientRect = () => rect({})
    contextMenu(target)
    expect(card.style.bottom).toBe("")
    expect(card.style.right).toBe("")
    expect(card.textContent).toContain("1 / 1")
  })

  it("uses the larger visible side for a partly visible target", () => {
    attachFiber(target, fiber("button"))
    target.getBoundingClientRect = () =>
      rect({
        bottom: 900,
        top: 300,
      })

    target.dispatchEvent(
      new MouseEvent("contextmenu", {
        altKey: true,
        bubbles: true,
      }),
    )

    const card = document.querySelector<HTMLElement>(
      "#maximal-react-component-card",
    )
    expect(card?.style.bottom).toBe("508px")
    expect(card?.style.maxHeight).toBe("276px")
  })

  it("places a centered target's card on the side with more room", () => {
    attachFiber(target, fiber("button"))
    target.getBoundingClientRect = () =>
      rect({
        bottom: 600,
        top: 300,
      })

    target.dispatchEvent(
      new MouseEvent("contextmenu", {
        altKey: true,
        bubbles: true,
      }),
    )

    const card = document.querySelector<HTMLElement>(
      "#maximal-react-component-card",
    )
    expect(card?.style.bottom).toBe("508px")
    expect(card?.style.maxHeight).toBe("276px")
  })

  it("uses strict viewport boundaries and stacks above application content", () => {
    const parent = document.createElement("div")
    parent.style.zIndex = "1200"
    document.body.append(parent)
    parent.append(target)
    attachFiber(target, fiber("button"))
    target.getBoundingClientRect = () =>
      rect({
        bottom: 400,
        left: 500,
        right: 600,
        top: 380,
      })

    contextMenu(target)

    const card = inspectorCard()
    expect(card.style.top).toBe("408px")
    expect(card.style.bottom).toBe("")
    expect(card.style.left).toBe("")
    expect(card.style.right).toBe("400px")
    expect(card.style.zIndex).toBe("2147483647")

    target.getBoundingClientRect = () =>
      rect({
        bottom: 600,
        top: 400,
      })
    contextMenu(target)
    expect(card.style.bottom).toBe("408px")
  })
})

describe("React component inspector interaction state", () => {
  it("keeps the card interactive after Option is released", () => {
    attachFiber(target, fiber("button"))
    contextMenu(target)
    expect(
      document.querySelector("#maximal-react-component-card"),
    ).not.toBeNull()

    globalThis.window.dispatchEvent(
      new KeyboardEvent("keyup", { altKey: true }),
    )
    expect(
      document.querySelector("#maximal-react-component-card"),
    ).not.toBeNull()

    globalThis.window.dispatchEvent(
      new KeyboardEvent("keyup", { altKey: false }),
    )
    expect(
      document.querySelector("#maximal-react-component-card"),
    ).not.toBeNull()
    expect(target.hasAttribute(TARGET_ATTRIBUTE)).toBe(true)
  })

  it("clears a hover preview when Option is released before opening", () => {
    target.dispatchEvent(
      new MouseEvent("mousemove", { altKey: true, bubbles: true }),
    )
    expect(target.hasAttribute(TARGET_ATTRIBUTE)).toBe(true)

    globalThis.window.dispatchEvent(
      new KeyboardEvent("keyup", { altKey: false }),
    )
    expect(target.hasAttribute(TARGET_ATTRIBUTE)).toBe(false)
  })

  it("freezes hover selection while the component card is open", () => {
    const other = document.createElement("span")
    document.body.append(other)
    attachFiber(target, fiber("button"))
    target.dispatchEvent(
      new MouseEvent("mousemove", { altKey: true, bubbles: true }),
    )
    contextMenu(target)

    other.dispatchEvent(
      new MouseEvent("mousemove", { altKey: true, bubbles: true }),
    )
    expect(target.hasAttribute(TARGET_ATTRIBUTE)).toBe(true)
    expect(other.hasAttribute(TARGET_ATTRIBUTE)).toBe(false)
  })

  it("replaces the selected target without duplicating card state", () => {
    const other = document.createElement("span")
    document.body.append(other)
    attachFiber(target, fiber("button"))
    attachFiber(other, fiber({ displayName: "Other" }))
    document.body.style.pointerEvents = "none"

    contextMenu(target)
    const card = inspectorCard()
    expect(target.getAttribute(TARGET_ATTRIBUTE)).toBe("")
    expect(
      document.body.getAttribute("data-maximal-react-component-unlocked"),
    ).toBe("")

    contextMenu(other)
    expect(
      document.querySelectorAll("#maximal-react-component-card"),
    ).toHaveLength(1)
    expect(document.querySelector("#maximal-react-component-card")).toBe(card)
    expect(target.hasAttribute(TARGET_ATTRIBUTE)).toBe(false)
    expect(other.getAttribute(TARGET_ATTRIBUTE)).toBe("")
    expect(selectedName(card)).toBe("Other")

    document.body.click()
    expect(document.body.style.pointerEvents).toBe("none")
  })

  it("keeps card controls contained and dismisses with Escape", () => {
    attachFiber(target, fiber("button"))
    contextMenu(target)
    const card = inspectorCard()
    const next = card.querySelector<HTMLButtonElement>(
      ".maximal-react-component-next",
    )
    expect(next?.disabled).toBe(true)
    next?.click()
    expect(document.querySelector("#maximal-react-component-card")).toBe(card)

    globalThis.window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown" }),
    )
    expect(document.querySelector("#maximal-react-component-card")).toBe(card)

    const cardContextMenu = new MouseEvent("contextmenu", {
      altKey: true,
      bubbles: true,
      cancelable: true,
    })
    next?.dispatchEvent(cardContextMenu)
    expect(cardContextMenu.defaultPrevented).toBe(false)
    expect(document.querySelector("#maximal-react-component-card")).toBe(card)

    globalThis.window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape" }),
    )
    expect(document.querySelector("#maximal-react-component-card")).toBeNull()
    expect(target.hasAttribute(TARGET_ATTRIBUTE)).toBe(false)
  })
})

describe("component layer drill-down", () => {
  it("uses the wheel to move through outer-to-inner component layers", async () => {
    const { middle, outer } = attachLayeredTarget()
    const unrelated = document.createElement("aside")
    document.body.append(unrelated)

    contextMenu(target)
    const card = inspectorCard()
    expect(selectedName(card)).toBe("App")
    expect(outer.getAttribute(TARGET_ATTRIBUTE)).toBe("")
    expect(card.style.top).toBe("308px")

    const stationary = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 0,
    })
    target.dispatchEvent(stationary)
    expect(stationary.defaultPrevented).toBe(false)
    expect(selectedName(card)).toBe("App")

    const inward = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 20,
    })
    target.dispatchEvent(inward)
    expect(inward.defaultPrevented).toBe(true)
    expect(selectedName(card)).toBe("Panel")
    expect(outer.hasAttribute(TARGET_ATTRIBUTE)).toBe(false)
    expect(middle.getAttribute(TARGET_ATTRIBUTE)).toBe("")
    expect(card.style.top).toBe("308px")

    middle.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaY: 20,
      }),
    )
    expect(selectedName(card)).toBe("button")
    expect(middle.hasAttribute(TARGET_ATTRIBUTE)).toBe(false)
    expect(target.getAttribute(TARGET_ATTRIBUTE)).toBe("")
    expect(card.style.top).toBe("308px")

    globalThis.window.dispatchEvent(
      new WheelEvent("wheel", {
        cancelable: true,
        deltaY: -20,
      }),
    )
    expect(selectedName(card)).toBe("button")

    target.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaY: -20,
      }),
    )
    expect(selectedName(card)).toBe("Panel")

    const outsideWheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 20,
    })
    unrelated.dispatchEvent(outsideWheel)
    expect(outsideWheel.defaultPrevented).toBe(false)
    expect(selectedName(card)).toBe("Panel")
    card
      .querySelector<HTMLButtonElement>(
        "[aria-label='Select App; double-click to open source']",
      )
      ?.click()
    await new Promise((resolve) => setTimeout(resolve, 225))
    expect(selectedName(card)).toBe("App")
    expect(card.style.top).toBe("308px")
  })

  it("uses Ctrl-click preview mode to drill into the selected boundary", () => {
    const { middle, outer } = attachLayeredTarget()
    contextMenu(target)
    const card = inspectorCard()
    expect(card.dataset["mode"]).toBe("full")

    globalThis.window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Shift" }),
    )
    expect(card.dataset["mode"]).toBe("full")

    globalThis.window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Control" }),
    )
    expect(card.dataset["mode"]).toBe("preview")

    globalThis.window.dispatchEvent(
      new KeyboardEvent("keyup", { key: "Shift" }),
    )
    expect(card.dataset["mode"]).toBe("preview")

    const targetClick = vi.fn()
    target.addEventListener("click", targetClick)
    const firstDrill = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
    })
    target.dispatchEvent(firstDrill)
    expect(firstDrill.defaultPrevented).toBe(true)
    expect(targetClick).not.toHaveBeenCalled()
    expect(selectedName(card)).toBe("Panel")
    expect(outer.hasAttribute(TARGET_ATTRIBUTE)).toBe(false)
    expect(middle.getAttribute(TARGET_ATTRIBUTE)).toBe("")
    expect(card.style.top).toBe("308px")

    middle.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
      }),
    )
    expect(selectedName(card)).toBe("button")
    expect(target.getAttribute(TARGET_ATTRIBUTE)).toBe("")
    expect(card.style.top).toBe("308px")

    target.getBoundingClientRect = () => rect({ bottom: 80, top: 60, y: 60 })
    globalThis.window.dispatchEvent(
      new KeyboardEvent("keyup", { key: "Control" }),
    )
    expect(card.dataset["mode"]).toBe("full")
    expect(selectedName(card)).toBe("button")
    expect(card.style.top).toBe("88px")
  })

  it("dismisses the card when clicking outside it", () => {
    attachLayeredTarget()
    contextMenu(target)
    const card = inspectorCard()
    card
      .querySelector<HTMLButtonElement>("[aria-label='Toggle inspector tools']")
      ?.click()
    Array.from(card.querySelectorAll<HTMLButtonElement>("[role='tab']"))
      .find((tab) => tab.dataset["view"] === "box")
      ?.click()
    expect(
      document.querySelectorAll("[data-maximal-box-boundary]"),
    ).toHaveLength(4)

    card.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    expect(document.querySelector("#maximal-react-component-card")).toBe(card)

    const unrelated = document.createElement("aside")
    document.body.append(unrelated)
    unrelated.click()
    expect(document.querySelector("#maximal-react-component-card")).toBeNull()
    expect(target.hasAttribute(TARGET_ATTRIBUTE)).toBe(false)
    expect(document.querySelector("[data-maximal-box-boundary]")).toBeNull()
  })
})

describe("inspector developer tools", () => {
  it("opens CSS sources and keeps box boundaries attached to the target", () => {
    const style = document.createElement("style")
    style.dataset["viteDevId"] = `${ROOT}/src/button.css`
    style.textContent = ".inspectable { color: red; }"
    document.head.append(style)
    target.className = "inspectable"
    target.style.padding = "8px"
    let left = 10
    target.getBoundingClientRect = () =>
      rect({ left, right: left + 100, width: 100 })
    attachFiber(target, fiber("button"))
    contextMenu(target)
    const card = inspectorCard()

    card
      .querySelector<HTMLButtonElement>("[aria-label='Toggle inspector tools']")
      ?.click()
    Array.from(card.querySelectorAll<HTMLButtonElement>("[role='tab']"))
      .find((tab) => tab.dataset["view"] === "css")
      ?.click()
    card
      .querySelector<HTMLButtonElement>(".maximal-react-component-source-link")
      ?.click()
    expect(requests).toEqual([
      "/desktop/__open-in-editor?file="
        + encodeURIComponent(`${ROOT}/src/button.css:1:1`),
    ])

    Array.from(card.querySelectorAll<HTMLButtonElement>("[role='tab']"))
      .find((tab) => tab.dataset["view"] === "box")
      ?.click()
    const contentBoundary = (): HTMLElement | null =>
      document.querySelector("[data-maximal-box-boundary='content']")
    expect(contentBoundary()?.style.left).toBe("18px")
    left = 50
    globalThis.window.dispatchEvent(new Event("resize"))
    expect(contentBoundary()?.style.left).toBe("58px")

    card
      .querySelector<HTMLButtonElement>("[aria-label='Toggle inspector tools']")
      ?.click()
    expect(contentBoundary()).toBeNull()
    expect(target.hasAttribute(TARGET_ATTRIBUTE)).toBe(true)
  })
})

describe("overlay stacking", () => {
  it("uses the highest numeric ancestor z-index", () => {
    const parent = document.createElement("div")
    const middle = document.createElement("div")
    const target = document.createElement("button")
    parent.style.zIndex = "1200"
    middle.style.zIndex = "auto"
    document.body.append(parent)
    parent.append(middle)
    middle.append(target)
    const bodyTarget = document.createElement("button")
    document.body.style.zIndex = "5000"
    document.body.append(bodyTarget)

    expect(
      maxAncestorZIndex(target, 999, { document, window: globalThis.window }),
    ).toBe(1200)
    expect(
      maxAncestorZIndex(bodyTarget, 999, {
        document,
        window: globalThis.window,
      }),
    ).toBe(999)
    expect(
      maxAncestorZIndex(document.createElement("button"), 999, {
        document,
        window: globalThis.window,
      }),
    ).toBe(999)
  })
})

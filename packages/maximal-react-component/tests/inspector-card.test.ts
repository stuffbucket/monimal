import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ComponentLayer } from "../src/client.js"

import { createInspectorCard, inspectorStyles } from "../src/inspector-card.js"

const layers: Array<ComponentLayer> = [
  { name: "App", path: "/workspace/maximal/src/App.tsx:8:1" },
  { name: "Panel", path: "/workspace/maximal/src/Panel.tsx:20:3" },
  { name: "button", path: "/workspace/maximal/src/Button.tsx:12:7" },
]

beforeEach(() => {
  document.body.replaceChildren()
})

function setup(initialIndex = 0) {
  const onDismiss = vi.fn()
  const onOpen = vi.fn()
  const onSelect = vi.fn()
  const onInspectEnd = vi.fn()
  const onInspectTarget = vi.fn()
  const onOpenPath = vi.fn()
  const card = createInspectorCard({
    document,
    root: "/workspace/maximal",
    window: globalThis.window,
    onDismiss,
    onInspectEnd,
    onInspectTarget,
    onOpen,
    onOpenPath,
    onSelect,
  })
  card.setLayers(layers, initialIndex)
  document.body.append(card.element)
  return {
    card,
    onDismiss,
    onInspectEnd,
    onInspectTarget,
    onOpen,
    onOpenPath,
    onSelect,
  }
}

function button(card: HTMLElement, name: string): HTMLButtonElement {
  const control = Array.from(card.querySelectorAll("button")).find(
    (candidate) => candidate.getAttribute("aria-label") === name,
  )
  if (!control) throw new Error(`Expected the ${name} button`)
  return control
}

function verifyNameToolPreview(): void {
  vi.useFakeTimers()
  try {
    const firstTarget = document.createElement("main")
    const secondTarget = document.createElement("section")
    firstTarget.style.cssText = "color: red; margin: 4px;"
    secondTarget.style.cssText = "color: blue; margin: 12px;"
    document.body.append(firstTarget, secondTarget)
    firstTarget.getBoundingClientRect = () =>
      ({ height: 80, width: 160 }) as DOMRect
    secondTarget.getBoundingClientRect = () =>
      ({ height: 40, width: 90 }) as DOMRect
    const { card, onInspectTarget } = setup()
    card.setLayers(
      [
        { ...layers[0], target: firstTarget },
        { ...layers[1], target: secondTarget },
      ],
      1,
    )
    card.setView("css")
    onInspectTarget.mockClear()
    const appName = button(
      card.element,
      "Select App; double-click to open source",
    )
    appName.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
    expect(card.element.textContent).toContain("colorred")
    expect(card.element.textContent).not.toContain("colorblue")
    appName.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }))
    expect(card.element.textContent).toContain("colorblue")
    expect(card.element.textContent).not.toContain("colorred")

    card.setView("box")
    onInspectTarget.mockClear()
    appName.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
    expect(
      card.element.querySelector(".maximal-react-component-location")
        ?.textContent,
    ).toBe("src/App.tsx:8:1")
    expect(
      card.element.querySelector(".box-margin")?.getAttribute("data-label"),
    ).toBe("margin · 4 4 4 4")
    expect(
      card.element.querySelector(".maximal-react-component-box-content")
        ?.textContent,
    ).toBe("160.0 × 80.0")
    expect(onInspectTarget).toHaveBeenLastCalledWith(firstTarget, true)

    appName.click()
    vi.advanceTimersByTime(200)
    expect(card.selectedLayer().target).toBe(firstTarget)
    expect(
      card.element.querySelector(".box-margin")?.getAttribute("data-label"),
    ).toBe("margin · 4 4 4 4")
    expect(onInspectTarget).toHaveBeenLastCalledWith(firstTarget, true)
  } finally {
    vi.useRealTimers()
  }
}

describe("inspector card", () => {
  it("renders a selected stack layer with source context", () => {
    const { card } = setup(1)

    expect(card.element.getAttribute("role")).toBe("dialog")
    expect(card.element.getAttribute("aria-label")).toBe(
      "React component source inspector",
    )
    expect(card.element.tabIndex).toBe(-1)
    expect(card.element.textContent).not.toContain("Component stack")
    expect(
      card.element.querySelectorAll(".maximal-react-component-name-link"),
    ).toHaveLength(2)
    expect(card.element.textContent).toContain("Panel")
    expect(
      card.element.querySelector(".maximal-react-component-location")
        ?.textContent,
    ).toBe("src/Panel.tsx:20:3")
    expect(card.element.textContent).toContain("2 / 3")
    expect(
      card.element
        .querySelector(".maximal-react-component-name")
        ?.getAttribute("title"),
    ).toBe("App › Panel › button")
    expect(
      button(card.element, "Select Panel; double-click to open source").dataset[
        "active"
      ],
    ).toBe("true")
    expect(
      card.element
        .querySelector(".maximal-react-component-location")
        ?.getAttribute("title"),
    ).toBe("/workspace/maximal/src/Panel.tsx:20:3")
    expect(button(card.element, "Previous component").disabled).toBe(false)
    expect(button(card.element, "Next component").disabled).toBe(false)
  })

  it("renders isolated, accessible icon controls", () => {
    const { card } = setup()
    const controls = Array.from(
      card.element.querySelectorAll<HTMLButtonElement>(
        ".maximal-react-component-control",
      ),
    )
    const icons = Array.from(card.element.querySelectorAll("svg"))

    expect(controls).toHaveLength(5)
    expect(
      card.element.querySelector(".maximal-react-component-selection"),
    ).not.toBeNull()
    expect(
      card.element.querySelector(".maximal-react-component-eyebrow"),
    ).toBeNull()
    expect(
      card.element.querySelector(".maximal-react-component-actions"),
    ).not.toBeNull()
    expect(
      controls.every(
        (control) =>
          control.type === "button"
          && control.classList.contains("maximal-react-component-control"),
      ),
    ).toBe(true)
    expect(button(card.element, "Previous component").className).toContain(
      "maximal-react-component-previous",
    )
    expect(button(card.element, "Next component").className).toContain(
      "maximal-react-component-next",
    )
    expect(button(card.element, "Open component source").className).toContain(
      "maximal-react-component-open",
    )
    expect(button(card.element, "Toggle inspector tools").className).toContain(
      "maximal-react-component-tools",
    )
    expect(
      button(card.element, "Collapse component stack").getAttribute(
        "aria-expanded",
      ),
    ).toBe("true")
    expect(
      card.element.querySelector(".maximal-react-component-header-controls")
        ?.children,
    ).toHaveLength(1)
    expect(icons).toHaveLength(7)
    for (const icon of icons) {
      expect(icon.namespaceURI).toBe("http://www.w3.org/2000/svg")
      expect(icon.getAttribute("aria-hidden")).toBe("true")
      expect(icon.getAttribute("viewBox")).toBe("0 0 24 24")
      expect(icon.querySelector("path")?.namespaceURI).toBe(
        "http://www.w3.org/2000/svg",
      )
      expect(icon.querySelector("path")?.getAttribute("d")).not.toBe("")
    }
    expect(
      card.element
        .querySelector(".maximal-react-component-count")
        ?.getAttribute("aria-live"),
    ).toBe("polite")
    expect(
      card.element
        .querySelector(".maximal-react-component-divider")
        ?.getAttribute("aria-hidden"),
    ).toBe("true")
    expect(button(card.element, "Open component source").textContent).toBe("")
    expect(
      button(card.element, "Select App; double-click to open source").type,
    ).toBe("button")
    expect(
      Array.from(
        card.element.querySelectorAll<HTMLElement>("[data-resize-edge]"),
      ).map((handle) => [
        handle.dataset["resizeEdge"],
        handle.className,
        handle.getAttribute("aria-hidden"),
      ]),
    ).toEqual([
      ["top", "maximal-react-component-grabber", "true"],
      ["bottom", "maximal-react-component-resize-bottom", "true"],
      [
        "left",
        "maximal-react-component-resize-horizontal maximal-react-component-resize-left",
        "true",
      ],
      [
        "right",
        "maximal-react-component-resize-horizontal maximal-react-component-resize-right",
        "true",
      ],
    ])
    expect(
      card.element
        .querySelector(".maximal-react-component-name")
        ?.getAttribute("aria-label"),
    ).toBe("React component owner stack")
    expect(
      Array.from(
        card.element.querySelectorAll<HTMLElement>(
          ".maximal-react-component-name-link",
        ),
      ).map((link) => [
        link.textContent,
        link.dataset["active"],
        link.style.paddingLeft,
      ]),
    ).toEqual([["App", "true", "0px"]])
    expect(inspectorStyles).toContain("cubic-bezier(0.2, 0, 0, 1)")
    expect(inspectorStyles).toContain("cubic-bezier(0.16, 1, 0.3, 1)")
    expect(inspectorStyles).toContain("z-index: 2147483647")
    expect(inspectorStyles).toContain("z-index: 2147483646 !important")
  })

  it("moves through the stack with controls and disables its boundaries", () => {
    const { card } = setup()
    const previous = button(card.element, "Previous component")
    const next = button(card.element, "Next component")

    expect(previous.disabled).toBe(true)
    previous.click()
    expect(card.selectedLayer()).toBe(layers[0])

    next.click()
    next.click()
    next.click()
    expect(card.selectedLayer()).toBe(layers[2])
    expect(card.element.textContent).toContain("3 / 3")
    expect(next.disabled).toBe(true)

    previous.click()
    expect(card.selectedLayer()).toBe(layers[1])
  })
})

describe("inspector card interactions", () => {
  it("supports stack navigation and activation from the keyboard", () => {
    const { card, onDismiss, onOpen } = setup()

    const focus = vi.spyOn(card.element, "focus")
    card.focus()
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })

    const right = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true,
    })
    card.element.dispatchEvent(right)
    expect(right.defaultPrevented).toBe(true)
    expect(card.selectedLayer()).toBe(layers[1])
    expect(card.element.textContent).toContain("2 / 3")
    const end = new KeyboardEvent("keydown", {
      key: "End",
      bubbles: true,
      cancelable: true,
    })
    card.element.dispatchEvent(end)
    expect(end.defaultPrevented).toBe(true)
    expect(card.selectedLayer()).toBe(layers[2])
    card.element.dispatchEvent(right)
    expect(
      card.element.querySelector(
        ".maximal-react-component-name-link[data-active='true']",
      )?.textContent,
    ).toBe("button")
    const home = new KeyboardEvent("keydown", {
      key: "Home",
      bubbles: true,
      cancelable: true,
    })
    card.element.dispatchEvent(home)
    expect(home.defaultPrevented).toBe(true)
    expect(card.selectedLayer()).toBe(layers[0])
    expect(card.element.textContent).toContain("1 / 3")
    const left = new KeyboardEvent("keydown", {
      key: "ArrowLeft",
      bubbles: true,
      cancelable: true,
    })
    card.element.dispatchEvent(left)
    expect(left.defaultPrevented).toBe(true)
    expect(card.selectedLayer()).toBe(layers[0])

    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    })
    card.element.dispatchEvent(enter)
    expect(enter.defaultPrevented).toBe(true)
    expect(onOpen).toHaveBeenCalledWith(layers[0])

    const childEnter = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    })
    button(card.element, "Next component").dispatchEvent(childEnter)
    expect(childEnter.defaultPrevented).toBe(false)
    expect(onOpen).toHaveBeenCalledOnce()

    const unrelated = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    })
    card.element.dispatchEvent(unrelated)
    expect(unrelated.defaultPrevented).toBe(false)

    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    })
    card.element.dispatchEvent(escape)
    expect(escape.defaultPrevented).toBe(true)
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it("opens from the explicit source control", () => {
    const { card, onOpen } = setup(2)

    button(card.element, "Open component source").click()
    expect(onOpen).toHaveBeenCalledWith(layers[2])
  })

  it("selects names on click and opens their source on double-click", () => {
    vi.useFakeTimers()
    try {
      const { card, onOpen, onSelect } = setup(2)
      onOpen.mockClear()
      onSelect.mockClear()

      button(card.element, "Select App; double-click to open source").click()
      expect(card.selectedLayer()).toBe(layers[2])
      vi.advanceTimersByTime(199)
      expect(card.selectedLayer()).toBe(layers[2])
      vi.advanceTimersByTime(1)
      expect(card.selectedLayer()).toBe(layers[0])
      expect(onSelect).toHaveBeenCalledWith(layers[0], 0)
      expect(onOpen).not.toHaveBeenCalled()

      button(card.element, "Next component").click()
      expect(card.selectedLayer()).toBe(layers[1])
      onSelect.mockClear()
      button(
        card.element,
        "Select Panel; double-click to open source",
      ).dispatchEvent(
        new MouseEvent("dblclick", {
          bubbles: true,
          detail: 2,
        }),
      )
      expect(card.selectedLayer()).toBe(layers[1])
      expect(onSelect).not.toHaveBeenCalled()
      expect(onOpen).toHaveBeenCalledOnce()
      expect(onOpen).toHaveBeenCalledWith(layers[1])
    } finally {
      vi.useRealTimers()
    }
  })

  it("collapses the owner stack to the selected component", () => {
    const { card } = setup(1)

    button(card.element, "Collapse component stack").click()
    expect(
      Array.from(
        card.element.querySelectorAll(".maximal-react-component-name-link"),
      ).map((entry) => entry.textContent),
    ).toEqual(["Panel"])
    expect(
      button(card.element, "Expand component stack").getAttribute(
        "aria-expanded",
      ),
    ).toBe("false")

    button(card.element, "Next component").click()
    expect(
      card.element.querySelector(".maximal-react-component-name-link")
        ?.textContent,
    ).toBe("button")
    button(card.element, "Expand component stack").click()
    expect(
      card.element.querySelectorAll(".maximal-react-component-name-link"),
    ).toHaveLength(3)
  })

  it("previews and selects each name's tool data and boundary", () => {
    verifyNameToolPreview()
  })

  it("reports selection changes and toggles compact preview mode", () => {
    const { card, onSelect } = setup()

    expect(onSelect).toHaveBeenCalledWith(layers[0], 0)
    expect(card.selectedLayer()).toBe(layers[0])
    expect(card.moveBy(1)).toBe(true)
    expect(card.selectedLayer()).toBe(layers[1])
    expect(onSelect).toHaveBeenLastCalledWith(layers[1], 1)
    expect(card.moveBy(-2)).toBe(false)
    const selectionCalls = onSelect.mock.calls.length
    expect(card.moveBy(0)).toBe(false)
    expect(onSelect).toHaveBeenCalledTimes(selectionCalls)

    card.setMode("preview")
    expect(card.element.dataset["mode"]).toBe("preview")
    card.setMode("full")
    expect(card.element.dataset["mode"]).toBe("full")
  })

  it("rejects empty stacks and indexes outside the stack", () => {
    const { card } = setup()

    expect(() => card.setLayers([])).toThrow(
      "The inspector card requires at least one layer",
    )
    expect(() => card.setLayers(layers, -1)).toThrow(
      "The inspector card index is outside the stack",
    )
    expect(() => card.setLayers(layers, layers.length)).toThrow(
      "The inspector card index is outside the stack",
    )
  })
})

describe("expanded inspector card", () => {
  it("expands into the icon tool views", () => {
    const { card, onInspectEnd, onSelect } = setup(1)

    button(card.element, "Toggle inspector tools").click()

    expect(card.element.dataset["expanded"]).toBe("true")
    const inspectionEndCalls = onInspectEnd.mock.calls.length
    card.setExpanded(true)
    expect(onInspectEnd).toHaveBeenCalledTimes(inspectionEndCalls)
    expect(
      Array.from(
        card.element.querySelectorAll<HTMLButtonElement>("[role='tab']"),
      ).map((tab) => tab.getAttribute("aria-label")),
    ).toEqual(["CSS", "Box"])
    button(card.element, "Next component").click()
    expect(onSelect).toHaveBeenLastCalledWith(layers[2], 2)
    expect(card.selectedLayer()).toBe(layers[2])
    expect(
      Array.from(card.element.children).map((child) => child.className),
    ).toEqual([
      "maximal-react-component-header-controls",
      "maximal-react-component-selection",
      "maximal-react-component-view-panel",
      "maximal-react-component-actions",
      "maximal-react-component-resize-bottom",
      "maximal-react-component-resize-horizontal maximal-react-component-resize-left",
      "maximal-react-component-resize-horizontal maximal-react-component-resize-right",
    ])
    expect(
      card.element.querySelector(".maximal-react-component-view-tabs")
        ?.parentElement?.className,
    ).toBe("maximal-react-component-actions")

    button(card.element, "Toggle inspector tools").click()
    expect(card.element.dataset["expanded"]).toBe("false")
    expect(card.selectedLayer()).toBe(layers[2])
  })

  it("switches between assigned, computed, and box-model tools", () => {
    const target = document.createElement("div")
    target.className = "tool-target"
    target.style.marginTop = "12px"
    target.getBoundingClientRect = () =>
      ({ height: 100, width: 200 }) as DOMRect
    const style = document.createElement("style")
    style.dataset["viteDevId"] = "/workspace/maximal/src/tool.css"
    style.textContent = ".tool-target { color: red; }"
    document.head.append(style)
    document.body.append(target)
    const { card, onInspectTarget, onOpenPath } = setup()
    card.setLayers([{ ...layers[0], target }])

    card.setView("css")
    expect(card.element.textContent).toContain("Assigned")
    expect(card.element.textContent).toContain("margin-top")
    const source = card.element.querySelector<HTMLButtonElement>(
      ".maximal-react-component-source-link",
    )
    source?.click()
    expect(onOpenPath).toHaveBeenCalledWith(
      "/workspace/maximal/src/tool.css:1:1",
    )
    Array.from(
      card.element.querySelectorAll<HTMLButtonElement>(
        ".maximal-react-component-mode-button",
      ),
    )
      .find((candidate) => candidate.textContent === "Computed")
      ?.click()
    expect(card.element.textContent).toContain("display")

    card.setView("box")
    expect(
      card.element.querySelector(".box-margin")?.getAttribute("data-label"),
    ).toContain("margin ·")
    expect(onInspectTarget).toHaveBeenLastCalledWith(target, true)
  })
})

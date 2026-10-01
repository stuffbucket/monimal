import { afterEach, describe, expect, it, vi } from "vitest"

import type { ComponentLayer } from "../src/types.js"

import {
  createInspectorView,
  type InspectorView,
} from "../src/inspector-view.js"

function visibleBox(width: number, height: number): DOMRect {
  return {
    bottom: height,
    height,
    left: 0,
    right: width,
    top: 0,
    width,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }
}

function setup() {
  const target = document.createElement("main")
  target.className = "target"
  target.style.cssText = "color: red; margin: 4px; padding: 8px;"
  target.getBoundingClientRect = () => visibleBox(200, 100)
  const child = document.createElement("span")
  child.className = "child"
  child.getBoundingClientRect = () => visibleBox(40, 20)
  const grandchild = document.createElement("em")
  grandchild.className = "leaf"
  grandchild.getBoundingClientRect = () => visibleBox(20, 10)
  child.append(grandchild)
  target.append(child)
  document.body.append(target)
  const onInspectEnd = vi.fn()
  const onInspectTarget = vi.fn()
  const onOpenPath = vi.fn()
  const controller = createInspectorView({
    document,
    root: "/workspace/maximal",
    window: globalThis.window,
    onInspectEnd,
    onInspectTarget,
    onOpenPath,
  })
  const layers: Array<ComponentLayer> = [
    { name: "App", path: "/workspace/maximal/App.tsx:1:1", target },
    { name: "main", path: "/workspace/maximal/Main.tsx:2:1", target },
  ]
  controller.update(layers, 1)
  return {
    child,
    controller,
    grandchild,
    layers,
    onInspectEnd,
    onInspectTarget,
    onOpenPath,
    target,
  }
}

function selectView(
  toolbar: HTMLElement,
  view: InspectorView,
): HTMLButtonElement {
  const tab = Array.from(toolbar.querySelectorAll("button")).find(
    (candidate) => candidate.dataset["view"] === view,
  )
  if (!tab) throw new Error(`Missing ${view} tab`)
  tab.click()
  return tab
}

afterEach(() => {
  document.head.replaceChildren()
  document.body.replaceChildren()
})

const expectedViewTabs = [
  [
    "button",
    "maximal-react-component-view-tab",
    "tab",
    "true",
    "css",
    "CSS",
    "",
    "0 0 24 24",
    "M8 9l-3 3 3 3m8-6 3 3-3 3M14 5l-4 14",
  ],
  [
    "button",
    "maximal-react-component-view-tab",
    "tab",
    "false",
    "box",
    "Box",
    "",
    "0 0 24 24",
    "M3 3h18v18H3zM8 8h8v8H8z",
  ],
] as const

describe("inspector tool views", () => {
  it("renders and selects every tool tab", () => {
    const { controller, onInspectEnd } = setup()
    const tabs = Array.from(controller.toolbar.querySelectorAll("button"))

    expect(controller.toolbar.className).toBe(
      "maximal-react-component-view-tabs",
    )
    expect(controller.toolbar.getAttribute("role")).toBe("tablist")
    expect(tabs.map((tab) => tab.getAttribute("aria-label"))).toEqual([
      "CSS",
      "Box",
    ])
    expect(
      tabs.map((tab) => [
        tab.type,
        tab.className,
        tab.getAttribute("role"),
        tab.getAttribute("aria-selected"),
        tab.dataset["view"],
        tab.title,
        tab.textContent,
        tab.querySelector("svg")?.getAttribute("viewBox"),
        tab.querySelector("path")?.getAttribute("d"),
      ]),
    ).toEqual(expectedViewTabs)

    const box = selectView(controller.toolbar, "box")
    expect(box.getAttribute("aria-selected")).toBe("true")
    expect(tabs[0].getAttribute("aria-selected")).toBe("false")
    expect(onInspectEnd).toHaveBeenCalled()
  })

  it("renders effective CSS rows and toggles the computed list", () => {
    const { controller } = setup()
    selectView(controller.toolbar, "css")
    const modes = Array.from(
      controller.panel.querySelectorAll<HTMLButtonElement>(
        ".maximal-react-component-mode-button",
      ),
    )

    expect(modes.map((mode) => mode.textContent)).toEqual([
      "Assigned",
      "Computed",
    ])
    expect(modes.map((mode) => mode.dataset["active"])).toEqual([
      "true",
      "false",
    ])
    expect(controller.panel.textContent).toContain("colorred")
    const inlineSource = Array.from(
      controller.panel.querySelectorAll(".maximal-react-component-css-row"),
    ).find((row) => row.textContent.startsWith("colorred"))
    if (!inlineSource) throw new Error("Expected inline color declaration")
    expect(inlineSource.lastElementChild?.tagName).toBe("SPAN")
    expect(inlineSource.lastElementChild?.textContent).toBe("element.style")
    expect(
      inlineSource.querySelector(".maximal-react-component-source-link"),
    ).toBeNull()
    modes[1].click()
    expect(modes[1].isConnected).toBe(false)
    const nextModes = Array.from(
      controller.panel.querySelectorAll<HTMLButtonElement>(
        ".maximal-react-component-mode-button",
      ),
    )
    expect(nextModes.map((mode) => mode.dataset["active"])).toEqual([
      "false",
      "true",
    ])
    expect(
      controller.panel.querySelectorAll(".maximal-react-component-css-row")
        .length,
    ).toBeGreaterThan(10)
  })
})

describe("inspector CSS view state", () => {
  it("restores scroll positions for every owner and CSS mode", () => {
    const { controller, layers } = setup()
    controller.setView("css")
    controller.panel.scrollTop = 41

    controller.panel
      .querySelector<HTMLButtonElement>(
        ".maximal-react-component-mode-button:nth-child(2)",
      )
      ?.click()
    expect(controller.panel.scrollTop).toBe(0)
    controller.panel.scrollTop = 87

    controller.update(layers, 0)
    expect(controller.panel.scrollTop).toBe(0)
    controller.panel.scrollTop = 23
    controller.update(layers, 1)
    expect(controller.panel.scrollTop).toBe(87)

    controller.panel
      .querySelector<HTMLButtonElement>(
        ".maximal-react-component-mode-button:first-child",
      )
      ?.click()
    expect(controller.panel.scrollTop).toBe(41)
    controller.update(layers, 0)
    expect(controller.panel.scrollTop).toBe(0)
    controller.panel.scrollTop = 12
    controller.update(layers, 1)
    expect(controller.panel.scrollTop).toBe(41)
    controller.update(layers, 0)
    expect(controller.panel.scrollTop).toBe(12)
  })
})

describe("inspector tool details", () => {
  it("renders a nested box diagram with exact edge and content labels", () => {
    const { controller, onInspectEnd, onInspectTarget, target } = setup()
    onInspectEnd.mockClear()
    controller.setView("box")

    const margin = controller.panel.querySelector<HTMLElement>(".box-margin")
    const border = controller.panel.querySelector<HTMLElement>(".box-border")
    const padding = controller.panel.querySelector<HTMLElement>(".box-padding")
    const content = controller.panel.querySelector<HTMLElement>(
      ".maximal-react-component-box-content",
    )
    expect(margin?.className).toBe(
      "maximal-react-component-box-layer box-margin",
    )
    expect(margin?.parentElement?.className).toBe(
      "maximal-react-component-box-model",
    )
    expect(margin?.dataset["label"]).toBe("margin · 4 4 4 4")
    expect(border?.dataset["label"]).toBe("border · 0 0 0 0")
    expect(padding?.dataset["label"]).toBe("padding · 8 8 8 8")
    expect(content?.textContent).toBe("184.0 × 84.0")
    expect(margin?.firstElementChild).toBe(border)
    expect(border?.firstElementChild).toBe(padding)
    expect(padding?.firstElementChild).toBe(content)
    expect(onInspectTarget).toHaveBeenCalledWith(target, true)
    expect(onInspectEnd).toHaveBeenCalledOnce()
    expect(
      Array.from(
        controller.toolbar.querySelectorAll<HTMLButtonElement>("[role='tab']"),
      ).map((tab) => tab.getAttribute("aria-selected")),
    ).toEqual(["false", "true"])
  })

  it("warns when assigned stylesheets are inaccessible", () => {
    const { controller } = setup()
    const style = document.createElement("style")
    document.head.append(style)
    const sheet = style.sheet
    if (!sheet) throw new Error("Expected a stylesheet")
    Object.defineProperty(sheet, "cssRules", {
      configurable: true,
      get: () => {
        throw new DOMException("Blocked", "SecurityError")
      },
    })
    controller.setView("css")

    const warning = controller.panel.querySelector<HTMLElement>(
      ".maximal-react-component-view-warning",
    )
    expect(warning?.tagName).toBe("P")
    expect(warning?.className).toBe("maximal-react-component-view-warning")
    expect(warning?.textContent).toBe(
      "1 cross-origin stylesheet(s) unavailable",
    )
  })

  it("renders an explicit message when a layer has no host element", () => {
    const { controller } = setup()
    controller.update(
      [{ name: "Fragment", path: "/workspace/maximal/Fragment.tsx:1:1" }],
      0,
    )
    controller.setView("box")

    expect(controller.panel.textContent).toBe(
      "No host element is available for this layer.",
    )
  })
})

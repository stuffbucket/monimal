import { afterEach, describe, expect, it, vi } from "vitest"

import type { ComponentLayer } from "../src/types.js"

import {
  EXPANDED_STACK_ICON,
  installComponentInteractions,
  installComponentNameInteractions,
  installComponentStackToggle,
  renderComponentNames,
} from "../src/component-name-stack.js"

const layers: ReadonlyArray<ComponentLayer> = [
  { name: "App", path: "/workspace/App.tsx:1:1" },
  { name: "Panel", path: "/workspace/Panel.tsx:2:1" },
]
const deepLayers: ReadonlyArray<ComponentLayer> = [
  ...layers,
  { name: "Section", path: "/workspace/Section.tsx:3:1" },
  { name: "Button", path: "/workspace/Button.tsx:4:1" },
]

function click(target: EventTarget, detail = 0): void {
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail }))
}

function doubleClick(target: EventTarget): void {
  target.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, detail: 2 }))
}

afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
})

describe("component name stack", () => {
  it("renders plain, indexed, accessible component names", () => {
    const container = document.createElement("div")
    renderComponentNames(container, layers, {
      expanded: true,
      selectedIndex: 1,
    })

    expect(container.title).toBe("App › Panel")
    expect(
      Array.from(container.querySelectorAll("button")).map((entry) => ({
        active: entry.dataset["active"],
        index: entry.dataset["layerIndex"],
        label: entry.getAttribute("aria-label"),
        padding: entry.style.paddingLeft,
        text: entry.textContent,
        type: entry.type,
      })),
    ).toEqual([
      {
        active: "false",
        index: "0",
        label: "Select App; double-click to open source",
        padding: "0px",
        text: "App",
        type: "button",
      },
      {
        active: "true",
        index: "1",
        label: "Select Panel; double-click to open source",
        padding: "10px",
        text: "Panel",
        type: "button",
      },
    ])

    renderComponentNames(container, layers, {
      expanded: false,
      selectedIndex: 1,
    })
    const collapsed = container.querySelector("button")
    expect(container.querySelectorAll("button")).toHaveLength(1)
    expect(collapsed?.textContent).toBe("Panel")
    expect(collapsed?.dataset["active"]).toBe("true")
    expect(collapsed?.dataset["layerIndex"]).toBe("1")
    expect(collapsed?.style.paddingLeft).toBe("0px")
    expect(container.title).toBe("App › Panel")
  })

  it("shows the selected component and at most two parents", () => {
    const container = document.createElement("div")
    renderComponentNames(container, deepLayers, {
      expanded: true,
      selectedIndex: 3,
    })

    expect(
      Array.from(container.querySelectorAll("button")).map((entry) => ({
        index: entry.dataset["layerIndex"],
        padding: entry.style.paddingLeft,
        text: entry.textContent,
      })),
    ).toEqual([
      { index: "1", padding: "0px", text: "Panel" },
      { index: "2", padding: "10px", text: "Section" },
      { index: "3", padding: "20px", text: "Button" },
    ])
    expect(container.title).toBe("App › Panel › Section › Button")
  })

  it("selects only the final single-click after the double-click delay", () => {
    vi.useFakeTimers()
    const windowObject = globalThis.window
    const container = document.createElement("div")
    renderComponentNames(container, layers, {
      expanded: true,
      selectedIndex: 1,
    })
    const select = vi.fn(() => true)
    const preview = vi.fn()
    const previewEnd = vi.fn()
    const dispose = installComponentNameInteractions(container, {
      layer: (index) => layers[index],
      open: vi.fn(),
      preview,
      previewEnd,
      select,
      window: windowObject,
    })
    const entries = container.querySelectorAll("button")

    entries[1].dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
    expect(preview).toHaveBeenCalledWith(1)
    entries[1].dispatchEvent(new MouseEvent("mouseout", { bubbles: true }))
    expect(previewEnd).toHaveBeenCalledOnce()
    click(entries[0])
    vi.advanceTimersByTime(100)
    click(entries[1])
    vi.advanceTimersByTime(199)
    expect(select).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(select).toHaveBeenCalledOnce()
    expect(select).toHaveBeenCalledWith(1)
    dispose()
  })

  it("opens the exact double-clicked layer without a delayed selection", () => {
    vi.useFakeTimers()
    const windowObject = globalThis.window
    const container = document.createElement("div")
    renderComponentNames(container, layers, {
      expanded: true,
      selectedIndex: 1,
    })
    const open = vi.fn()
    const select = vi.fn(() => true)
    const dispose = installComponentNameInteractions(container, {
      layer: (index) => layers[index],
      open,
      preview: vi.fn(),
      previewEnd: vi.fn(),
      select,
      window: windowObject,
    })
    const panel = container.querySelectorAll("button")[1]

    click(panel, 1)
    click(panel, 2)
    doubleClick(panel)
    expect(select).toHaveBeenCalledOnce()
    expect(select).toHaveBeenCalledWith(1)
    expect(open).toHaveBeenCalledOnce()
    expect(open).toHaveBeenCalledWith(layers[1])
    vi.runAllTimers()
    expect(select).toHaveBeenCalledOnce()
    dispose()
  })

  it("ignores non-name targets and cancels pending work on disposal", () => {
    vi.useFakeTimers()
    const windowObject = globalThis.window
    const container = document.createElement("div")
    renderComponentNames(container, layers, {
      expanded: true,
      selectedIndex: 1,
    })
    const open = vi.fn()
    const select = vi.fn(() => true)
    const dispose = installComponentNameInteractions(container, {
      layer: (index) => layers[index],
      open,
      preview: vi.fn(),
      previewEnd: vi.fn(),
      select,
      window: windowObject,
    })
    const app = container.querySelector("button")
    if (!app?.firstChild) throw new Error("Expected rendered App name")

    click(container)
    doubleClick(container)
    click(app.firstChild)
    click(app)
    dispose()
    vi.runAllTimers()
    click(app)
    doubleClick(app)
    vi.runAllTimers()
    expect(select).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
  })
})

describe("component stack controls", () => {
  it("toggles stack semantics and stops responding after disposal", () => {
    const toggle = document.createElement("button")
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    svg.append(path)
    toggle.append(svg)
    const onExpandedChange = vi.fn()
    const dispose = installComponentStackToggle(toggle, onExpandedChange)

    toggle.click()
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(toggle.getAttribute("aria-label")).toBe("Expand component stack")
    expect(path.getAttribute("d")).toBe("m9 18 6-6-6-6")
    expect(onExpandedChange).toHaveBeenLastCalledWith(false)

    toggle.click()
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(toggle.getAttribute("aria-label")).toBe("Collapse component stack")
    expect(path.getAttribute("d")).toBe(EXPANDED_STACK_ICON)
    expect(onExpandedChange).toHaveBeenLastCalledWith(true)

    dispose()
    toggle.click()
    expect(onExpandedChange).toHaveBeenCalledTimes(2)
  })

  it("disposes both owner-name and stack-toggle interactions", () => {
    vi.useFakeTimers()
    const container = document.createElement("div")
    const toggle = document.createElement("button")
    toggle.append(
      document.createElementNS("http://www.w3.org/2000/svg", "path"),
    )
    renderComponentNames(container, layers, {
      expanded: true,
      selectedIndex: 1,
    })
    const onOpen = vi.fn()
    const onPreview = vi.fn()
    const onPreviewEnd = vi.fn()
    const onStackExpanded = vi.fn()
    const select = vi.fn(() => true)
    const dispose = installComponentInteractions({
      layer: (index) => layers[index],
      name: container,
      onOpen,
      onPreview,
      onPreviewEnd,
      onStackExpanded,
      select,
      stackToggle: toggle,
      window: globalThis.window,
    })

    dispose()
    const panel = container.querySelectorAll("button")[1]
    click(panel)
    doubleClick(panel)
    panel.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
    panel.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }))
    toggle.click()
    vi.runAllTimers()

    expect(select).not.toHaveBeenCalled()
    expect(onOpen).not.toHaveBeenCalled()
    expect(onPreview).not.toHaveBeenCalled()
    expect(onPreviewEnd).not.toHaveBeenCalled()
    expect(onStackExpanded).not.toHaveBeenCalled()
  })
})

import { describe, expect, it, vi } from "vitest"

import type {
  InspectorView,
  InspectorViewController,
} from "../src/inspector-view.js"
import type { ComponentLayer } from "../src/types.js"

import { createCardRendering } from "../src/card-rendering.js"

function setup(view: InspectorView, target?: HTMLElement) {
  const count = document.createElement("output")
  const location = document.createElement("div")
  const name = document.createElement("div")
  const next = document.createElement("button")
  const previous = document.createElement("button")
  const layers: ReadonlyArray<ComponentLayer> = [
    { name: "App", path: "/workspace/src/App.tsx:1:1" },
    {
      name: "Panel",
      path: "/workspace/src/Panel.tsx:2:3",
      ...(target ? { target } : {}),
    },
  ]
  const update = vi.fn()
  const inspectorView: InspectorViewController = {
    currentView: () => view,
    panel: document.createElement("div"),
    setView: vi.fn(),
    toolbar: document.createElement("div"),
    update,
  }
  const onInspectTarget = vi.fn()
  const rendering = createCardRendering({
    count,
    inspectorView,
    layers: () => layers,
    location,
    name,
    next,
    onInspectTarget,
    previous,
    root: "/workspace",
    selectedIndex: () => 1,
    stackExpanded: () => true,
  })
  return {
    count,
    layers,
    location,
    name,
    next,
    onInspectTarget,
    previous,
    rendering,
    update,
  }
}

describe("card rendering", () => {
  it("renders the selected owner and previews its boundary outside Box view", () => {
    const target = document.createElement("section")
    const values = setup("css", target)

    values.rendering.render()

    expect(values.location.textContent).toBe("src/Panel.tsx:2:3")
    expect(values.location.title).toBe("/workspace/src/Panel.tsx:2:3")
    expect(values.count.textContent).toBe("2 / 2")
    expect(values.previous.disabled).toBe(false)
    expect(values.next.disabled).toBe(true)
    expect(
      Array.from(values.name.querySelectorAll("button")).map(
        (button) => button.textContent,
      ),
    ).toEqual(["App", "Panel"])
    expect(values.update).toHaveBeenCalledOnce()
    expect(values.update).toHaveBeenCalledWith(values.layers, 1)
    expect(values.onInspectTarget).toHaveBeenCalledOnce()
    expect(values.onInspectTarget).toHaveBeenCalledWith(target, true)
  })

  it.each([
    ["box", document.createElement("section")],
    ["box", undefined],
    ["css", undefined],
  ] as const)(
    "does not request a duplicate boundary for %s view with target %s",
    (view, target) => {
      const values = setup(view, target)

      values.rendering.renderContext(1)

      expect(values.update).toHaveBeenCalledWith(values.layers, 1)
      expect(values.onInspectTarget).not.toHaveBeenCalled()
    },
  )
})

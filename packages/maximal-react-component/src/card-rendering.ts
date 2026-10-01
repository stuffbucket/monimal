import type { InspectorViewController } from "./inspector-view.js"
import type { ComponentLayer } from "./types.js"

import { renderComponentNames } from "./component-name-stack.js"

export function createCardRendering(options: {
  count: HTMLOutputElement
  inspectorView: InspectorViewController
  layers: () => ReadonlyArray<ComponentLayer>
  location: HTMLElement
  name: HTMLElement
  next: HTMLButtonElement
  onInspectTarget: (target: HTMLElement, boxModel: boolean) => void
  previous: HTMLButtonElement
  root: string
  selectedIndex: () => number
  stackExpanded: () => boolean
}): { render: () => void; renderContext: (index: number) => void } {
  const renderContext = (index: number): void => {
    const layers = options.layers()
    const layer = layers[index]
    options.location.textContent = layer.path.replace(`${options.root}/`, "")
    options.location.title = layer.path
    options.count.textContent = `${String(index + 1)} / ${String(layers.length)}`
    options.inspectorView.update(layers, index)
    if (options.inspectorView.currentView() !== "box" && layer.target) {
      options.onInspectTarget(layer.target, true)
    }
  }
  return {
    render: () => {
      const layers = options.layers()
      const index = options.selectedIndex()
      renderComponentNames(options.name, layers, {
        expanded: options.stackExpanded(),
        selectedIndex: index,
      })
      options.previous.disabled = index === 0
      options.next.disabled = index === layers.length - 1
      renderContext(index)
    },
    renderContext,
  }
}

import type { ComponentLayer } from "./types.js"

import { createIcon } from "./icon.js"
import {
  assignedCssValues,
  boxModelForElement,
  computedCssValues,
  type BoxEdges,
  type CssValue,
} from "./inspector-data.js"

export type InspectorView = "box" | "css"

interface InspectorViewOptions {
  document: Document
  onInspectEnd: () => void
  onInspectTarget: (target: HTMLElement, boxModel: boolean) => void
  onOpenPath: (path: string) => void
  root: string
  window: Window
}

export interface InspectorViewController {
  currentView: () => InspectorView
  panel: HTMLElement
  setView: (view: InspectorView) => void
  toolbar: HTMLElement
  update: (layers: ReadonlyArray<ComponentLayer>, selectedIndex: number) => void
}

const viewLabels: Record<InspectorView, string> = {
  css: "CSS",
  box: "Box",
}

const viewIcons: Record<InspectorView, string> = {
  css: "M8 9l-3 3 3 3m8-6 3 3-3 3M14 5l-4 14",
  box: "M3 3h18v18H3zM8 8h8v8H8z",
}

function createButton(
  documentObject: Document,
  label: string,
  className: string,
): HTMLButtonElement {
  const button = documentObject.createElement("button")
  button.type = "button"
  button.className = className
  button.textContent = label
  return button
}

function edgeText(edges: BoxEdges): string {
  return `${String(edges.top)} ${String(edges.right)} ${String(edges.bottom)} ${String(edges.left)}`
}

function renderBoxModel(
  documentObject: Document,
  target: HTMLElement,
  windowObject: Window,
): HTMLElement {
  const model = boxModelForElement(target, windowObject)
  const diagram = documentObject.createElement("div")
  diagram.className = "maximal-react-component-box-model"

  const margin = documentObject.createElement("div")
  margin.className = "maximal-react-component-box-layer box-margin"
  margin.dataset["label"] = `margin · ${edgeText(model.margin)}`
  const border = documentObject.createElement("div")
  border.className = "maximal-react-component-box-layer box-border"
  border.dataset["label"] = `border · ${edgeText(model.border)}`
  const padding = documentObject.createElement("div")
  padding.className = "maximal-react-component-box-layer box-padding"
  padding.dataset["label"] = `padding · ${edgeText(model.padding)}`
  const content = documentObject.createElement("div")
  content.className = "maximal-react-component-box-content"
  content.textContent = `${model.content.width.toFixed(1)} × ${model.content.height.toFixed(1)}`
  padding.append(content)
  border.append(padding)
  margin.append(border)
  diagram.append(margin)
  return diagram
}

function renderCssRows(
  documentObject: Document,
  values: ReadonlyArray<CssValue>,
  onOpenPath: (path: string) => void,
): DocumentFragment {
  const fragment = documentObject.createDocumentFragment()
  for (const value of values) {
    const row = documentObject.createElement("div")
    row.className = "maximal-react-component-css-row"
    const property = documentObject.createElement("code")
    property.textContent = value.property
    const propertyValue = documentObject.createElement("code")
    propertyValue.textContent = value.value
    row.append(property, propertyValue)
    const sourceValue = value.source
    if (sourceValue) {
      const sourcePath = sourceValue.path
      if (sourcePath) {
        const source = createButton(
          documentObject,
          sourceValue.label,
          "maximal-react-component-source-link",
        )
        source.addEventListener("click", () => onOpenPath(sourcePath))
        row.append(source)
      } else {
        const source = documentObject.createElement("span")
        source.textContent = sourceValue.label
        row.append(source)
      }
    }
    fragment.append(row)
  }
  return fragment
}

interface ViewRenderContext {
  options: InspectorViewOptions
  panel: HTMLElement
  render: () => void
  state: {
    cssMode: "assigned" | "computed"
    cssScrollPositions: Map<string, number>
    layers: ReadonlyArray<ComponentLayer>
    renderedCssKey: string | undefined
    selectedIndex: number
    view: InspectorView
  }
}

function cssScrollKey(
  layer: ComponentLayer,
  index: number,
  mode: "assigned" | "computed",
): string {
  return `${String(index)}:${layer.path}:${mode}`
}

function renderCss(
  context: ViewRenderContext,
  selection: {
    index: number
    layer: ComponentLayer
    target: HTMLElement
  },
): void {
  const { document: documentObject } = context.options
  const modes = documentObject.createElement("div")
  modes.className = "maximal-react-component-css-modes"
  for (const mode of ["assigned", "computed"] as const) {
    const button = createButton(
      documentObject,
      mode === "assigned" ? "Assigned" : "Computed",
      "maximal-react-component-mode-button",
    )
    button.dataset["active"] = String(context.state.cssMode === mode)
    button.addEventListener("click", () => {
      context.state.cssMode = mode
      context.render()
    })
    modes.append(button)
  }
  context.panel.append(modes)
  const values =
    context.state.cssMode === "assigned" ?
      assignedCssValues(selection.target, documentObject, context.options.root)
    : {
        inaccessibleStyleSheets: 0,
        values: computedCssValues(selection.target, context.options.window),
      }
  if (values.inaccessibleStyleSheets > 0) {
    const warning = documentObject.createElement("p")
    warning.className = "maximal-react-component-view-warning"
    warning.textContent = `${String(values.inaccessibleStyleSheets)} cross-origin stylesheet(s) unavailable`
    context.panel.append(warning)
  }
  context.panel.append(
    renderCssRows(documentObject, values.values, (path) =>
      context.options.onOpenPath(path),
    ),
  )
  const scrollKey = cssScrollKey(
    selection.layer,
    selection.index,
    context.state.cssMode,
  )
  context.state.renderedCssKey = scrollKey
  context.panel.scrollTop = context.state.cssScrollPositions.get(scrollKey) ?? 0
}

export function createInspectorView(
  options: InspectorViewOptions,
): InspectorViewController {
  const { document: documentObject } = options
  const toolbar = documentObject.createElement("div")
  toolbar.className = "maximal-react-component-view-tabs"
  toolbar.setAttribute("role", "tablist")
  const panel = documentObject.createElement("div")
  panel.className = "maximal-react-component-view-panel"
  const state: ViewRenderContext["state"] = {
    cssMode: "assigned",
    cssScrollPositions: new Map(),
    layers: [],
    renderedCssKey: undefined,
    selectedIndex: 0,
    view: "css",
  }
  const render = (): void => {
    if (state.renderedCssKey !== undefined) {
      state.cssScrollPositions.set(state.renderedCssKey, panel.scrollTop)
    }
    state.renderedCssKey = undefined
    panel.replaceChildren()
    const context = { options, panel, render, state }
    const selectedLayer = state.layers[state.selectedIndex]
    const selectedTarget = selectedLayer.target
    if (!selectedTarget) {
      panel.textContent = "No host element is available for this layer."
      return
    }
    if (state.view === "box") {
      panel.append(
        renderBoxModel(documentObject, selectedTarget, options.window),
      )
      options.onInspectTarget(selectedTarget, true)
      return
    }
    renderCss(context, {
      index: state.selectedIndex,
      layer: selectedLayer,
      target: selectedTarget,
    })
  }

  for (const candidate of ["css", "box"] as const) {
    const button = createButton(
      documentObject,
      "",
      "maximal-react-component-view-tab",
    )
    button.setAttribute("role", "tab")
    button.dataset["view"] = candidate
    button.setAttribute("aria-label", viewLabels[candidate])
    button.title = viewLabels[candidate]
    button.append(createIcon(documentObject, viewIcons[candidate]))
    button.addEventListener("click", () => {
      state.view = candidate
      for (const tab of toolbar.querySelectorAll<HTMLElement>("[role='tab']")) {
        tab.setAttribute(
          "aria-selected",
          String(tab.dataset["view"] === state.view),
        )
      }
      options.onInspectEnd()
      render()
    })
    button.setAttribute("aria-selected", String(candidate === state.view))
    toolbar.append(button)
  }

  return {
    currentView: () => state.view,
    panel,
    setView: (nextView) => {
      state.view = nextView
      for (const tab of toolbar.querySelectorAll<HTMLElement>("[role='tab']")) {
        tab.setAttribute(
          "aria-selected",
          String(tab.dataset["view"] === state.view),
        )
      }
      options.onInspectEnd()
      render()
    },
    toolbar,
    update: (nextLayers, nextSelectedIndex) => {
      state.layers = nextLayers
      state.selectedIndex = nextSelectedIndex
      options.onInspectEnd()
      render()
    },
  }
}

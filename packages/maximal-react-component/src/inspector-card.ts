import type { ComponentLayer } from "./types.js"

import { boxOverlayStyles } from "./box-overlay.js"
import { installCardGeometry } from "./card-geometry.js"
import { createCardRendering } from "./card-rendering.js"
import {
  EXPANDED_STACK_ICON,
  installComponentInteractions,
} from "./component-name-stack.js"
import { INSPECTOR_CARD_Z_INDEX } from "./constants.js"
import { inspectorTokens as token } from "./generated/inspector-tokens.js"
import { createIcon } from "./icon.js"
import {
  createInspectorView,
  type InspectorView,
  type InspectorViewController,
} from "./inspector-view.js"

export const INSPECTOR_CARD_ID = "maximal-react-component-card"

const TARGET_ATTRIBUTE = "data-maximal-react-component-target"
const CONTROL_CLASS = "maximal-react-component-control"
const PREVIOUS_CLASS = "maximal-react-component-previous"
const NEXT_CLASS = "maximal-react-component-next"
const OPEN_CLASS = "maximal-react-component-open"
const STACK_TOGGLE_CLASS = "maximal-react-component-stack-toggle"
const TOOLS_CLASS = "maximal-react-component-tools"

const iconPath = {
  previous: "m15 18-6-6 6-6",
  next: "m9 18 6-6-6-6",
  open: "m18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6m4-3h6v6m-11 5L21 3",
  tools: "M4 7h10M4 17h16M14 7l2-2v4l-2-2M10 17l-2-2v4l2-2",
} as const

const standardEasing = `cubic-bezier(${token.motionEasingStandard.join(", ")})`
const emphasizedEasing = `cubic-bezier(${token.motionEasingEmphasized.join(", ")})`

export const inspectorStyles = `[${TARGET_ATTRIBUTE}] {
  outline: 2px solid ${token.colorAccent} !important;
  outline-offset: 2px !important;
  box-shadow: inset 0 0 0 1px rgb(110 168 254 / 0.55) !important;
  transition:
    outline-offset ${token.motionDurationFast} ${standardEasing},
    box-shadow ${token.motionDurationFast} ${standardEasing} !important;
}
#${INSPECTOR_CARD_ID} {
  all: initial;
  box-sizing: border-box !important;
  position: fixed !important;
  z-index: ${INSPECTOR_CARD_Z_INDEX};
  display: grid !important;
  grid-template-rows: auto auto minmax(0, 1fr) auto !important;
  width: min(${token.sizeCard}, calc(100vw - ${token.space4} * 2)) !important;
  max-width: calc(100vw - ${token.space4} * 2) !important;
  overflow: hidden !important;
  color: ${token.colorText} !important;
  background: ${token.colorSurface} !important;
  border: 1px solid ${token.colorBorder} !important;
  border-radius: ${token.radiusCard} !important;
  box-shadow: ${token.shadowCard} !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif !important;
  font-size: ${token.typeBody} !important;
  line-height: 1.4 !important;
  color-scheme: dark !important;
  transform: scale(1) !important;
  transform-origin: top left !important;
  transition:
    top ${token.motionDurationBase} ${emphasizedEasing},
    right ${token.motionDurationBase} ${emphasizedEasing},
    bottom ${token.motionDurationBase} ${emphasizedEasing},
    left ${token.motionDurationBase} ${emphasizedEasing},
    width ${token.motionDurationBase} ${emphasizedEasing},
    transform ${token.motionDurationBase} ${emphasizedEasing},
    border-radius ${token.motionDurationFast} ${standardEasing} !important;
}
#${INSPECTOR_CARD_ID}[data-expanded="true"] {
  height: min(${token.sizeExpanded}, calc(100vh - ${token.space4} * 2)) !important;
}
#${INSPECTOR_CARD_ID}[data-interacting] {
  transition: none !important;
}
#${INSPECTOR_CARD_ID}[data-interacting="drag"] {
  cursor: grabbing !important;
}
#${INSPECTOR_CARD_ID} .maximal-react-component-grabber,
#${INSPECTOR_CARD_ID} .maximal-react-component-resize-bottom,
#${INSPECTOR_CARD_ID} .maximal-react-component-resize-horizontal {
  position: absolute !important;
  z-index: 2 !important;
  right: 0 !important;
  left: 0 !important;
  height: ${token.sizeGrabber} !important;
  cursor: ns-resize !important;
}
#${INSPECTOR_CARD_ID} .maximal-react-component-grabber {
  top: 0 !important;
}
#${INSPECTOR_CARD_ID} .maximal-react-component-header-controls {
  position: relative !important;
  height: ${token.sizeGrabber} !important;
  min-height: ${token.sizeGrabber} !important;
}
#${INSPECTOR_CARD_ID} .maximal-react-component-grabber::after {
  position: absolute !important;
  top: ${token.space2} !important;
  left: 50% !important;
  width: 36px !important;
  height: 3px !important;
  border-radius: 999px !important;
  background: ${token.colorBorder} !important;
  content: "" !important;
  transform: translateX(-50%) !important;
}
#${INSPECTOR_CARD_ID} .maximal-react-component-resize-bottom {
  bottom: 0 !important;
  height: 6px !important;
}
#${INSPECTOR_CARD_ID} .maximal-react-component-resize-horizontal {
  top: 0 !important;
  bottom: 0 !important;
  width: 6px !important;
  height: auto !important;
  cursor: ew-resize !important;
}
#${INSPECTOR_CARD_ID} .maximal-react-component-resize-left {
  left: 0 !important;
  right: auto !important;
}
#${INSPECTOR_CARD_ID} .maximal-react-component-resize-right {
  right: 0 !important;
  left: auto !important;
}
#${INSPECTOR_CARD_ID},
#${INSPECTOR_CARD_ID} * {
  box-sizing: border-box !important;
  scrollbar-width: thin !important;
  scrollbar-color: ${token.colorBorder} transparent !important;
}
#${INSPECTOR_CARD_ID}:focus-visible {
  outline: 2px solid ${token.colorAccent} !important;
  outline-offset: 2px !important;
}
#${INSPECTOR_CARD_ID} .maximal-react-component-selection {
  display: grid !important;
  grid-template-columns: ${token.sizeIcon} minmax(0, 1fr) !important;
  position: relative !important;
  column-gap: ${token.space1} !important;
  min-width: 0 !important;
  padding: 0 ${token.space4} ${token.space3} !important;
}
#${INSPECTOR_CARD_ID} .maximal-react-component-name {
  display: flex !important;
  grid-column: 2 !important;
  flex-direction: column !important;
  align-items: flex-start !important;
  gap: ${token.space1} !important;
  max-height: min(240px, 35vh) !important;
  min-width: 0 !important;
  overflow: hidden !important;
  overflow-y: auto !important;
}
#${INSPECTOR_CARD_ID} .maximal-react-component-name-link {
  all: unset !important;
  box-sizing: border-box !important;
  display: inline-block !important;
  flex: 0 0 auto !important;
  min-width: 0 !important;
  color: ${token.colorTextMuted} !important;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace !important;
  font-size: ${token.typeLabel} !important;
  font-weight: 600 !important;
  line-height: 1.4 !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
  cursor: pointer !important;
  transition: color ${token.motionDurationFast} ${standardEasing} !important;
}
#${INSPECTOR_CARD_ID} .maximal-react-component-name-link[data-active="true"] {
  color: ${token.colorText} !important;
}
#${INSPECTOR_CARD_ID} .maximal-react-component-name-link:hover {
  color: ${token.colorAccent} !important;
}
#${INSPECTOR_CARD_ID} .maximal-react-component-name-link:focus-visible {
  outline: 2px solid ${token.colorAccent} !important;
  outline-offset: 2px !important;
  border-radius: ${token.radiusControl} !important;
}
#${INSPECTOR_CARD_ID} .maximal-react-component-location {
  display: block !important;
  grid-column: 2 !important;
  min-width: 0 !important;
  overflow: hidden !important;
  color: ${token.colorTextMuted} !important;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace !important;
  font-size: ${token.typeCaption} !important;
  line-height: 1.4 !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}
#${INSPECTOR_CARD_ID} .maximal-react-component-actions {
  display: flex !important;
  align-items: center !important;
  gap: ${token.space1} !important;
  min-width: 0 !important;
  padding: ${token.space2} !important;
  background: ${token.colorSurfaceRaised} !important;
  border-top: 1px solid ${token.colorBorder} !important;
}
#${INSPECTOR_CARD_ID} .${CONTROL_CLASS} {
  all: unset !important;
  box-sizing: border-box !important;
  display: inline-flex !important;
  flex: 0 0 auto !important;
  align-items: center !important;
  justify-content: center !important;
  min-width: ${token.sizeControl} !important;
  height: ${token.sizeControl} !important;
  padding: 0 ${token.space2} !important;
  color: ${token.colorTextMuted} !important;
  border-radius: ${token.radiusControl} !important;
  cursor: pointer !important;
  transition:
    color ${token.motionDurationFast} ${standardEasing},
    background-color ${token.motionDurationFast} ${standardEasing} !important;
}
#${INSPECTOR_CARD_ID} .${CONTROL_CLASS}:hover {
  color: ${token.colorText} !important;
  background: ${token.colorSurfaceHover} !important;
}
#${INSPECTOR_CARD_ID} .${CONTROL_CLASS}:focus-visible {
  outline: 2px solid ${token.colorAccent} !important;
  outline-offset: -2px !important;
}
#${INSPECTOR_CARD_ID} .${CONTROL_CLASS}:disabled {
  color: ${token.colorTextMuted} !important;
  cursor: default !important;
  opacity: 0.38 !important;
  background: transparent !important;
}
#${INSPECTOR_CARD_ID} .${STACK_TOGGLE_CLASS} {
  grid-column: 1 !important;
  grid-row: 1 !important;
  align-self: start !important;
  min-width: ${token.sizeIcon} !important;
  height: calc(${token.typeLabel} * 1.4) !important;
  padding: 0 !important;
}
#${INSPECTOR_CARD_ID} .${OPEN_CLASS} {
  margin-left: auto !important;
  padding: 0 ${token.space2} !important;
  color: ${token.colorAccentText} !important;
  background: ${token.colorAccent} !important;
  font-weight: 600 !important;
}
#${INSPECTOR_CARD_ID} .${OPEN_CLASS}:hover {
  color: ${token.colorAccentText} !important;
  background: ${token.colorAccent} !important;
  filter: brightness(1.08) !important;
}
#${INSPECTOR_CARD_ID} .maximal-react-component-count {
  min-width: 48px !important;
  color: ${token.colorText} !important;
  font-variant-numeric: tabular-nums !important;
  font-weight: 600 !important;
  text-align: center !important;
}
#${INSPECTOR_CARD_ID} .maximal-react-component-divider {
  width: 1px !important;
  height: 20px !important;
  margin: 0 ${token.space1} !important;
  background: ${token.colorBorder} !important;
}
#${INSPECTOR_CARD_ID} .maximal-react-component-view-tabs,
#${INSPECTOR_CARD_ID} .maximal-react-component-view-panel {
  display: none !important;
}
#${INSPECTOR_CARD_ID}[data-expanded="true"] .maximal-react-component-view-tabs {
  display: flex !important;
  gap: ${token.space1} !important;
  padding: 0 !important;
}
#${INSPECTOR_CARD_ID}[data-expanded="true"] .maximal-react-component-view-panel {
  display: block !important;
  min-height: 0 !important;
  overflow: auto !important;
  padding: ${token.space2} !important;
  border-top: 1px solid ${token.colorBorder} !important;
}
#${INSPECTOR_CARD_ID} .maximal-react-component-view-tab,
#${INSPECTOR_CARD_ID} .maximal-react-component-mode-button,
#${INSPECTOR_CARD_ID} .maximal-react-component-source-link {
  all: unset !important;
  box-sizing: border-box !important;
  border-radius: ${token.radiusControl} !important;
  cursor: pointer !important;
}
#${INSPECTOR_CARD_ID} .maximal-react-component-mode-button {
  padding: ${token.space1} ${token.space2} !important;
  color: ${token.colorTextMuted} !important;
  font-size: ${token.typeCaption} !important;
}
#${INSPECTOR_CARD_ID} .maximal-react-component-view-tab {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: ${token.sizeControl} !important;
  height: ${token.sizeControl} !important;
  padding: 0 !important;
  color: ${token.colorTextMuted} !important;
}
#${INSPECTOR_CARD_ID} [data-active="true"],
#${INSPECTOR_CARD_ID} [aria-selected="true"] {
  color: ${token.colorText} !important;
  background: ${token.colorSurfaceHover} !important;
}
#${INSPECTOR_CARD_ID} .maximal-react-component-css-modes {
  display: flex !important;
  gap: ${token.space1} !important;
  margin-bottom: ${token.space2} !important;
}
#${INSPECTOR_CARD_ID} .maximal-react-component-css-row {
  display: grid !important;
  grid-template-columns: minmax(96px, 0.8fr) minmax(120px, 1fr) !important;
  gap: ${token.space2} !important;
  padding: ${token.space1} ${token.space2} !important;
  color: ${token.colorTextMuted} !important;
  border-bottom: 1px solid ${token.colorBorder} !important;
  font-size: ${token.typeCaption} !important;
}
#${INSPECTOR_CARD_ID} .maximal-react-component-css-row code {
  overflow: hidden !important;
  color: inherit !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}
#${INSPECTOR_CARD_ID} .maximal-react-component-source-link,
#${INSPECTOR_CARD_ID} .maximal-react-component-css-row > span {
  grid-column: 1 / -1 !important;
  overflow: hidden !important;
  color: ${token.colorAccent} !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}
#${INSPECTOR_CARD_ID} .maximal-react-component-view-warning {
  margin: 0 0 ${token.space2} !important;
  color: ${token.colorTextMuted} !important;
  font-size: ${token.typeCaption} !important;
}
#${INSPECTOR_CARD_ID} .maximal-react-component-box-model {
  padding: ${token.space2} !important;
  color: #111827 !important;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace !important;
  font-size: ${token.typeCaption} !important;
}
#${INSPECTOR_CARD_ID} .maximal-react-component-box-layer {
  position: relative !important;
  padding: 24px 18px 14px !important;
  border: 1px dashed #111827 !important;
}
#${INSPECTOR_CARD_ID} .maximal-react-component-box-layer::before {
  position: absolute !important;
  top: ${token.space1} !important;
  left: ${token.space2} !important;
  content: attr(data-label) !important;
}
#${INSPECTOR_CARD_ID} .box-margin {
  background: #b98b5a !important;
}
#${INSPECTOR_CARD_ID} .box-border {
  background: #e4c17f !important;
}
#${INSPECTOR_CARD_ID} .box-padding {
  background: #b9c978 !important;
}
#${INSPECTOR_CARD_ID} .maximal-react-component-box-content {
  padding: ${token.space3} !important;
  text-align: center !important;
  background: #85b6c7 !important;
  border: 1px solid #111827 !important;
}
#${INSPECTOR_CARD_ID} svg {
  width: ${token.sizeIcon} !important;
  height: ${token.sizeIcon} !important;
  fill: none !important;
  stroke: currentColor !important;
  stroke-linecap: round !important;
  stroke-linejoin: round !important;
  stroke-width: 2 !important;
}
#${INSPECTOR_CARD_ID}[data-mode="preview"] {
  width: min(${token.sizePreview}, calc(100vw - ${token.space4} * 2)) !important;
  border-radius: ${token.radiusControl} !important;
  transform: scale(0.96) !important;
}
#${INSPECTOR_CARD_ID}[data-mode="preview"] .maximal-react-component-selection {
  grid-template-columns: minmax(0, 1fr) !important;
  padding: ${token.space2} ${token.space3} !important;
}
#${INSPECTOR_CARD_ID}[data-mode="preview"] .maximal-react-component-location,
#${INSPECTOR_CARD_ID}[data-mode="preview"] .maximal-react-component-actions,
#${INSPECTOR_CARD_ID}[data-mode="preview"] .${STACK_TOGGLE_CLASS} {
  display: none !important;
}
#${INSPECTOR_CARD_ID}[data-mode="preview"] .maximal-react-component-name {
  grid-column: 1 !important;
}
#${INSPECTOR_CARD_ID}[data-mode="preview"] .maximal-react-component-name-link:not([data-active="true"]) {
  display: none !important;
}
${boxOverlayStyles}
@media (prefers-reduced-motion: reduce) {
  [${TARGET_ATTRIBUTE}],
  #${INSPECTOR_CARD_ID},
  #${INSPECTOR_CARD_ID} .maximal-react-component-name-link,
  #${INSPECTOR_CARD_ID} .${CONTROL_CLASS} {
    transition: none !important;
  }
}
`

interface InspectorCardOptions {
  document: Document
  root: string
  onDismiss(): void
  onInspectEnd(): void
  onInspectTarget(target: HTMLElement, boxModel: boolean): void
  onOpen(layer: ComponentLayer): void
  onOpenPath(path: string): void
  onSelect(layer: ComponentLayer, index: number): void
  window: Window
}

export type InspectorCardMode = "full" | "preview"

export interface InspectorCard {
  element: HTMLElement
  destroy(): void
  focus(): void
  moveBy(offset: number): boolean
  selectedLayer(): ComponentLayer
  setExpanded(expanded: boolean): void
  setMode(mode: InspectorCardMode): void
  setLayers(layers: ReadonlyArray<ComponentLayer>, initialIndex?: number): void
  setView(view: InspectorView): void
}

function createControl(
  documentObject: Document,
  options: {
    className: string
    label: string
    pathData: string
  },
): HTMLButtonElement {
  const control = documentObject.createElement("button")
  control.type = "button"
  control.className = `${CONTROL_CLASS} ${options.className}`
  control.setAttribute("aria-label", options.label)
  control.append(createIcon(documentObject, options.pathData))
  return control
}

interface CardElements {
  actions: HTMLElement
  count: HTMLOutputElement
  element: HTMLElement
  location: HTMLElement
  name: HTMLElement
  next: HTMLButtonElement
  open: HTMLButtonElement
  previous: HTMLButtonElement
  stackToggle: HTMLButtonElement
  tools: HTMLButtonElement
}

function createCardElements(documentObject: Document): CardElements {
  const element = documentObject.createElement("section")
  element.id = INSPECTOR_CARD_ID
  element.tabIndex = -1
  element.setAttribute("aria-label", "React component source inspector")
  element.setAttribute("role", "dialog")
  const topResize = documentObject.createElement("div")
  topResize.className = "maximal-react-component-grabber"
  topResize.dataset["resizeEdge"] = "top"
  topResize.setAttribute("aria-hidden", "true")
  const headerControls = documentObject.createElement("div")
  headerControls.className = "maximal-react-component-header-controls"

  const selection = documentObject.createElement("div")
  selection.className = "maximal-react-component-selection"
  const name = documentObject.createElement("div")
  name.className = "maximal-react-component-name"
  name.setAttribute("aria-label", "React component owner stack")
  const location = documentObject.createElement("span")
  location.className = "maximal-react-component-location"
  const stackToggle = createControl(documentObject, {
    className: STACK_TOGGLE_CLASS,
    label: "Collapse component stack",
    pathData: EXPANDED_STACK_ICON,
  })
  stackToggle.setAttribute("aria-expanded", "true")
  headerControls.append(topResize)
  selection.append(stackToggle, name, location)

  const actions = documentObject.createElement("div")
  actions.className = "maximal-react-component-actions"
  const previous = createControl(documentObject, {
    className: PREVIOUS_CLASS,
    label: "Previous component",
    pathData: iconPath.previous,
  })
  const count = documentObject.createElement("output")
  count.className = "maximal-react-component-count"
  count.setAttribute("aria-live", "polite")
  const next = createControl(documentObject, {
    className: NEXT_CLASS,
    label: "Next component",
    pathData: iconPath.next,
  })
  const divider = documentObject.createElement("span")
  divider.className = "maximal-react-component-divider"
  divider.setAttribute("aria-hidden", "true")
  const open = createControl(documentObject, {
    className: OPEN_CLASS,
    label: "Open component source",
    pathData: iconPath.open,
  })
  const tools = createControl(documentObject, {
    className: TOOLS_CLASS,
    label: "Toggle inspector tools",
    pathData: iconPath.tools,
  })
  actions.append(previous, count, next, divider, tools, open)
  const bottomResize = documentObject.createElement("div")
  bottomResize.className = "maximal-react-component-resize-bottom"
  bottomResize.dataset["resizeEdge"] = "bottom"
  bottomResize.setAttribute("aria-hidden", "true")
  const leftResize = documentObject.createElement("div")
  leftResize.className =
    "maximal-react-component-resize-horizontal maximal-react-component-resize-left"
  leftResize.dataset["resizeEdge"] = "left"
  leftResize.setAttribute("aria-hidden", "true")
  const rightResize = documentObject.createElement("div")
  rightResize.className =
    "maximal-react-component-resize-horizontal maximal-react-component-resize-right"
  rightResize.dataset["resizeEdge"] = "right"
  rightResize.setAttribute("aria-hidden", "true")
  element.append(
    headerControls,
    selection,
    actions,
    bottomResize,
    leftResize,
    rightResize,
  )
  return {
    actions,
    count,
    element,
    location,
    name,
    next,
    open,
    previous,
    stackToggle,
    tools,
  }
}

function installKeyboardInteractions(
  element: HTMLElement,
  options: {
    currentLayer: () => ComponentLayer
    dismiss: () => void
    lastIndex: () => number
    move: (index: number) => boolean
    open: (layer: ComponentLayer) => void
    selectedIndex: () => number
  },
): void {
  element.addEventListener("keydown", (event) => {
    switch (event.key) {
      case "Escape": {
        options.dismiss()
        break
      }
      case "ArrowLeft": {
        options.move(options.selectedIndex() - 1)
        break
      }
      case "ArrowRight": {
        options.move(options.selectedIndex() + 1)
        break
      }
      case "Home": {
        options.move(0)
        break
      }
      case "End": {
        options.move(options.lastIndex())
        break
      }
      case "Enter": {
        if (event.target !== element) return
        options.open(options.currentLayer())
        break
      }
      default: {
        return
      }
    }
    event.preventDefault()
  })
}

function installControlInteractions(
  controls: Pick<CardElements, "next" | "open" | "previous" | "tools">,
  handlers: {
    move: (offset: number) => boolean
    open: () => void
    toggleTools: () => void
  },
): void {
  controls.previous.addEventListener("click", () => handlers.move(-1))
  controls.next.addEventListener("click", () => handlers.move(1))
  controls.open.addEventListener("click", () => handlers.open())
  controls.tools.addEventListener("click", () => handlers.toggleTools())
}

function installCardActionInteractions(
  controls: CardElements,
  element: HTMLElement,
  options: {
    currentLayer: () => ComponentLayer
    dismiss: () => void
    isExpanded: () => boolean
    lastIndex: () => number
    move: (index: number) => boolean
    open: (layer: ComponentLayer) => void
    selectedIndex: () => number
    setExpanded: (expanded: boolean) => void
  },
): void {
  installControlInteractions(controls, {
    move: (offset) => options.move(options.selectedIndex() + offset),
    open: () => options.open(options.currentLayer()),
    toggleTools: () => options.setExpanded(!options.isExpanded()),
  })
  installKeyboardInteractions(element, options)
}

function assertLayerIndex(
  layers: ReadonlyArray<ComponentLayer>,
  index: number,
): void {
  if (layers.length === 0) {
    throw new RangeError("The inspector card requires at least one layer")
  }
  if (index < 0 || index >= layers.length) {
    throw new RangeError("The inspector card index is outside the stack")
  }
}

export function createInspectorCard(
  options: InspectorCardOptions,
): InspectorCard {
  const cardElements = createCardElements(options.document)
  const { actions, count, element, location, name, next, previous } =
    cardElements
  let layers: ReadonlyArray<ComponentLayer> = []
  let index = 0
  let stackExpanded = true
  const currentLayer = (): ComponentLayer => layers[index]
  const inspectorView: InspectorViewController = createInspectorView(options)
  element.insertBefore(inspectorView.panel, actions)
  actions.insertBefore(inspectorView.toolbar, cardElements.tools)
  const rendering = createCardRendering({
    count,
    inspectorView,
    layers: () => layers,
    location,
    name,
    next,
    onInspectTarget: (target, boxModel) =>
      options.onInspectTarget(target, boxModel),
    previous,
    root: options.root,
    selectedIndex: () => index,
    stackExpanded: () => stackExpanded,
  })
  const { render, renderContext } = rendering
  const move = (nextIndex: number): boolean => {
    if (nextIndex < 0 || nextIndex >= layers.length || nextIndex === index) {
      return false
    }
    index = nextIndex
    render()
    options.onSelect(currentLayer(), index)
    return true
  }
  const setExpanded = (expanded: boolean): void => {
    if ((element.dataset["expanded"] === "true") === expanded) return
    element.dataset["expanded"] = String(expanded)
    if (layers.length > 0) inspectorView.update(layers, index)
    if (!expanded) options.onInspectEnd()
  }
  const disposeGeometry = installCardGeometry({
    card: element,
    onExpandedChange: setExpanded,
    window: options.window,
  })
  const disposeComponentInteractions = installComponentInteractions({
    layer: (layerIndex) => layers[layerIndex],
    name,
    onOpen: (layer) => options.onOpen(layer),
    onPreview: renderContext,
    onPreviewEnd: () => renderContext(index),
    onStackExpanded: (expanded) => {
      stackExpanded = expanded
      render()
    },
    select: move,
    stackToggle: cardElements.stackToggle,
    window: options.window,
  })
  installCardActionInteractions(cardElements, element, {
    currentLayer,
    dismiss: () => options.onDismiss(),
    isExpanded: () => element.dataset["expanded"] === "true",
    lastIndex: () => layers.length - 1,
    move,
    open: (layer) => options.onOpen(layer),
    selectedIndex: () => index,
    setExpanded,
  })
  return {
    destroy: () => {
      disposeComponentInteractions()
      disposeGeometry()
      options.onInspectEnd()
      element.remove()
    },
    element,
    focus: () => element.focus({ preventScroll: true }),
    moveBy: (offset) => move(index + offset),
    selectedLayer: currentLayer,
    setExpanded,
    setMode: (mode) => {
      element.dataset["mode"] = mode
    },
    setLayers: (nextLayers, initialIndex = 0) => {
      assertLayerIndex(nextLayers, initialIndex)
      layers = nextLayers
      index = initialIndex
      render()
      options.onSelect(currentLayer(), index)
    },
    setView: (view) => {
      setExpanded(true)
      inspectorView.setView(view)
    },
  }
}

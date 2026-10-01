import { BOX_OVERLAY_Z_INDEX } from "./constants.js"
import { inspectorTokens as token } from "./generated/inspector-tokens.js"
import {
  boxModelForElement,
  type BoxEdges,
  type BoxModel,
} from "./inspector-data.js"

export const BOX_OVERLAY_ATTRIBUTE = "data-maximal-box-boundary"
export const BOX_OVERLAY_LABEL_ATTRIBUTE = "data-maximal-box-label"

export const boxOverlayStyles = `[${BOX_OVERLAY_ATTRIBUTE}] {
  position: fixed !important;
  z-index: ${BOX_OVERLAY_Z_INDEX} !important;
  pointer-events: none !important;
}
[${BOX_OVERLAY_ATTRIBUTE}="margin"] {
  background: ${token.colorBoxMargin} !important;
  box-shadow: inset 0 0 0 1px rgb(185 139 90 / 0.7) !important;
}
[${BOX_OVERLAY_ATTRIBUTE}="border"] {
  background: ${token.colorBoxBorder} !important;
  box-shadow: inset 0 0 0 1px rgb(228 193 127 / 0.75) !important;
}
[${BOX_OVERLAY_ATTRIBUTE}="padding"] {
  background: ${token.colorBoxPadding} !important;
  box-shadow: inset 0 0 0 1px rgb(185 201 120 / 0.75) !important;
}
[${BOX_OVERLAY_ATTRIBUTE}="content"] {
  background: ${token.colorBoxContent} !important;
  box-shadow: inset 0 0 0 1px rgb(87 145 199 / 0.8) !important;
}
[${BOX_OVERLAY_LABEL_ATTRIBUTE}] {
  position: fixed !important;
  z-index: ${BOX_OVERLAY_Z_INDEX} !important;
  display: flex !important;
  align-items: baseline !important;
  gap: 14px !important;
  padding: 8px 16px !important;
  pointer-events: none !important;
  color: #303846 !important;
  background: #ffffff !important;
  border: 1px solid rgb(15 23 42 / 0.12) !important;
  border-radius: ${token.radiusControl} !important;
  box-shadow: 0 4px 14px rgb(15 23 42 / 0.22) !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif !important;
  font-size: ${token.typeLabel} !important;
  line-height: 1.4 !important;
}
[${BOX_OVERLAY_LABEL_ATTRIBUTE}]::after {
  position: absolute !important;
  bottom: -8px !important;
  left: 20px !important;
  width: 14px !important;
  height: 14px !important;
  background: #ffffff !important;
  border-right: 1px solid rgb(15 23 42 / 0.12) !important;
  border-bottom: 1px solid rgb(15 23 42 / 0.12) !important;
  content: "" !important;
  transform: rotate(45deg) !important;
}
[${BOX_OVERLAY_LABEL_ATTRIBUTE}] strong {
  color: #a0008f !important;
  font: inherit !important;
  font-weight: 700 !important;
}`

export interface BoxOverlay {
  clear: () => void
  show: (target: HTMLElement) => void
}

interface BoxMeasurement {
  label: string
  model: BoxModel
  rect: DOMRect
}

function edgeValues(edges: BoxEdges): [number, number, number, number] {
  return [edges.top, edges.right, edges.bottom, edges.left]
}

function addBoundary(
  documentObject: Document,
  kind: "border" | "content" | "margin" | "padding",
  box: { height: number; left: number; top: number; width: number },
): HTMLElement {
  const boundary = documentObject.createElement("div")
  boundary.setAttribute(BOX_OVERLAY_ATTRIBUTE, kind)
  boundary.style.left = `${box.left}px`
  boundary.style.top = `${box.top}px`
  boundary.style.width = `${Math.max(0, box.width)}px`
  boundary.style.height = `${Math.max(0, box.height)}px`
  documentObject.body.append(boundary)
  return boundary
}

function measurementKey(measurement: BoxMeasurement): string {
  const { label, model, rect } = measurement
  return JSON.stringify([
    label,
    rect.left,
    rect.top,
    rect.width,
    rect.height,
    ...edgeValues(model.margin),
    ...edgeValues(model.border),
    ...edgeValues(model.padding),
  ])
}

function measure(target: HTMLElement, windowObject: Window): BoxMeasurement {
  return {
    label: target.localName,
    model: boxModelForElement(target, windowObject),
    rect: target.getBoundingClientRect(),
  }
}

function addLabel(
  documentObject: Document,
  measurement: BoxMeasurement,
): HTMLElement {
  const { label: elementName, rect } = measurement
  const label = documentObject.createElement("div")
  label.setAttribute(BOX_OVERLAY_LABEL_ATTRIBUTE, "")
  label.style.left = `${Math.max(8, rect.left)}px`
  label.style.top = `${rect.top >= 52 ? rect.top - 44 : rect.top + rect.height + 10}px`
  const name = documentObject.createElement("strong")
  name.textContent = elementName
  const size = documentObject.createElement("span")
  size.textContent = `${String(Math.round(rect.width))} × ${String(Math.round(rect.height))}`
  label.append(name, size)
  documentObject.body.append(label)
  return label
}

function renderBoundaries(
  documentObject: Document,
  boundaries: Array<HTMLElement>,
  measurement: BoxMeasurement,
): void {
  for (const boundary of boundaries.splice(0)) boundary.remove()
  const { model, rect } = measurement
  boundaries.push(
    addBoundary(documentObject, "margin", {
      height: rect.height + model.margin.top + model.margin.bottom,
      left: rect.left - model.margin.left,
      top: rect.top - model.margin.top,
      width: rect.width + model.margin.left + model.margin.right,
    }),
    addBoundary(documentObject, "border", {
      height: rect.height,
      left: rect.left,
      top: rect.top,
      width: rect.width,
    }),
    addBoundary(documentObject, "padding", {
      height: rect.height - model.border.top - model.border.bottom,
      left: rect.left + model.border.left,
      top: rect.top + model.border.top,
      width: rect.width - model.border.left - model.border.right,
    }),
  )
  if (model.content.width > 0 && model.content.height > 0) {
    boundaries.push(
      addBoundary(documentObject, "content", {
        height: model.content.height,
        left: rect.left + model.border.left + model.padding.left,
        top: rect.top + model.border.top + model.padding.top,
        width: model.content.width,
      }),
    )
  }
  boundaries.push(addLabel(documentObject, measurement))
}

export function createBoxOverlay(
  documentObject: Document,
  windowObject: Window,
): BoxOverlay {
  const boundaries: Array<HTMLElement> = []
  let animationFrame: number | undefined
  let inspectedTarget: HTMLElement | undefined
  let lastMeasurement = ""
  let mutationObserver: MutationObserver | undefined
  let resizeObserver: ResizeObserver | undefined
  const removeBoundaries = (): void => {
    for (const boundary of boundaries.splice(0)) boundary.remove()
  }
  const update = (): void => {
    if (!inspectedTarget?.isConnected) {
      clear()
      return
    }
    const nextMeasurement = measure(inspectedTarget, windowObject)
    const nextKey = measurementKey(nextMeasurement)
    if (nextKey !== lastMeasurement) {
      lastMeasurement = nextKey
      renderBoundaries(documentObject, boundaries, nextMeasurement)
    }
  }
  const refresh = (): void => {
    animationFrame = undefined
    update()
    schedule()
  }
  const schedule = (): void => {
    if (
      animationFrame === undefined
      && typeof windowObject.requestAnimationFrame === "function"
    ) {
      animationFrame = windowObject.requestAnimationFrame(refresh)
    }
  }
  const clear = (): void => {
    inspectedTarget = undefined
    lastMeasurement = ""
    if (
      animationFrame !== undefined
      && typeof windowObject.cancelAnimationFrame === "function"
    ) {
      windowObject.cancelAnimationFrame(animationFrame)
    }
    animationFrame = undefined
    mutationObserver?.disconnect()
    mutationObserver = undefined
    resizeObserver?.disconnect()
    resizeObserver = undefined
    windowObject.removeEventListener("resize", update)
    windowObject.removeEventListener("scroll", update, true)
    removeBoundaries()
  }

  return {
    clear,
    show: (target) => {
      clear()
      inspectedTarget = target
      windowObject.addEventListener("resize", update)
      windowObject.addEventListener("scroll", update, true)
      if (typeof globalThis.MutationObserver === "function") {
        mutationObserver = new globalThis.MutationObserver(update)
        mutationObserver.observe(target, {
          attributeFilter: ["class", "style"],
          attributes: true,
        })
      }
      if (typeof globalThis.ResizeObserver === "function") {
        resizeObserver = new globalThis.ResizeObserver(update)
        resizeObserver.observe(target)
      }
      update()
      schedule()
    },
  }
}

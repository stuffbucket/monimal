import type { ComponentLayer } from "./types.js"

import { createBoxOverlay, type BoxOverlay } from "./box-overlay.js"
import { INSPECTOR_CARD_Z_INDEX, INSPECTOR_STYLE_ID } from "./constants.js"
import {
  createInspectorCard,
  inspectorStyles,
  type InspectorCard,
} from "./inspector-card.js"
import { positionInspectorCard } from "./positioning.js"

const TARGET_ATTRIBUTE = "data-maximal-react-component-target"
const UNLOCKED_ATTRIBUTE = "data-maximal-react-component-unlocked"

export { inspectorStyles } from "./inspector-card.js"
export type { ComponentLayer } from "./types.js"

interface SourceLocation {
  columnNumber?: number
  fileName: string
  lineNumber?: number
}

interface ComponentType {
  displayName?: string
  name?: string
  render?: {
    name?: string
  }
}

export interface ReactFiber {
  _debugInfo?: SourceLocation
  _debugOwner?: ReactFiber
  _debugSource?: SourceLocation
  child?: ReactFiber
  sibling?: ReactFiber
  stateNode?: unknown
  type: ComponentType | string
}

interface ReactRenderer {
  findFiberByHostInstance(element: Element): ReactFiber | undefined
}

interface ReactDevtoolsHook {
  renderers: Map<unknown, ReactRenderer>
}

interface ReactRootContainer {
  _internalRoot: {
    current: {
      child?: ReactFiber
    }
  }
}

declare global {
  interface Window {
    __REACT_DEVTOOLS_GLOBAL_HOOK__?: ReactDevtoolsHook
  }
}

export interface InspectorOptions {
  base: string
  root: string
}

export interface InspectorEnvironment {
  document: Document
  fetch: typeof fetch
  window: Window
}

export function sourcePath(fiber: ReactFiber): string | undefined {
  const source = fiber._debugSource ?? fiber._debugInfo
  if (!source) return undefined

  const { columnNumber = 1, fileName, lineNumber = 1 } = source
  return `${fileName}:${lineNumber}:${columnNumber}`
}

export function getReactInstanceForElement(
  element: Element,
  windowObject: Window,
): ReactFiber | undefined {
  const hook = windowObject.__REACT_DEVTOOLS_GLOBAL_HOOK__
  if (hook) {
    for (const renderer of hook.renderers.values()) {
      try {
        const fiber = renderer.findFiberByHostInstance(element)
        if (fiber) return fiber
      } catch {
        // A renderer can reject host instances owned by another renderer.
      }
    }
  }

  const rootContainer = (
    element as Element & { _reactRootContainer?: ReactRootContainer }
  )._reactRootContainer
  if (rootContainer) return rootContainer._internalRoot.current.child

  const record = element as unknown as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (key.startsWith("__reactFiber")) return record[key] as ReactFiber
  }
  return undefined
}

function componentName(type: ReactFiber["type"]): string {
  if (typeof type === "string") return type
  return type.displayName ?? type.name ?? type.render?.name ?? "undefined"
}

function hostElementForFiber(
  fiber: ReactFiber,
  windowObject: Window,
): HTMLElement | undefined {
  const HTMLElementConstructor =
    windowObject.document.defaultView?.HTMLElement ?? globalThis.HTMLElement
  if (fiber.stateNode instanceof HTMLElementConstructor) {
    return fiber.stateNode
  }

  let child = fiber.child
  while (child) {
    const element = hostElementForFiber(child, windowObject)
    if (element) return element
    child = child.sibling
  }
  return undefined
}

export function getLayersForElement(
  element: Element,
  windowObject: Window,
): Array<ComponentLayer> {
  let instance = getReactInstanceForElement(element, windowObject)
  const layers: Array<ComponentLayer> = []
  while (instance) {
    const path = sourcePath(instance)
    if (path) {
      const target =
        hostElementForFiber(instance, windowObject)
        ?? (element instanceof globalThis.HTMLElement ? element : undefined)
      layers.push({
        name: componentName(instance.type),
        path,
        ...(target ? { target } : {}),
      })
    }
    instance = instance._debugOwner
  }
  return layers.reverse()
}

export function maxAncestorZIndex(
  target: HTMLElement,
  current: number,
  environment: Pick<InspectorEnvironment, "document" | "window">,
): number {
  const parent = target.parentElement
  if (!parent || parent === environment.document.body) return current

  const zIndex = Number.parseInt(
    environment.window.getComputedStyle(parent).zIndex,
  )
  return maxAncestorZIndex(
    parent,
    Number.isNaN(zIndex) ? current : Math.max(zIndex, current),
    environment,
  )
}

function resolveEnvironment(
  suppliedEnvironment?: InspectorEnvironment,
): InspectorEnvironment {
  return (
    suppliedEnvironment ?? {
      document,
      fetch,
      window: globalThis.window,
    }
  )
}

function installInspectorStyles(documentObject: Document): HTMLStyleElement {
  const style = documentObject.createElement("style")
  style.dataset["viteDevId"] = INSPECTOR_STYLE_ID
  style.textContent = inspectorStyles
  documentObject.head.append(style)
  return style
}

class InspectorSession {
  readonly boxOverlay: BoxOverlay
  readonly card: InspectorCard
  readonly environment: InspectorEnvironment
  readonly options: InspectorOptions
  activationTarget: HTMLElement | undefined
  currentTarget: HTMLElement | undefined
  hasCard = false
  previewing = false
  previousBodyPointerEvents: string | undefined

  constructor(options: InspectorOptions, environment: InspectorEnvironment) {
    this.options = options
    this.environment = environment
    this.boxOverlay = createBoxOverlay(environment.document, environment.window)
    this.card = createInspectorCard({
      document: environment.document,
      root: options.root,
      window: environment.window,
      onDismiss: this.cleanUp,
      onInspectEnd: this.restoreSelectedOutline,
      onInspectTarget: (target, boxModel) => {
        this.setOutlineTarget(target)
        if (boxModel) this.boxOverlay.show(target)
        else this.boxOverlay.clear()
      },
      onOpen: (layer) => {
        void environment.fetch(
          `${options.base}__open-in-editor?file=${encodeURIComponent(layer.path)}`,
        )
        this.cleanUp()
      },
      onOpenPath: (path) => {
        void environment.fetch(
          `${options.base}__open-in-editor?file=${encodeURIComponent(path)}`,
        )
      },
      onSelect: (layer) => this.inspectLayer(layer),
    })
  }

  restoreSelectedOutline = (): void => {
    this.boxOverlay.clear()
    if (this.hasCard) this.inspectLayer(this.card.selectedLayer())
  }

  clearOutline(): void {
    if (!this.currentTarget) return
    this.currentTarget.removeAttribute(TARGET_ATTRIBUTE)
    this.currentTarget = undefined
  }

  setOutlineTarget(target: HTMLElement): void {
    if (target === this.currentTarget) return
    this.clearOutline()
    this.currentTarget = target
    this.currentTarget.setAttribute(TARGET_ATTRIBUTE, "")
  }

  inspectLayer(layer: ComponentLayer): HTMLElement | undefined {
    this.boxOverlay.clear()
    const target = layer.target ?? this.activationTarget
    if (!target) return undefined
    this.setOutlineTarget(target)
    return target
  }

  positionForLayer(layer: ComponentLayer): void {
    const target = this.inspectLayer(layer)
    if (!target) return
    this.card.element.style.zIndex = `${INSPECTOR_CARD_Z_INDEX}`
    positionInspectorCard(this.card.element, target, this.environment.window)
  }

  removeCard(): void {
    if (!this.hasCard) return
    this.card.element.remove()
    this.hasCard = false
    this.previewing = false
    this.activationTarget = undefined
    if (this.previousBodyPointerEvents !== undefined) {
      this.environment.document.body.style.pointerEvents =
        this.previousBodyPointerEvents
      this.environment.document.body.removeAttribute(UNLOCKED_ATTRIBUTE)
      this.previousBodyPointerEvents = undefined
    }
  }

  cleanUp = (): void => {
    this.boxOverlay.clear()
    this.clearOutline()
    this.removeCard()
  }

  onKeyUp = (event: KeyboardEvent): void => {
    if (event.key === "Control" && this.previewing) {
      this.previewing = false
      this.card.setMode("full")
      this.positionForLayer(this.card.selectedLayer())
    }
    if (!event.altKey && !this.hasCard && this.currentTarget) {
      this.clearOutline()
    }
  }

  onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && this.hasCard) this.cleanUp()
    if (event.key === "Control" && this.hasCard && !this.previewing) {
      this.previewing = true
      this.card.setMode("preview")
      this.positionForLayer(this.card.selectedLayer())
    }
  }

  onMouseMove = (event: MouseEvent): void => {
    if (!event.altKey) {
      if (!this.hasCard) this.clearOutline()
      return
    }
    if (this.hasCard) return
    if (!(event.target instanceof globalThis.HTMLElement)) {
      this.clearOutline()
      return
    }
    if (event.target === this.currentTarget) return

    this.setOutlineTarget(event.target)
  }

  onClick = (event: MouseEvent): void => {
    if (!this.hasCard) return
    if (!(event.target instanceof globalThis.Node)) return
    if (this.card.element.contains(event.target)) return
    const selectedTarget =
      this.card.selectedLayer().target ?? this.activationTarget
    if (!event.ctrlKey || !selectedTarget?.contains(event.target)) {
      this.cleanUp()
      return
    }

    event.preventDefault()
    event.stopPropagation()
    if (!this.previewing) {
      this.previewing = true
      this.card.setMode("preview")
    }
    this.card.moveBy(1)
  }

  onWheel = (event: WheelEvent): void => {
    if (!this.hasCard || event.deltaY === 0) return
    if (!(event.target instanceof globalThis.Node)) return
    const selectedTarget =
      this.card.selectedLayer().target ?? this.activationTarget
    if (
      !this.card.element.contains(event.target)
      && !selectedTarget?.contains(event.target)
    ) {
      return
    }
    if (this.card.moveBy(event.deltaY > 0 ? 1 : -1)) {
      event.preventDefault()
    }
  }

  onContextMenu = (event: MouseEvent): void => {
    if (!event.altKey) return
    if (!(event.target instanceof globalThis.HTMLElement)) return
    if (this.card.element.contains(event.target)) return

    event.preventDefault()
    const layers = getLayersForElement(event.target, this.environment.window)
    if (layers.length === 0) return

    this.activationTarget = event.target
    this.previewing = false
    this.card.setMode("full")

    if (!this.hasCard) {
      this.environment.document.body.append(this.card.element)
      if (this.environment.document.body.style.pointerEvents === "none") {
        this.previousBodyPointerEvents =
          this.environment.document.body.style.pointerEvents
        this.environment.document.body.style.pointerEvents = "auto"
        this.environment.document.body.setAttribute(UNLOCKED_ATTRIBUTE, "")
      }
      this.hasCard = true
    }
    this.card.setLayers(layers)
    this.positionForLayer(this.card.selectedLayer())
    this.card.focus()
  }

  start(): void {
    const { window: windowObject } = this.environment
    windowObject.addEventListener("click", this.onClick, true)
    windowObject.addEventListener("keydown", this.onKeyDown)
    windowObject.addEventListener("keyup", this.onKeyUp)
    windowObject.addEventListener("mousemove", this.onMouseMove)
    windowObject.addEventListener("contextmenu", this.onContextMenu)
    windowObject.addEventListener("wheel", this.onWheel, { passive: false })
  }

  dispose(): void {
    const { window: windowObject } = this.environment
    windowObject.removeEventListener("click", this.onClick, true)
    windowObject.removeEventListener("keydown", this.onKeyDown)
    windowObject.removeEventListener("keyup", this.onKeyUp)
    windowObject.removeEventListener("mousemove", this.onMouseMove)
    windowObject.removeEventListener("contextmenu", this.onContextMenu)
    windowObject.removeEventListener("wheel", this.onWheel)
    this.cleanUp()
    this.card.destroy()
  }
}

export function installReactComponentInspector(
  options: InspectorOptions,
  suppliedEnvironment?: InspectorEnvironment,
): () => void {
  const environment = resolveEnvironment(suppliedEnvironment)
  const style = installInspectorStyles(environment.document)
  const session = new InspectorSession(options, environment)
  session.start()
  return () => {
    session.dispose()
    style.remove()
  }
}

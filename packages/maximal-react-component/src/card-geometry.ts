const INTERACTIVE_SELECTOR =
  "button, a, input, select, textarea, [role='button'], [data-resize-edge]"

interface CardGeometryOptions {
  card: HTMLElement
  onExpandedChange: (expanded: boolean) => void
  window: Window
}

type ResizeEdge = "bottom" | "left" | "right" | "top"

interface DragState {
  cardHeight: number
  cardLeft: number
  cardTop: number
  cardWidth: number
  edge?: ResizeEdge
  kind: "drag" | "resize"
  pointerX: number
  pointerY: number
}

const EXPANDED_THRESHOLD = 240
const MINIMUM_WIDTH = 280
const VIEWPORT_GUTTER = 16

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

function resizeEdge(handle: HTMLElement): ResizeEdge {
  const edge = handle.dataset["resizeEdge"]
  if (
    edge === "bottom"
    || edge === "left"
    || edge === "right"
    || edge === "top"
  ) {
    return edge
  }
  throw new RangeError(`Unknown card resize edge: ${String(edge)}`)
}

function updateGeometry(
  options: CardGeometryOptions,
  state: DragState,
  event: MouseEvent,
): void {
  const deltaX = event.clientX - state.pointerX
  const deltaY = event.clientY - state.pointerY
  if (state.kind === "drag") {
    const maximumLeft =
      options.window.innerWidth - options.card.offsetWidth - VIEWPORT_GUTTER
    const maximumTop =
      options.window.innerHeight - options.card.offsetHeight - VIEWPORT_GUTTER
    options.card.style.left = `${clamp(
      state.cardLeft + deltaX,
      VIEWPORT_GUTTER,
      Math.max(VIEWPORT_GUTTER, maximumLeft),
    )}px`
    options.card.style.top = `${clamp(
      state.cardTop + deltaY,
      VIEWPORT_GUTTER,
      Math.max(VIEWPORT_GUTTER, maximumTop),
    )}px`
    return
  }
  if (state.edge === "left" || state.edge === "right") {
    const leftResize = state.edge === "left"
    const maximumWidth =
      leftResize ?
        state.cardLeft + state.cardWidth - VIEWPORT_GUTTER
      : options.window.innerWidth - state.cardLeft - VIEWPORT_GUTTER
    const minimumWidth = Math.min(MINIMUM_WIDTH, maximumWidth)
    const nextWidth = clamp(
      state.cardWidth + (leftResize ? -deltaX : deltaX),
      minimumWidth,
      maximumWidth,
    )
    options.card.style.setProperty("width", `${nextWidth}px`, "important")
    if (leftResize) {
      options.card.style.left = `${state.cardLeft + state.cardWidth - nextWidth}px`
    }
    return
  }

  const topResize = state.edge === "top"
  const nextHeight = clamp(
    state.cardHeight + (topResize ? -deltaY : deltaY),
    120,
    options.window.innerHeight - VIEWPORT_GUTTER * 2,
  )
  options.card.style.setProperty("height", `${nextHeight}px`, "important")
  if (topResize) {
    options.card.style.top = `${state.cardTop + state.cardHeight - nextHeight}px`
  }
  options.onExpandedChange(nextHeight >= EXPANDED_THRESHOLD)
}

function finishGeometry(options: CardGeometryOptions, state: DragState): void {
  options.card.removeAttribute("data-interacting")
  if (state.edge === "left" || state.edge === "right") return
  const rect = options.card.getBoundingClientRect()
  const expanded = rect.height >= EXPANDED_THRESHOLD
  const preserveBottom = state.edge === "top" ? rect.bottom : undefined
  options.card.style.removeProperty("height")
  options.onExpandedChange(expanded)
  if (preserveBottom !== undefined) {
    options.card.style.top = `${preserveBottom - options.card.getBoundingClientRect().height}px`
  }
}

export function installCardGeometry(options: CardGeometryOptions): () => void {
  const { card, window: windowObject } = options
  let state: DragState | undefined
  const onMouseMove = (event: MouseEvent): void => {
    if (state) updateGeometry(options, state, event)
  }
  const finishInteraction = (): void => {
    if (!state) return
    finishGeometry(options, state)
    state = undefined
  }
  const onMouseDown = (event: MouseEvent): void => {
    if (!(event.target instanceof globalThis.Element)) return
    const resizeHandle = event.target.closest<HTMLElement>("[data-resize-edge]")
    const interactive = event.target.closest(INTERACTIVE_SELECTOR)
    if (!resizeHandle && interactive) return

    const rect = card.getBoundingClientRect()
    card.style.left = `${rect.left}px`
    card.style.top = `${rect.top}px`
    card.style.right = ""
    card.style.bottom = ""
    state = {
      cardHeight: rect.height,
      cardLeft: rect.left,
      cardTop: rect.top,
      cardWidth: rect.width,
      ...(resizeHandle ?
        {
          edge: resizeEdge(resizeHandle),
          kind: "resize" as const,
        }
      : { kind: "drag" as const }),
      pointerX: event.clientX,
      pointerY: event.clientY,
    }
    card.setAttribute("data-interacting", state.kind)
    event.preventDefault()
  }

  card.addEventListener("mousedown", onMouseDown)
  windowObject.addEventListener("mousemove", onMouseMove)
  windowObject.addEventListener("mouseup", finishInteraction)
  return () => {
    card.removeEventListener("mousedown", onMouseDown)
    windowObject.removeEventListener("mousemove", onMouseMove)
    windowObject.removeEventListener("mouseup", finishInteraction)
  }
}

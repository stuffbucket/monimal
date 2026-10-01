import type { ComponentLayer } from "./types.js"

const CLICK_DELAY = 200
export const EXPANDED_STACK_ICON = "m6 9 6 6 6-6"
const COLLAPSED_STACK_ICON = "m9 18 6-6-6-6"

export function renderComponentNames(
  container: HTMLElement,
  layers: ReadonlyArray<ComponentLayer>,
  options: {
    expanded: boolean
    selectedIndex: number
  },
): void {
  const visibleLayers =
    options.expanded ?
      layers.map((layer, index) => ({ index, layer }))
    : [
        {
          index: options.selectedIndex,
          layer: layers[options.selectedIndex],
        },
      ]
  const entries = visibleLayers.map(({ index, layer }) => {
    const link = container.ownerDocument.createElement("button")
    link.type = "button"
    link.className = "maximal-react-component-name-link"
    link.dataset["active"] = String(index === options.selectedIndex)
    link.dataset["layerIndex"] = String(index)
    link.setAttribute(
      "aria-label",
      `Select ${layer.name}; double-click to open source`,
    )
    link.textContent = layer.name
    link.style.paddingLeft = `${String(options.expanded ? index * 10 : 0)}px`
    return link
  })
  container.replaceChildren(...entries)
  container.title = layers.map((layer) => layer.name).join(" › ")
}

export function installComponentStackToggle(
  toggle: HTMLButtonElement,
  onExpandedChange: (expanded: boolean) => void,
): () => void {
  let expanded = true
  const onClick = () => {
    expanded = !expanded
    toggle.setAttribute("aria-expanded", String(expanded))
    toggle.setAttribute(
      "aria-label",
      `${expanded ? "Collapse" : "Expand"} component stack`,
    )
    toggle
      .querySelector("path")
      ?.setAttribute("d", expanded ? EXPANDED_STACK_ICON : COLLAPSED_STACK_ICON)
    onExpandedChange(expanded)
  }
  toggle.addEventListener("click", onClick)
  return () => toggle.removeEventListener("click", onClick)
}

export function installComponentInteractions(options: {
  layer: (index: number) => ComponentLayer
  name: HTMLElement
  onOpen: (layer: ComponentLayer) => void
  onPreview: (index: number) => void
  onPreviewEnd: () => void
  onStackExpanded: (expanded: boolean) => void
  select: (index: number) => boolean
  stackToggle: HTMLButtonElement
  window: Window
}): () => void {
  const disposeNames = installComponentNameInteractions(options.name, {
    layer: options.layer,
    open: options.onOpen,
    preview: options.onPreview,
    previewEnd: options.onPreviewEnd,
    select: options.select,
    window: options.window,
  })
  const disposeToggle = installComponentStackToggle(
    options.stackToggle,
    options.onStackExpanded,
  )
  return () => {
    disposeToggle()
    disposeNames()
  }
}

export function installComponentNameInteractions(
  container: HTMLElement,
  options: {
    layer: (index: number) => ComponentLayer
    open: (layer: ComponentLayer) => void
    preview: (index: number) => void
    previewEnd: () => void
    select: (index: number) => boolean
    window: Window
  },
): () => void {
  let selectionTimer: number | undefined
  const layerIndex = (event: MouseEvent): number | undefined => {
    if (!(event.target instanceof globalThis.Element)) return undefined
    const entry = event.target.closest<HTMLElement>("[data-layer-index]")
    if (!entry || !container.contains(entry)) return undefined
    const value = entry.dataset["layerIndex"]
    return value === undefined ? undefined : Number(value)
  }
  const clearSelectionTimer = (): void => {
    if (selectionTimer === undefined) return
    options.window.clearTimeout(selectionTimer)
    selectionTimer = undefined
  }
  const onClick = (event: MouseEvent): void => {
    const index = layerIndex(event)
    if (index === undefined || event.detail > 1) return
    clearSelectionTimer()
    selectionTimer = options.window.setTimeout(() => {
      selectionTimer = undefined
      options.select(index)
    }, CLICK_DELAY)
  }
  const onDoubleClick = (event: MouseEvent): void => {
    const index = layerIndex(event)
    if (index === undefined) return
    clearSelectionTimer()
    options.select(index)
    options.open(options.layer(index))
  }
  const onMouseOver = (event: MouseEvent): void => {
    const index = layerIndex(event)
    if (index !== undefined) options.preview(index)
  }
  const onMouseOut = (event: MouseEvent): void => {
    if (layerIndex(event) !== undefined) options.previewEnd()
  }
  container.addEventListener("click", onClick)
  container.addEventListener("dblclick", onDoubleClick)
  container.addEventListener("mouseover", onMouseOver)
  container.addEventListener("mouseout", onMouseOut)
  return () => {
    clearSelectionTimer()
    container.removeEventListener("click", onClick)
    container.removeEventListener("dblclick", onDoubleClick)
    container.removeEventListener("mouseover", onMouseOver)
    container.removeEventListener("mouseout", onMouseOut)
  }
}

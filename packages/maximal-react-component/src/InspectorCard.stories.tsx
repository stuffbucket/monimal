import type { Meta, StoryObj } from "@storybook/react-vite"
import type { CSSProperties, RefObject } from "react"

import { useEffect, useRef } from "react"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"

import type { InspectorCardMode } from "./inspector-card.js"
import type { InspectorView } from "./inspector-view.js"
import type { ComponentLayer } from "./types.js"

import { createBoxOverlay } from "./box-overlay.js"
import { INSPECTOR_STYLE_ID } from "./constants.js"
import {
  createInspectorCard,
  INSPECTOR_CARD_ID,
  inspectorStyles,
} from "./inspector-card.js"
import { positionInspectorCard } from "./positioning.js"

const TARGET_ATTRIBUTE = "data-maximal-react-component-target"

function installOutsideDismissal(
  card: HTMLElement,
  dismiss: () => void,
): () => void {
  const onClick = (event: MouseEvent) => {
    if (
      card.isConnected
      && event.target instanceof Node
      && !card.contains(event.target)
    ) {
      dismiss()
    }
  }
  globalThis.window.addEventListener("click", onClick)
  return () => globalThis.window.removeEventListener("click", onClick)
}

function createStoryDismiss(
  documentObject: Document,
  onDismiss: () => void,
  cleanUp: () => void,
): () => void {
  return () => {
    onDismiss()
    cleanUp()
    documentObject.querySelector(`#${INSPECTOR_CARD_ID}`)?.remove()
  }
}

const defaultLayers: Array<ComponentLayer> = [
  {
    name: "HomeScreen",
    path: "/workspace/maximal/src/screens/HomeScreen.tsx:27:3",
  },
  {
    name: "PrimaryAction",
    path: "/workspace/maximal/src/features/home/PrimaryAction.tsx:42:9",
  },
  { name: "button", path: "/workspace/maximal/src/components/Button.tsx:18:5" },
]

function targetLayers(
  layers: ReadonlyArray<ComponentLayer>,
  target: HTMLElement,
): Array<ComponentLayer> {
  const targets = [
    target,
    ...target.querySelectorAll<HTMLElement>("[data-story-owner]"),
  ]
  return layers.map((layer, index) => ({
    ...layer,
    target: targets[index] ?? target,
  }))
}

type TargetPosition =
  "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center"

const targetPositions: Record<TargetPosition, CSSProperties> = {
  "top-left": { left: 72, top: 72 },
  "top-right": { right: 72, top: 72 },
  "bottom-left": { bottom: 72, left: 72 },
  "bottom-right": { bottom: 72, right: 72 },
  center: {
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
  },
}

const previewSurfaceStyle: CSSProperties = {
  width: "100vw",
  height: "100vh",
  overflow: "hidden",
  background:
    "radial-gradient(circle at 50% 35%, rgb(238 242 247), rgb(210 219 232))",
}

interface CardPreviewProperties {
  cardPosition: "auto" | "dragged" | "wide"
  expanded: boolean
  initialIndex: number
  layers: Array<ComponentLayer>
  mode: InspectorCardMode
  onDismiss: () => void
  onOpen: (layer: ComponentLayer) => void
  onSelect: (layer: ComponentLayer, index: number) => void
  targetPosition: TargetPosition
  view: InspectorView
}

function applyCardPosition(
  card: HTMLElement,
  cardPosition: CardPreviewProperties["cardPosition"],
): void {
  if (cardPosition === "dragged") {
    card.style.left = "32px"
    card.style.top = "32px"
    card.style.right = ""
    card.style.bottom = ""
  }
  if (cardPosition === "wide") {
    card.style.setProperty("width", "520px", "important")
  }
}

function PreviewTarget({
  target,
  targetPosition,
}: {
  target: RefObject<HTMLDivElement | null>
  targetPosition: TargetPosition
}) {
  return (
    <div
      ref={target}
      style={{
        position: "fixed",
        width: 184,
        height: 72,
        border: "1px solid rgb(148 163 184)",
        borderRadius: 10,
        color: "rgb(30 41 59)",
        background: "rgb(255 255 255 / 0.9)",
        font: "600 14px system-ui",
        padding: 16,
        ...targetPositions[targetPosition],
      }}
    >
      <strong data-story-owner style={{ display: "block" }}>
        Target component
      </strong>
      <span
        data-story-owner
        style={{
          display: "inline-block",
          marginTop: 4,
          padding: "2px 6px",
          borderRadius: 4,
          fontWeight: 400,
        }}
      >
        Inspectable descendant
      </span>
    </div>
  )
}

function PreviewSurface({
  host,
  target,
  targetPosition,
}: {
  host: RefObject<HTMLDivElement | null>
  target: RefObject<HTMLDivElement | null>
  targetPosition: TargetPosition
}) {
  return (
    <div ref={host} style={previewSurfaceStyle}>
      <PreviewTarget target={target} targetPosition={targetPosition} />
    </div>
  )
}

function CardPreview({
  cardPosition,
  expanded,
  initialIndex,
  layers,
  mode,
  onDismiss,
  onOpen,
  onSelect,
  targetPosition,
  view,
}: CardPreviewProperties) {
  const host = useRef<HTMLDivElement>(null)
  const target = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const targetElement = target.current
    if (!targetElement) return
    const style = document.createElement("style")
    style.dataset["viteDevId"] = INSPECTOR_STYLE_ID
    style.textContent = inspectorStyles
    document.head.append(style)
    targetElement.setAttribute(TARGET_ATTRIBUTE, "")
    const positionedLayers = targetLayers(layers, targetElement)
    const boxOverlay = createBoxOverlay(document, globalThis.window)
    let inspectedTarget: HTMLElement = targetElement
    const dismiss = createStoryDismiss(document, onDismiss, () => {
      boxOverlay.clear()
      inspectedTarget.removeAttribute(TARGET_ATTRIBUTE)
      targetElement.removeAttribute(TARGET_ATTRIBUTE)
    })
    const card = createInspectorCard({
      document,
      root: "/workspace/maximal",
      window: globalThis.window,
      onDismiss: dismiss,
      onInspectEnd: () => {
        boxOverlay.clear()
        inspectedTarget.removeAttribute(TARGET_ATTRIBUTE)
        inspectedTarget = targetElement
        targetElement.setAttribute(TARGET_ATTRIBUTE, "")
      },
      onInspectTarget: (nextTarget, boxModel) => {
        inspectedTarget.removeAttribute(TARGET_ATTRIBUTE)
        inspectedTarget = nextTarget
        inspectedTarget.setAttribute(TARGET_ATTRIBUTE, "")
        if (boxModel) boxOverlay.show(inspectedTarget)
        else boxOverlay.clear()
      },
      onOpen,
      onOpenPath: () => undefined,
      onSelect,
    })
    card.setMode(mode)
    host.current?.append(card.element)
    card.setLayers(positionedLayers, initialIndex)
    positionInspectorCard(
      card.element,
      positionedLayers[initialIndex]?.target ?? targetElement,
      globalThis,
    )
    if (expanded) card.setView(view)
    applyCardPosition(card.element, cardPosition)
    const reposition = () =>
      positionInspectorCard(card.element, targetElement, globalThis)
    const disposeOutsideDismissal = installOutsideDismissal(
      card.element,
      dismiss,
    )
    globalThis.window.addEventListener("resize", reposition)
    return () => {
      globalThis.window.removeEventListener("resize", reposition)
      disposeOutsideDismissal()
      targetElement.removeAttribute(TARGET_ATTRIBUTE)
      boxOverlay.clear()
      card.destroy()
      style.remove()
    }
  }, [
    cardPosition,
    expanded,
    initialIndex,
    layers,
    mode,
    onDismiss,
    onOpen,
    onSelect,
    targetPosition,
    view,
  ])

  return (
    <PreviewSurface
      host={host}
      target={target}
      targetPosition={targetPosition}
    />
  )
}

const meta = {
  title: "Inspector/Component stack card",
  component: CardPreview,
  args: {
    cardPosition: "auto",
    expanded: false,
    initialIndex: 0,
    layers: defaultLayers,
    mode: "full",
    onDismiss: fn(),
    onOpen: fn(),
    onSelect: fn(),
    targetPosition: "center",
    view: "css",
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof CardPreview>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const MiddleOfStack: Story = {
  name: "Middle of stack",
  args: { initialIndex: 1 },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByText("PrimaryAction").length).toBeGreaterThan(0)
    await expect(canvas.getByText("2 / 3")).toBeInTheDocument()
    await userEvent.click(
      canvas.getByRole("button", { name: "Next component" }),
    )
    await expect(canvas.getAllByText("button").length).toBeGreaterThan(0)
    await expect(
      canvas.getByRole("button", { name: "Next component" }),
    ).toBeDisabled()
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Select HomeScreen; double-click to open source",
      }),
    )
    await waitFor(() =>
      expect(args.onSelect).toHaveBeenLastCalledWith(defaultLayers[0], 0),
    )
    await userEvent.dblClick(
      canvas.getByRole("button", {
        name: "Select PrimaryAction; double-click to open source",
      }),
    )
    await expect(args.onSelect).toHaveBeenLastCalledWith(defaultLayers[1], 1)
    await expect(args.onOpen).toHaveBeenCalledWith(defaultLayers[1])
  },
}

export const PreviewWhileDrilling: Story = {
  name: "Preview while drilling",
  args: {
    initialIndex: 1,
    mode: "preview",
    targetPosition: "center",
  },
}

export const TargetTopLeft: Story = {
  name: "Target — top left",
  args: { targetPosition: "top-left" },
}

export const TargetTopRight: Story = {
  name: "Target — top right",
  args: { initialIndex: 1, targetPosition: "top-right" },
}

export const TargetBottomLeft: Story = {
  name: "Target — bottom left",
  args: { initialIndex: 1, targetPosition: "bottom-left" },
}

export const TargetBottomRight: Story = {
  name: "Target — bottom right",
  args: { initialIndex: 2, targetPosition: "bottom-right" },
}

export const DeepStackAndLongPath: Story = {
  name: "Deep stack and long path",
  args: {
    initialIndex: 7,
    layers: Array.from({ length: 12 }, (_, index) => ({
      name: `NestedComponent${String(index + 1)}`,
      path: `/workspace/maximal/src/features/a-very-long-product-area/components/NestedComponent${String(index + 1)}.tsx:${String(index + 10)}:3`,
    })),
    targetPosition: "top-left",
  },
}

export const CompactViewport: Story = {
  name: "Compact viewport",
  args: { targetPosition: "top-left" },
  parameters: {
    viewport: { defaultViewport: "mobile1" },
  },
}

export const ExpandedStack: Story = {
  name: "Owner stack — expanded",
  args: { initialIndex: 1 },
}

export const CollapsedStack: Story = {
  name: "Owner stack — selected component",
  args: { initialIndex: 1 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole("button", { name: "Collapse component stack" }),
    )
    await expect(
      canvas.getByRole("button", {
        name: "Select PrimaryAction; double-click to open source",
      }),
    ).toBeInTheDocument()
    await expect(
      canvas.queryByRole("button", {
        name: "Select HomeScreen; double-click to open source",
      }),
    ).not.toBeInTheDocument()
  },
}

export const DraggedCard: Story = {
  name: "Dragged card",
  args: { cardPosition: "dragged", expanded: true },
}

export const ResizedCard: Story = {
  name: "Resized vertically and horizontally",
  args: {
    cardPosition: "wide",
    expanded: true,
    initialIndex: 2,
    targetPosition: "bottom-right",
  },
}

export const AssignedCss: Story = {
  name: "Tools — assigned CSS",
  args: { expanded: true, view: "css" },
}

export const ComputedCss: Story = {
  name: "Tools — computed CSS",
  args: { expanded: true, view: "css" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Computed" }))
    await expect(
      canvas.getByRole("button", { name: "Computed" }),
    ).toHaveAttribute("data-active", "true")
  },
}

export const BoxModel: Story = {
  name: "Tools — box model",
  args: { expanded: true, view: "box" },
}

import { useEffect, useRef, type ReactElement } from 'react'

export const WORKSPACE_WORLD_SIZE = 16_000
export const WORKSPACE_GRID_SIZE = 40
const MIN_ZOOM = 0.2
const MAX_ZOOM = 3

export interface WorkspaceMapViewport {
  centerX: number
  centerY: number
  zoom: number
}

function clampViewport(
  viewport: WorkspaceMapViewport,
  width: number,
  height: number,
): void {
  const halfWidth = Math.min(WORKSPACE_WORLD_SIZE / 2, width / (2 * viewport.zoom))
  const halfHeight = Math.min(WORKSPACE_WORLD_SIZE / 2, height / (2 * viewport.zoom))
  viewport.centerX = Math.max(
    halfWidth,
    Math.min(WORKSPACE_WORLD_SIZE - halfWidth, viewport.centerX),
  )
  viewport.centerY = Math.max(
    halfHeight,
    Math.min(WORKSPACE_WORLD_SIZE - halfHeight, viewport.centerY),
  )
}

export interface WorkspaceGridIntersection {
  screenX: number
  screenY: number
  worldX: number
  worldY: number
}

export function workspaceGridIntersections(
  viewport: WorkspaceMapViewport,
  width: number,
  height: number,
): WorkspaceGridIntersection[] {
  const left = viewport.centerX - width / (2 * viewport.zoom)
  const top = viewport.centerY - height / (2 * viewport.zoom)
  const right = viewport.centerX + width / (2 * viewport.zoom)
  const bottom = viewport.centerY + height / (2 * viewport.zoom)
  const minimumSpacing = 12
  const densityRatio = minimumSpacing / (WORKSPACE_GRID_SIZE * viewport.zoom)
  const gridMultiplier = densityRatio > 1
    ? 2 ** Math.ceil(Math.log2(densityRatio))
    : 1
  const step = WORKSPACE_GRID_SIZE * gridMultiplier
  const firstX = Math.max(0, Math.ceil(left / step) * step)
  const firstY = Math.max(0, Math.ceil(top / step) * step)
  const intersections: WorkspaceGridIntersection[] = []

  for (
    let worldY = firstY;
    worldY <= Math.min(WORKSPACE_WORLD_SIZE, bottom);
    worldY += step
  ) {
    for (
      let worldX = firstX;
      worldX <= Math.min(WORKSPACE_WORLD_SIZE, right);
      worldX += step
    ) {
      intersections.push({
        worldX,
        worldY,
        screenX: (worldX - viewport.centerX) * viewport.zoom + width / 2,
        screenY: (worldY - viewport.centerY) * viewport.zoom + height / 2,
      })
    }
  }
  return intersections
}

function drawGrid(
  context: CanvasRenderingContext2D,
  viewport: WorkspaceMapViewport,
  width: number,
  height: number,
  scale: number,
): void {
  context.setTransform(scale, 0, 0, scale, 0, 0)
  context.fillStyle = 'rgb(227 227 255)'
  context.fillRect(0, 0, width, height)

  context.fillStyle = 'rgb(139 139 184 / 55%)'
  context.beginPath()
  for (const point of workspaceGridIntersections(viewport, width, height)) {
    context.moveTo(point.screenX + 1.25, point.screenY)
    context.arc(point.screenX, point.screenY, 1.25, 0, Math.PI * 2)
  }
  context.fill()
}

export function WorkspaceMap(): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const redrawRef = useRef<() => void>(() => undefined)
  const viewportRef = useRef<WorkspaceMapViewport>({
    centerX: WORKSPACE_WORLD_SIZE / 2,
    centerY: WORKSPACE_WORLD_SIZE / 2,
    zoom: 1,
  })

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d', { alpha: false })
    if (!canvas || !context) return

    let animationFrame = 0
    const draw = (): void => {
      animationFrame = 0
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      const scale = Math.min(window.devicePixelRatio || 1, 2)
      const pixelWidth = Math.max(1, Math.round(width * scale))
      const pixelHeight = Math.max(1, Math.round(height * scale))
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth
        canvas.height = pixelHeight
      }
      clampViewport(viewportRef.current, width, height)
      drawGrid(context, viewportRef.current, width, height, scale)
    }
    const scheduleDraw = (): void => {
      if (animationFrame === 0) animationFrame = requestAnimationFrame(draw)
    }
    const handleWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const bounds = canvas.getBoundingClientRect()
      const viewport = viewportRef.current
      const pointerX = event.clientX - bounds.left - bounds.width / 2
      const pointerY = event.clientY - bounds.top - bounds.height / 2
      const worldX = viewport.centerX + pointerX / viewport.zoom
      const worldY = viewport.centerY + pointerY / viewport.zoom
      viewport.zoom = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, viewport.zoom * Math.exp(-event.deltaY * 0.0015)),
      )
      viewport.centerX = worldX - pointerX / viewport.zoom
      viewport.centerY = worldY - pointerY / viewport.zoom
      scheduleDraw()
    }

    redrawRef.current = scheduleDraw
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleDraw)
    resizeObserver?.observe(canvas)
    if (resizeObserver === null) window.addEventListener('resize', scheduleDraw)
    scheduleDraw()
    return () => {
      redrawRef.current = () => undefined
      canvas.removeEventListener('wheel', handleWheel)
      resizeObserver?.disconnect()
      if (resizeObserver === null) window.removeEventListener('resize', scheduleDraw)
      if (animationFrame !== 0) cancelAnimationFrame(animationFrame)
    }
  }, [])

  return (
    <main className="workspace-map" aria-label="Home workspace map">
      <canvas
        ref={canvasRef}
        className="workspace-map__canvas"
        role="img"
        aria-label="Workspace map, 16,000 by 16,000 pixels"
        data-testid="workspace-map"
        onPointerDown={(event) => {
          const canvas = event.currentTarget
          canvas.setPointerCapture(event.pointerId)
          canvas.dataset.panX = String(event.clientX)
          canvas.dataset.panY = String(event.clientY)
        }}
        onPointerMove={(event) => {
          const canvas = event.currentTarget
          if (!canvas.hasPointerCapture(event.pointerId)) return
          const lastX = Number(canvas.dataset.panX)
          const lastY = Number(canvas.dataset.panY)
          viewportRef.current.centerX -= (event.clientX - lastX) / viewportRef.current.zoom
          viewportRef.current.centerY -= (event.clientY - lastY) / viewportRef.current.zoom
          canvas.dataset.panX = String(event.clientX)
          canvas.dataset.panY = String(event.clientY)
          redrawRef.current()
        }}
      />
      <div className="workspace-map__label">
        <strong>Workspace map</strong>
        <span>16,000 × 16,000</span>
      </div>
    </main>
  )
}

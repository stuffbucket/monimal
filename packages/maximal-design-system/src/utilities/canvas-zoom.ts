export const CANVAS_ZOOM = {
  default: 100,
  maximum: 200,
  minimum: 25,
  presets: [50, 100, 200],
  step: 10,
} as const

export function normalizeCanvasZoom(value: number): number {
  return Math.min(
    CANVAS_ZOOM.maximum,
    Math.max(CANVAS_ZOOM.minimum, Math.round(value)),
  )
}

export function stepCanvasZoom(value: number, direction: -1 | 1): number {
  return normalizeCanvasZoom(value + (CANVAS_ZOOM.step * direction))
}

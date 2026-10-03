import { useCallback, useEffect, useRef, useState } from "react"

export interface Camera {
  x: number
  y: number
  zoom: number
}

export interface Point {
  x: number
  y: number
}

export const INITIAL_CAMERA: Camera = { x: 340, y: 100, zoom: 1 }
const WHEEL_ZOOM_RATE = 0.0014

export function clampZoom(value: number): number {
  return Math.min(4, Math.max(0.1, value))
}

export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-deltaY * WHEEL_ZOOM_RATE)
}

export function screenToWorld(
  point: Point,
  camera: Camera,
  bounds: DOMRect,
): Point {
  return {
    x: (point.x - bounds.left - camera.x) / camera.zoom,
    y: (point.y - bounds.top - camera.y) / camera.zoom,
  }
}

export function editableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || (target instanceof HTMLElement && target.isContentEditable)
  )
}

export function useRafCamera(
  initial: Camera,
): [Camera, (next: Camera) => void] {
  const [camera, setCamera] = useState(initial)
  const pending = useRef<Camera | undefined>(undefined)
  const frame = useRef<number | undefined>(undefined)

  const schedule = useCallback((next: Camera) => {
    pending.current = next
    if (frame.current !== undefined) return
    frame.current = requestAnimationFrame(() => {
      frame.current = undefined
      if (pending.current) setCamera(pending.current)
    })
  }, [])

  useEffect(
    () => () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current)
    },
    [],
  )

  return [camera, schedule]
}

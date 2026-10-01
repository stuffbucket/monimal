import { describe, expect, it } from "vitest"

import {
  connectorSegment,
  geometryBackend,
  rectanglesIntersect,
} from "../src/geometry.ts"

describe("WebAssembly geometry", () => {
  it("uses the WebAssembly backend", () => {
    expect(geometryBackend).toBe("wasm")
  })

  it("detects overlapping, touching, and separate rectangles", () => {
    const origin = { x: 0, y: 0, width: 10, height: 10 }
    expect(
      rectanglesIntersect(origin, { x: 5, y: 5, width: 2, height: 2 }),
    ).toBe(true)
    expect(
      rectanglesIntersect(origin, { x: 10, y: 10, width: 2, height: 2 }),
    ).toBe(true)
    expect(
      rectanglesIntersect(origin, { x: 11, y: 11, width: 2, height: 2 }),
    ).toBe(false)
  })

  it("culls a large scene inside one 60 FPS frame budget", () => {
    const viewport = { x: 0, y: 0, width: 1920, height: 1080 }
    const nodes = Array.from({ length: 10_000 }, (_, index) => ({
      x: (index % 200) * 24,
      y: Math.floor(index / 200) * 24,
      width: 20,
      height: 20,
    }))

    for (const node of nodes.slice(0, 100)) rectanglesIntersect(node, viewport)
    const started = performance.now()
    const visible = nodes.filter((node) => rectanglesIntersect(node, viewport))
    const duration = performance.now() - started

    expect(visible.length).toBeGreaterThan(0)
    expect(duration).toBeLessThan(1000 / 60)
  })

  it("attaches connectors to the facing rectangle edges", () => {
    const horizontal = connectorSegment(
      { x: 0, y: 0, width: 100, height: 60 },
      { x: 200, y: 10, width: 80, height: 80 },
    )
    expect(horizontal.x1).toBe(100)
    expect(horizontal.x2).toBe(200)
    expect(horizontal.y1).toBeCloseTo(35.263)
    expect(horizontal.y2).toBeCloseTo(45.789)

    const vertical = connectorSegment(
      { x: 0, y: 0, width: 100, height: 60 },
      { x: 20, y: 120, width: 80, height: 80 },
    )
    expect(vertical.y1).toBe(60)
    expect(vertical.y2).toBe(120)
    expect(vertical.x1).toBeCloseTo(52.308)
    expect(vertical.x2).toBeCloseTo(56.923)
  })
})

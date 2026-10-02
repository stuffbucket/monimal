import { describe, expect, it } from "vitest"

import { clampZoom, INITIAL_CAMERA, wheelZoomFactor } from "../src/view.ts"

describe("project map camera", () => {
  it("starts at the shared project overview", () => {
    expect(INITIAL_CAMERA).toEqual({ x: 340, y: 100, zoom: 1 })
  })

  it("uses a 30% slower continuous wheel zoom rate", () => {
    const previousFactor = Math.exp(-120 * 0.002)
    const nextFactor = wheelZoomFactor(120)

    expect(Math.log(nextFactor) / Math.log(previousFactor)).toBeCloseTo(0.7)
    expect(wheelZoomFactor(-120)).toBeCloseTo(1 / nextFactor)
  })

  it("keeps zoom within the supported range", () => {
    expect(clampZoom(0.01)).toBe(0.1)
    expect(clampZoom(10)).toBe(4)
  })
})

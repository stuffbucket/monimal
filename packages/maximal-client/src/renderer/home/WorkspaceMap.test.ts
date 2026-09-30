import { describe, expect, it } from 'vitest'

import {
  WORKSPACE_GRID_SIZE,
  WORKSPACE_WORLD_SIZE,
  workspaceGridIntersections,
} from './WorkspaceMap'

describe('workspaceGridIntersections', () => {
  it('keeps every visible dot on the 16,000 pixel world grid', () => {
    const points = workspaceGridIntersections({
      centerX: WORKSPACE_WORLD_SIZE / 2,
      centerY: WORKSPACE_WORLD_SIZE / 2,
      zoom: 1,
    }, 1_280, 800)

    expect(points.length).toBeGreaterThan(0)
    expect(points.every(({ worldX, worldY }) =>
      worldX >= 0
      && worldX <= WORKSPACE_WORLD_SIZE
      && worldY >= 0
      && worldY <= WORKSPACE_WORLD_SIZE
      && worldX % WORKSPACE_GRID_SIZE === 0
      && worldY % WORKSPACE_GRID_SIZE === 0)).toBe(true)
  })

  it('reduces dot density while zoomed out without leaving grid intersections', () => {
    const fullDensity = workspaceGridIntersections({
      centerX: 8_000,
      centerY: 8_000,
      zoom: 1,
    }, 1_280, 800)
    const reducedDensity = workspaceGridIntersections({
      centerX: 8_000,
      centerY: 8_000,
      zoom: 0.2,
    }, 1_280, 800)

    expect(reducedDensity.length).toBeLessThan(fullDensity.length * 8)
    expect(reducedDensity.every(({ worldX, worldY }) =>
      worldX % WORKSPACE_GRID_SIZE === 0
      && worldY % WORKSPACE_GRID_SIZE === 0)).toBe(true)
  })
})

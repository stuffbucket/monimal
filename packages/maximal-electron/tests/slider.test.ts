import { describe, expect, it } from 'vitest'

import { directionalSliderIndex } from '../src/renderer/components/controls/Fields'

describe('directional slider snapping', () => {
  it('uses travel direction to break midpoint ties', () => {
    expect(directionalSliderIndex(4.5, 1, 10)).toBe(5)
    expect(directionalSliderIndex(4.5, -1, 10)).toBe(4)
  })

  it('selects the nearest neighbor away from a midpoint', () => {
    expect(directionalSliderIndex(4.49, 1, 10)).toBe(4)
    expect(directionalSliderIndex(4.51, -1, 10)).toBe(5)
  })

  it('clamps pointer positions to the slider range', () => {
    expect(directionalSliderIndex(-1, -1, 10)).toBe(0)
    expect(directionalSliderIndex(11, 1, 10)).toBe(10)
  })
})

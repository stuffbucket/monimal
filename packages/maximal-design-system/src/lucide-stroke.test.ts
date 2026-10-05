import { describe, expect, it } from 'vitest'

import { HEAVY_STROKE_SIZE, lucideStroke } from './lucide-stroke'

describe('lucideStroke', () => {
  it('draws 1px below 48px and 2px at 48px and above', () => {
    expect(lucideStroke(16)).toEqual({ size: 16, strokeWidth: 1, absoluteStrokeWidth: true })
    expect(lucideStroke(HEAVY_STROKE_SIZE - 1).strokeWidth).toBe(1)
    expect(lucideStroke(HEAVY_STROKE_SIZE).strokeWidth).toBe(2)
    expect(lucideStroke(96).strokeWidth).toBe(2)
  })
})

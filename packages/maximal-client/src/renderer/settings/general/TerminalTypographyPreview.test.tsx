import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'

import {
  TerminalTypographyPreview,
  drawSample,
  previewRasterScale,
  thickenStrokeWidth,
  variationSampleStyle,
} from './TerminalTypographyPreview'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

describe('terminal typography preview', () => {
  it('makes the thicken toggle visible before adding its strength', () => {
    expect(thickenStrokeWidth(20, 0)).toBeCloseTo(0.36)
    expect(thickenStrokeWidth(20, 100)).toBeCloseTo(0.7129)
  })

  it('applies tracking before drawing both stroke and fill', () => {
    const calls: Array<[string, string]> = []
    let letterSpacing = ''
    const context = {
      font: '',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      lineJoin: 'miter',
      miterLimit: 10,
      get letterSpacing() {
        return letterSpacing
      },
      set letterSpacing(value: string) {
        letterSpacing = value
      },
      strokeText() {
        calls.push(['stroke', letterSpacing])
      },
      fillText() {
        calls.push(['fill', letterSpacing])
      },
    } as unknown as CanvasRenderingContext2D

    drawSample(context, 'sample', 0, 20, {
      fontFamily: 'ui-monospace',
      fontSize: 13,
      fontWeight: 400,
      fontVariations: {},
      cellHeight: 0,
      tracking: 10,
      baseline: 0,
      thicken: true,
      thickenStrength: 5,
      ligatures: true,
    }, 13, 400)

    expect(calls).toEqual([
      ['stroke', '0.1em'],
      ['fill', '0.1em'],
    ])
    expect(context.lineJoin).toBe('round')
    expect(context.miterLimit).toBe(2)
  })

  it('uses the terminal variation settings for the live axis specimen', () => {
    expect(variationSampleStyle({
      fontFamily: 'Fraunces',
      fontSize: 13,
      fontWeight: 425,
      fontVariations: { GRAD: 50, WONK: 1 },
      cellHeight: 0,
      tracking: 0,
      baseline: 0,
      thicken: false,
      thickenStrength: 5,
      ligatures: true,
    }).fontVariationSettings).toBe(
      '"GRAD" 50, "WONK" 1, "wght" 425',
    )
  })

  it('reserves the ramp geometry while the first raster renders', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    act(() => root.render(
      <TerminalTypographyPreview typography={{
        fontFamily: 'Placeholder Test',
        fontSize: 13,
        fontWeight: 400,
        fontVariations: {},
        cellHeight: 0,
        tracking: 0,
        baseline: 0,
        thicken: false,
        thickenStrength: 5,
        ligatures: true,
      }} />,
    ))

    expect(container.querySelector(
      '.terminal-typography-preview__placeholder',
    )?.textContent).toBe('Rendering terminal preview…')
    expect(container.querySelector(
      '[aria-label="Live terminal typography preview"]',
    )?.getAttribute('aria-busy')).toBe('true')

    act(() => root.unmount())
  })

  describe('previewRasterScale', () => {
    it('uses bounded device-pixel scaling for a crisp source image', () => {
      expect(previewRasterScale(2)).toBe(2)
      expect(previewRasterScale(8)).toBe(4)
      expect(previewRasterScale(0)).toBe(1)
      expect(previewRasterScale(Number.NaN)).toBe(1)
    })
  })
})

import { describe, expect, it } from 'vitest'

import { deltaEOk, gamutMap, hexFromOklch, maxChroma, oklchFromHex, wcagContrast } from './oklab'
import {
  BRAND_HEX,
  BRAND_SOURCE_HEX,
  COLOR_HUES,
  COLOR_STEPS,
  alphaRamp,
  anchoredRamp,
  brandHueRamp,
  hueRamp,
  neutralRamp,
  paleRamp,
} from './ramps'
import { REFERENCE_PALE_HUES, REFERENCE_PALE_RAMPS, REFERENCE_RAMPS } from './reference'

const difference = (left: string, right: string) =>
  deltaEOk(oklchFromHex(left), oklchFromHex(right))

describe('OKLab conversion', () => {
  it('round-trips every sRGB hex it is given', () => {
    for (const hex of ['#000000', '#ffffff', '#0d99ff', '#ff5c15', '#16181d', '#7f7f7f']) {
      expect(hexFromOklch(oklchFromHex(hex))).toBe(hex)
    }
  })

  it('maps an out-of-gamut colour into sRGB at the same lightness and hue', () => {
    const vivid = { l: 0.7, c: 0.4, h: 145 }
    const mapped = gamutMap(vivid)
    expect(mapped.c).toBeLessThan(vivid.c)
    expect(mapped.l).toBeCloseTo(vivid.l, 1)
    expect(Math.abs(mapped.h - vivid.h)).toBeLessThan(3)
  })
})

describe('reference hue ramps', () => {
  /*
   * The calculated ramps must reproduce the calibration data: ΔE_OK 0.02 is
   * one just-noticeable difference, and the sampling itself is within two
   * sRGB units.
   */
  it.each(['light', 'dark'] as const)('reproduce every %s reference step within one JND', (mode) => {
    for (const hue of COLOR_HUES) {
      const ramp = hueRamp(hue, mode)
      COLOR_STEPS.forEach((step, index) => {
        expect(
          difference(ramp[step], REFERENCE_RAMPS[mode][hue][index] ?? ''),
          `${mode} ${hue}-${String(step)}`,
        ).toBeLessThan(0.005)
      })
    }
  })

  it('reproduce every pale reference step within one JND', () => {
    for (const hue of REFERENCE_PALE_HUES) {
      const ramp = paleRamp(hue)
      COLOR_STEPS.forEach((step, index) => {
        expect(
          difference(ramp[step], REFERENCE_PALE_RAMPS[hue][index] ?? ''),
          `pale ${hue}-${String(step)}`,
        ).toBeLessThan(0.005)
      })
    }
  })

  it('include persimmon and a pale orange interpolated between its neighbours', () => {
    expect(COLOR_HUES).toContain('persimmon')
    const orange = oklchFromHex(paleRamp('orange')[500])
    const full = oklchFromHex(hueRamp('orange', 'light')[500])
    expect(orange.c).toBeLessThan(full.c)
    expect(Math.abs(orange.h - full.h)).toBeLessThan(25)
  })

  // The reference repeats dark teal 500 at 600, so a step is never lighter than the one before it.
  it.each(['light', 'dark'] as const)('never lighten from 100 to 1000 in %s mode', (mode) => {
    for (const hue of COLOR_HUES) {
      const lightness = COLOR_STEPS.map((step) => oklchFromHex(hueRamp(hue, mode)[step]).l)
      for (let index = 1; index < lightness.length; index += 1) {
        expect(lightness[index], `${hue}-${String(COLOR_STEPS[index])}`)
          .toBeLessThanOrEqual(lightness[index - 1] ?? 1)
      }
    }
  })

  it('darken and desaturate the dark anchor', () => {
    for (const hue of COLOR_HUES) {
      const light = oklchFromHex(hueRamp(hue, 'light')[500])
      const dark = oklchFromHex(hueRamp(hue, 'dark')[500])
      expect(dark.l, hue).toBeLessThan(light.l)
    }
  })
})

describe('anchored ramps', () => {
  it('keep the anchor exactly at 500', () => {
    expect(anchoredRamp('#2159D1', 'light')[500]).toBe('#2159d1')
  })

  it('reproduce a reference ramp from its own anchor', () => {
    const ramp = anchoredRamp(REFERENCE_RAMPS.light.blue[4] ?? '', 'light')
    COLOR_STEPS.forEach((step, index) => {
      expect(difference(ramp[step], REFERENCE_RAMPS.light.blue[index] ?? ''))
        .toBeLessThan(0.005)
    })
  })

  it.each(['light', 'dark'] as const)('never lighten from 100 to 1000 in %s mode for any accent', (mode) => {
    for (const accent of ['#2159D1', '#62A9B7', '#C9A227', '#2E7D5B', '#8A6E3F', '#FF6FB5', '#3B2A50']) {
      const lightness = COLOR_STEPS.map((step) => oklchFromHex(anchoredRamp(accent, mode)[step]).l)
      for (let index = 1; index < lightness.length; index += 1) {
        expect(lightness[index], `${accent} ${String(COLOR_STEPS[index])}`)
          .toBeLessThanOrEqual(lightness[index - 1] ?? 1)
      }
    }
  })

  it('hold a hue between calibrated hues', () => {
    const ramp = anchoredRamp('#62A9B7', 'dark')
    const anchor = oklchFromHex('#62A9B7')
    for (const step of [300, 700] as const) {
      expect(Math.abs(oklchFromHex(ramp[step]).h - anchor.h)).toBeLessThan(25)
    }
  })
})

describe('brand ramp', () => {
  it('keeps the published lightness and hue and adds chroma', () => {
    const source = oklchFromHex(BRAND_SOURCE_HEX)
    const brand = oklchFromHex(BRAND_HEX)
    expect(brand.l).toBeCloseTo(source.l, 2)
    expect(Math.abs(brand.h - source.h)).toBeLessThan(1)
    expect(brand.c / maxChroma(brand.l, brand.h)).toBeGreaterThan(0.88)
    expect(source.c / maxChroma(source.l, source.h)).toBeLessThan(0.75)
    expect(wcagContrast(BRAND_HEX, '#ffffff')).toBeGreaterThanOrEqual(wcagContrast(BRAND_SOURCE_HEX, '#ffffff'))
  })

  it('anchors light 500 on the brand colour and darkens the dark anchor', () => {
    expect(brandHueRamp('light')[500]).toBe(BRAND_HEX)
    expect(oklchFromHex(brandHueRamp('dark')[500]).l).toBeLessThan(oklchFromHex(BRAND_HEX).l)
  })

  it.each(['light', 'dark'] as const)('never lightens and stays visible on its %s panel', (mode) => {
    const panel = oklchFromHex(mode === 'light' ? '#ffffff' : REFERENCE_RAMPS.dark.grey[7] ?? '')
    const ramp = brandHueRamp(mode)
    COLOR_STEPS.forEach((step, index) => {
      const color = oklchFromHex(ramp[step])
      expect(deltaEOk(color, panel), String(step)).toBeGreaterThanOrEqual(0.02)
      const previous = COLOR_STEPS[index - 1]
      if (previous !== undefined) expect(color.l, String(step)).toBeLessThanOrEqual(oklchFromHex(ramp[previous]).l)
    })
  })
})

describe('neutral ramps', () => {
  it('run from background to text in light mode', () => {
    const ramp = neutralRamp('#FFFFFF', '#12141A', 'light')
    expect(ramp[100]).toBe('#ffffff')
    expect(ramp[1000]).toBe('#12141a')
  })

  it('number by lightness in dark mode', () => {
    const ramp = neutralRamp('#16181D', '#F5F5F5', 'dark')
    expect(ramp[1000]).toBe('#16181d')
    expect(ramp[100]).toBe('#f5f5f5')
    expect(wcagContrast(ramp[900], ramp[1000])).toBeLessThan(wcagContrast(ramp[800], ramp[1000]))
  })
})

describe('alpha ramps', () => {
  it('state opacity at each step', () => {
    expect(alphaRamp('white')[100]).toBe('rgb(255 255 255 / 0.05)')
    expect(alphaRamp('black')[1000]).toBe('#000000')
  })
})

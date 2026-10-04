// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { DEFAULT_APPEARANCE } from '../appearance'
import { BUILT_IN_THEMES } from '../themes/catalog'
import { deltaEOk, oklchFromHex, wcagContrast } from './oklab'
import {
  PALETTE_STYLE_ID,
  applyPalette,
  paletteCss,
  paletteTokens,
  resolvePaletteToken,
  type PaletteTokens,
} from './palette'
import {
  BRAND_COLOR,
  BRAND_CREAM_COLOR,
  BRAND_CREAM_HEX,
  BRAND_CREAM_SOURCE_HEX,
  BRAND_HEX,
  BRAND_RAMP,
  BRAND_SOURCE_HEX,
  COLOR_HUES,
  COLOR_STEPS,
  anchoredRamp,
} from './ramps'
import { REFERENCE_RAMPS } from './reference'

const MODES = ['light', 'dark'] as const

/* Built rather than written out, so the token inventory does not read test expectations as references. */
function atomicAlias(ramp: string, step: number): string {
  return `var(${['', '', 'maximal', 'color', ramp, String(step)].join('-')})`
}

function color(tokens: PaletteTokens, name: string): string {
  return resolvePaletteToken(tokens, `--maximal-color-${name}`)
}

/* Composites an `rgb(r g b / a)` foreground over an opaque hex background, so translucent text can be measured. */
function over(foreground: string, background: string): string {
  const match = /^rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)$/.exec(foreground)
  if (match === null) return foreground
  const [red, green, blue, alpha] = match.slice(1).map(Number) as [number, number, number, number]
  const base = [1, 3, 5].map((index) => Number.parseInt(background.slice(index, index + 2), 16))
  return `#${[red, green, blue].map((channel, index) => Math.round((channel * alpha) + ((base[index] ?? 0) * (1 - alpha)))
    .toString(16).padStart(2, '0')).join('')}`
}

describe('palette tokens', () => {
  it('defines every atomic ramp, including persimmon and pale orange', () => {
    const { light, dark } = paletteTokens(DEFAULT_APPEARANCE.colors)
    for (const tokens of [light, dark]) {
      for (const ramp of ['grey', 'neutral', 'brand', BRAND_RAMP, 'white', 'black', ...COLOR_HUES, ...COLOR_HUES.map((hue) => `pale-${hue}`)]) {
        for (const step of COLOR_STEPS) {
          expect(tokens[`--maximal-color-${ramp}-${String(step)}`], `${ramp}-${String(step)}`).toBeDefined()
        }
      }
    }
    expect(light['--maximal-color-persimmon-500']).toMatch(/^#[0-9a-f]{6}$/)
    expect(light['--maximal-color-pale-orange-100']).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('aliases the semantic colours to atomic steps', () => {
    const { light } = paletteTokens(DEFAULT_APPEARANCE.colors)
    expect(light['--maximal-color-bg-default']).toBe(atomicAlias('neutral', 100))
    expect(light['--maximal-color-text-default']).toBe(atomicAlias('neutral', 1000))
    expect(light['--maximal-color-bg-brand']).toBe(atomicAlias('brand', 500))
  })

  it('keeps each theme seed exact', () => {
    for (const theme of BUILT_IN_THEMES) {
      const tokens = paletteTokens(theme.colors)
      for (const mode of MODES) {
        const seed = theme.colors[mode]
        expect(color(tokens[mode], 'bg-default')).toBe(seed.background.toLowerCase())
        expect(color(tokens[mode], 'bg-secondary')).toBe(seed.surface.toLowerCase())
        expect(color(tokens[mode], 'text-default')).toBe(seed.text.toLowerCase())
        expect(color(tokens[mode], 'bg-brand')).toBe(seed.accent.toLowerCase())
      }
    }
  })

  it('keeps canvas text the same in every theme and mode, and readable on its half of the range', () => {
    const named = (name: string) => `--${['maximal', 'color', name].join('-')}` as const
    const values = [DEFAULT_APPEARANCE, ...BUILT_IN_THEMES].flatMap((theme) => {
      const tokens = paletteTokens(theme.colors)
      return MODES.map((mode) => ['onlightcanvas', 'onlightcanvas-secondary', 'ondarkcanvas', 'ondarkcanvas-secondary']
        .map((name) => resolvePaletteToken(tokens[mode], named(`text-${name}`))).join(' '))
    })
    expect(new Set(values).size).toBe(1)
    const t = paletteTokens(DEFAULT_APPEARANCE.colors).light
    for (const canvas of ['#808080', '#ffffff']) {
      expect(wcagContrast(over(color(t, 'text-onlightcanvas'), canvas), canvas), `onlightcanvas on ${canvas}`).toBeGreaterThanOrEqual(4.5)
    }
    for (const canvas of ['#7f7f7f', '#000000']) {
      expect(wcagContrast(over(color(t, 'text-ondarkcanvas'), canvas), canvas), `ondarkcanvas on ${canvas}`).toBeGreaterThanOrEqual(3)
      expect(wcagContrast(over(color(t, 'text-ondarkcanvas-secondary'), '#000000'), '#000000'), 'ondarkcanvas secondary').toBeGreaterThanOrEqual(4.5)
    }
    expect(wcagContrast(over(color(t, 'text-onlightcanvas-secondary'), '#ffffff'), '#ffffff'), 'onlightcanvas secondary').toBeGreaterThanOrEqual(3)
  })

  it('draws canvas icons in the canvas text colours and neutral icons in the neutral text colours', () => {
    for (const theme of [DEFAULT_APPEARANCE, ...BUILT_IN_THEMES]) {
      const tokens = paletteTokens(theme.colors)
      for (const mode of MODES) {
        for (const name of ['default', 'secondary', 'tertiary', 'onlightcanvas', 'ondarkcanvas']) {
          expect(color(tokens[mode], `icon-${name}`), `${theme.id} ${mode} icon-${name}`).toBe(color(tokens[mode], `text-${name}`))
        }
      }
    }
  })

  it('gives every role a colour for every type', () => {
    const t = paletteTokens(DEFAULT_APPEARANCE.colors).dark
    for (const role of ['brand', 'selected', 'disabled', 'component', 'assistive', 'danger', 'measure', 'warning', 'success', 'info', 'inverse']) {
      for (const type of ['bg', 'text', 'icon', 'border']) expect(color(t, `${type}-${role}`), `${type}-${role}`).toMatch(/^(#[0-9a-f]{6}|rgb\(\d+ \d+ \d+ \/ [\d.]+\))$/)
    }
  })

  it('fills selected with brand 200, info with blue 200, and success with green 500 in both modes', () => {
    const tokens = paletteTokens(DEFAULT_APPEARANCE.colors)
    const step = (ramp: string, value: number) => `var(--${['maximal', 'color', ramp, String(value)].join('-')})`
    for (const mode of MODES) {
      expect(tokens[mode]['--maximal-color-bg-selected']).toBe(step('brand', 200))
      expect(tokens[mode]['--maximal-color-bg-success']).toBe(step('green', 500))
      expect(tokens[mode]['--maximal-color-bg-info']).toBe(step('blue', 200))
    }
  })

  it('fills disabled with white 500 in dark mode', () => {
    const tokens = paletteTokens(DEFAULT_APPEARANCE.colors)
    expect(tokens.dark['--maximal-color-bg-disabled']).toBe(`var(--${['maximal', 'color', 'white', '500'].join('-')})`)
  })

  it('makes the Maximal brand the refined crimson', () => {
    const tokens = paletteTokens(DEFAULT_APPEARANCE.colors)
    expect(color(tokens.light, 'bg-brand')).toBe(BRAND_HEX)
    expect(oklchFromHex(color(tokens.dark, 'bg-brand')).h).toBeCloseTo(oklchFromHex(BRAND_HEX).h, 0)
  })

  it('refines the brand cream with the crimson\'s chroma factor and keeps its lightness and hue', () => {
    const source = oklchFromHex(BRAND_CREAM_SOURCE_HEX)
    const refined = oklchFromHex(BRAND_CREAM_HEX)
    expect(refined.l).toBeCloseTo(source.l, 2)
    /* Eight-bit rounding moves the hue of so faint a colour by up to a degree. */
    expect(Math.abs(refined.h - source.h)).toBeLessThan(1)
    expect(BRAND_CREAM_COLOR.c / source.c).toBeCloseTo(BRAND_COLOR.c / oklchFromHex(BRAND_SOURCE_HEX).c, 6)
  })

  it('puts cream on the brand fill wherever it reads at 4.5:1, and white or black elsewhere', () => {
    const maximal = paletteTokens(DEFAULT_APPEARANCE.colors)
    expect(color(maximal.light, 'text-onbrand')).toBe(BRAND_CREAM_HEX)
    expect(color(maximal.light, 'icon-onbrand')).toBe(BRAND_CREAM_HEX)
    for (const theme of [DEFAULT_APPEARANCE, ...BUILT_IN_THEMES]) {
      const tokens = paletteTokens(theme.colors)
      for (const mode of MODES) {
        const fill = color(tokens[mode], 'bg-brand')
        const on = color(tokens[mode], 'text-onbrand')
        const label = `${theme.id} ${mode}`
        if (wcagContrast(BRAND_CREAM_HEX, fill) >= 4.5) expect(on, label).toBe(BRAND_CREAM_HEX)
        else expect(['#ffffff', '#000000'], label).toContain(on)
      }
    }
  })

  it('pins icon-onbrand to the brand cream in both Maximal modes', () => {
    const maximal = paletteTokens(DEFAULT_APPEARANCE.colors)
    for (const mode of MODES) {
      expect(maximal[mode]['--maximal-color-icon-onbrand']).toBe(atomicAlias('cream', 1000))
      expect(color(maximal[mode], 'icon-onbrand')).toBe(BRAND_CREAM_HEX)
    }
  })

  it('selects toolbar, menu and tooltip items with the brand fill', () => {
    const tokens = paletteTokens(DEFAULT_APPEARANCE.colors)
    for (const mode of MODES) {
      for (const element of ['toolbar', 'menu', 'tooltip']) {
        expect(color(tokens[mode], `bg-${element}-selected`)).toBe(color(tokens[mode], 'bg-brand'))
        expect(color(tokens[mode], `bg-${element}-hover`)).not.toBe(color(tokens[mode], `bg-${element}-default`))
      }
      expect(color(tokens[mode], 'bg-toolbar-default')).toBe(color(tokens[mode], 'bg-default'))
      expect(color(tokens[mode], 'bg-menu-default')).toBe(color(tokens[mode], 'bg-tertiary'))
    }
  })

  it('meets the contrast minimums in every built-in theme and mode', () => {
    for (const theme of BUILT_IN_THEMES) {
      const tokens = paletteTokens(theme.colors)
      for (const mode of MODES) {
        const t = tokens[mode]
        const label = `${theme.id} ${mode}`
        const background = color(t, 'bg-default')
        const surface = color(t, 'bg-secondary')
        for (const text of ['text-secondary', 'text-tertiary']) {
          expect(wcagContrast(color(t, text), background), `${label} ${text}`).toBeGreaterThanOrEqual(4.5)
        }
        expect(wcagContrast(color(t, 'text-onbrand'), color(t, 'bg-brand')), `${label} onbrand`).toBeGreaterThanOrEqual(4.5)
        for (const role of ['brand', 'component', 'assistive', 'danger', 'measure', 'warning', 'success']) {
          for (const surfaceName of ['bg-default', 'bg-secondary', `bg-${role}-secondary`]) {
            const surfaceColor = color(t, surfaceName)
            expect(wcagContrast(color(t, `text-${role}`), surfaceColor), `${label} text-${role} on ${surfaceName}`)
              .toBeGreaterThanOrEqual(4.5)
            for (const graphic of [`icon-${role}`, `border-${role}`]) {
              expect(wcagContrast(color(t, graphic), surfaceColor), `${label} ${graphic} on ${surfaceName}`)
                .toBeGreaterThanOrEqual(3)
            }
          }
          for (const fill of [`bg-${role}`, `bg-${role}-hover`, `bg-${role}-pressed`]) {
            expect(wcagContrast(color(t, `text-on${role}`), color(t, fill)), `${label} text-on${role} on ${fill}`)
              .toBeGreaterThanOrEqual(role === 'brand' ? 4.5 : 3)
          }
          expect(wcagContrast(over(color(t, `text-on${role}-secondary`), color(t, `bg-${role}`)), color(t, `bg-${role}`)), `${label} text-on${role}-secondary`)
            .toBeGreaterThanOrEqual(3)
        }
        for (const role of ['selected', 'info']) {
          for (const fill of [`bg-${role}`, `bg-${role}-hover`, `bg-${role}-pressed`]) {
            expect(wcagContrast(color(t, `text-on${role}`), color(t, fill)), `${label} text-on${role} on ${fill}`)
              .toBeGreaterThanOrEqual(4.5)
          }
          for (const surfaceName of ['bg-default', 'bg-secondary']) {
            expect(wcagContrast(color(t, `text-${role}`), color(t, surfaceName)), `${label} text-${role} on ${surfaceName}`)
              .toBeGreaterThanOrEqual(4.5)
          }
          expect(wcagContrast(color(t, `border-${role}`), background), `${label} border-${role}`).toBeGreaterThanOrEqual(3)
        }
        expect(wcagContrast(color(t, 'text-inverse'), color(t, 'bg-inverse')), `${label} inverse`).toBeGreaterThanOrEqual(4.5)
        for (let series = 1; series <= 8; series += 1) {
          const value = resolvePaletteToken(t, `--data-viz-series-${String(series)}`)
          expect(wcagContrast(value, surface), `${label} series ${String(series)}`).toBeGreaterThanOrEqual(3)
        }
      }
    }
  })

  it('keeps strong selection borders readable on every selected fill and element borders on their own surfaces', () => {
    for (const theme of [DEFAULT_APPEARANCE, ...BUILT_IN_THEMES]) {
      const tokens = paletteTokens(theme.colors)
      for (const mode of MODES) {
        const t = tokens[mode]
        const label = `${theme.id} ${mode}`
        expect(color(t, 'border-selected-strong')).toBe(color(t, 'text-onselected'))
        for (const fill of ['bg-selected', 'bg-selected-hover', 'bg-selected-pressed']) {
          expect(wcagContrast(color(t, 'border-selected-strong'), color(t, fill)), `${label} on ${fill}`)
            .toBeGreaterThanOrEqual(4.5)
        }
        for (const element of ['toolbar', 'menu']) {
          const surface = color(t, `bg-${element}-default`)
          const divider = color(t, `border-${element}-default`)
          const strong = color(t, `border-${element}-strong`)
          expect(divider, `${label} ${element} divider`).toMatch(/^#[0-9a-f]{6}$/)
          expect(wcagContrast(strong, surface), `${label} ${element} strong`).toBeGreaterThanOrEqual(3)
          expect(wcagContrast(strong, surface), `${label} ${element} hierarchy`)
            .toBeGreaterThan(wcagContrast(divider, surface))
        }
      }
    }
  })

  /*
   * The reference sheets draw light ramps on white and dark ramps on dark
   * grey 800, and every reference hue step stays at least one JND (ΔE_OK
   * 0.02) from its panel. Brand ramps meet the same floor whatever the accent.
   */
  it('keeps every brand step visible on the reference panel for its mode', () => {
    const panels = { light: '#ffffff', dark: REFERENCE_RAMPS.dark.grey[7] ?? '' }
    for (const theme of [DEFAULT_APPEARANCE, ...BUILT_IN_THEMES]) {
      for (const mode of MODES) {
        const ramp = anchoredRamp(theme.colors[mode].accent, mode)
        for (const step of COLOR_STEPS) {
          expect(
            deltaEOk(oklchFromHex(ramp[step]), oklchFromHex(panels[mode])),
            `${theme.id} ${mode} brand-${String(step)}`,
          ).toBeGreaterThanOrEqual(0.02)
        }
      }
    }
  })

  it('writes both modes into one stylesheet and replaces it on a theme change', () => {
    applyPalette(DEFAULT_APPEARANCE.colors)
    const style = document.getElementById(PALETTE_STYLE_ID)
    expect(style?.textContent).toBe(paletteCss(DEFAULT_APPEARANCE.colors))
    expect(style?.textContent).toContain(':root {')
    expect(style?.textContent).toContain("[data-theme='light'] {")

    const other = BUILT_IN_THEMES.find((theme) => theme.id !== DEFAULT_APPEARANCE.id)
    if (other === undefined) throw new Error('No second built-in theme.')
    applyPalette(other.colors)
    expect(document.querySelectorAll(`#${PALETTE_STYLE_ID}`)).toHaveLength(1)
    expect(document.getElementById(PALETTE_STYLE_ID)?.textContent).toBe(paletteCss(other.colors))
  })
})

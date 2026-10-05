// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_PALETTE_FIXTURE, PALETTE_FIXTURES } from './color/fixtures'
import { PALETTE_STYLE_ID, paletteCss } from './color/palette'
import {
  applyTheme,
  createThemeManager,
  resolveThemeMode,
  type ThemeMediaQuery,
} from './theme'

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme')
  document.getElementById(PALETTE_STYLE_ID)?.remove()
})

describe('design-system themes', () => {
  it('calculates and applies the selected theme without exposing palette steps', () => {
    applyTheme({ appearance: 'light', colors: DEFAULT_PALETTE_FIXTURE.colors })

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.getElementById(PALETTE_STYLE_ID)?.textContent)
      .toBe(paletteCss(DEFAULT_PALETTE_FIXTURE.colors))
  })

  it('resolves system mode through the supplied environment', () => {
    expect(resolveThemeMode('system', () => mediaQuery(true))).toBe('light')
    expect(resolveThemeMode('system', () => mediaQuery(false))).toBe('dark')
    expect(resolveThemeMode('dark', () => mediaQuery(true))).toBe('dark')
  })

  it('recalculates an active system theme when the operating-system scheme changes', () => {
    let light = false
    let onChange: (() => void) | undefined
    const media: ThemeMediaQuery = {
      get matches() { return light },
      addEventListener: (_type, listener) => { onChange = listener },
      removeEventListener: vi.fn(),
    }
    const manager = createThemeManager({ document, matchMedia: () => media })
    const alternate = PALETTE_FIXTURES[1]
    if (alternate === undefined) throw new Error('A second palette fixture is required.')

    manager.setTheme({ appearance: 'system', colors: alternate.colors })
    expect(document.documentElement.dataset.theme).toBe('dark')

    light = true
    onChange?.()
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.getElementById(PALETTE_STYLE_ID)?.textContent).toBe(paletteCss(alternate.colors))

    manager.dispose()
    expect(media.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })
})

function mediaQuery(matches: boolean): ThemeMediaQuery {
  return {
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
}

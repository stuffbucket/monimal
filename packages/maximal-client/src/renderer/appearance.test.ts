import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  applyAppearance,
  appearanceAccent,
  appearanceSpatialCanvasBackground,
  DEFAULT_APPEARANCE,
  parseAppearanceTheme,
  readAppearance,
  saveAppearance,
} from './appearance'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-appearance-preset')
  document.documentElement.removeAttribute('style')
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })))
})

describe('appearance themes', () => {
  it('rejects an unknown schema and invalid colors', () => {
    expect(() => parseAppearanceTheme('{"schema":"unknown"}')).toThrow(
      'unsupported schema',
    )
    expect(() =>
      parseAppearanceTheme(JSON.stringify({
        ...DEFAULT_APPEARANCE,
        colors: { accent: 'blue' },
      })),
    ).toThrow('six-digit hex')
    expect(() =>
      parseAppearanceTheme(JSON.stringify({
        ...DEFAULT_APPEARANCE,
        colors: { spatialCanvasBackground: 'transparent' },
      })),
    ).toThrow('Spatial canvas background')
    expect(() =>
      parseAppearanceTheme(JSON.stringify({
        ...DEFAULT_APPEARANCE,
        colors: { spatialCanvasBackground: 123456 },
      })),
    ).toThrow('Spatial canvas background')
  })

  it('normalizes portable colors and omits an empty color map', () => {
    expect(parseAppearanceTheme(JSON.stringify({
      ...DEFAULT_APPEARANCE,
      colors: {
        accent: '#aabbcc',
        spatialCanvasBackground: '#123abc',
      },
    })).colors).toEqual({
      accent: '#AABBCC',
      spatialCanvasBackground: '#123ABC',
    })
    expect(parseAppearanceTheme(JSON.stringify(DEFAULT_APPEARANCE))).not
      .toHaveProperty('colors')
  })

  it('persists and applies a Pantone preset', () => {
    saveAppearance({
      ...DEFAULT_APPEARANCE,
      name: 'Mocha',
      appearance: 'dark',
      preset: 'mocha-mousse-2025',
    })

    expect(readAppearance().theme.name).toBe('Mocha')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.style.getPropertyValue('--shell-accent')).toBe(
      '#A47764',
    )
  })

  it('uses the operating-system scheme for system mode', () => {
    vi.mocked(matchMedia).mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList)

    applyAppearance(DEFAULT_APPEARANCE)

    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('uses the shipped dark palette when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined)

    expect(appearanceAccent(DEFAULT_APPEARANCE)).toBe('#5198A6')
    expect(() => applyAppearance(DEFAULT_APPEARANCE)).not.toThrow()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('applies Apple semantic surfaces and mode-specific system blue', () => {
    applyAppearance({
      ...DEFAULT_APPEARANCE,
      appearance: 'dark',
      preset: 'apple-system',
    })

    const style = document.documentElement.style
    expect(style.getPropertyValue('--shell-background')).toBe('#000000')
    expect(style.getPropertyValue('--shell-canvas')).toBe('#1C1C1E')
    expect(style.getPropertyValue('--shell-accent')).toBe('#0A84FF')
  })

  it('does not force low-contrast Pantone accents in dark mode', () => {
    applyAppearance({
      ...DEFAULT_APPEARANCE,
      appearance: 'dark',
      preset: 'viva-magenta-2023',
    })

    expect(document.documentElement.style.getPropertyValue('--shell-accent')).toBe('')
    expect(
      document.documentElement.style.getPropertyValue('--shell-accent-muted'),
    ).toContain('187 38 73')
  })

  it('reports the accent currently represented by the preset', () => {
    expect(appearanceAccent({
      ...DEFAULT_APPEARANCE,
      appearance: 'light',
      preset: 'viva-magenta-2023',
    })).toBe('#BB2649')
  })

  it('chooses a legible solid-button foreground for a custom accent', () => {
    applyAppearance({
      ...DEFAULT_APPEARANCE,
      colors: { accent: '#F0EEE9' },
    })

    expect(
      document.documentElement.style.getPropertyValue('--shell-accent-contrast'),
    ).toBe('#000000')
  })

  it('applies and persists a dedicated spatial canvas background', () => {
    saveAppearance({
      ...DEFAULT_APPEARANCE,
      colors: { spatialCanvasBackground: '#123456' },
    })

    expect(appearanceSpatialCanvasBackground(readAppearance().theme)).toBe(
      '#123456',
    )
    expect(
      document.documentElement.style.getPropertyValue(
        '--shell-spatial-canvas-background',
      ),
    ).toBe('#123456')
  })

  it('resolves spatial canvas backgrounds from presets and mode fallbacks', () => {
    expect(appearanceSpatialCanvasBackground({
      ...DEFAULT_APPEARANCE,
      appearance: 'light',
      preset: 'apple-system',
    })).toBe('#F2F2F7')
    expect(appearanceSpatialCanvasBackground({
      ...DEFAULT_APPEARANCE,
      appearance: 'dark',
      preset: 'apple-system',
    })).toBe('#1C1C1E')
    expect(appearanceSpatialCanvasBackground({
      ...DEFAULT_APPEARANCE,
      appearance: 'light',
      preset: 'viva-magenta-2023',
    })).toBe('#EEF0F4')
    expect(appearanceSpatialCanvasBackground({
      ...DEFAULT_APPEARANCE,
      appearance: 'dark',
      preset: 'mocha-mousse-2025',
    })).toBe('#1C1F26')
  })

  it('surfaces corrupt persisted data and falls back safely', () => {
    localStorage.setItem('maximal.appearance.v1', '{')
    const state = readAppearance()
    expect(state.theme).toEqual(DEFAULT_APPEARANCE)
    expect(state.error).toBeTruthy()
  })
})

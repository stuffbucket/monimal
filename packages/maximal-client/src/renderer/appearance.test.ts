import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  applyAppearance,
  appearanceAccent,
  appearanceSpatialCanvasBackground,
  contrastRatio,
  DEFAULT_APPEARANCE,
  parseAppearanceTheme,
  readAppearance,
  saveAppearance,
  serializeAppearance,
  terminalPaletteForTheme,
  themeGradient,
} from './appearance'
import {
  BRAND_CREAM_HEX,
  PALETTE_STYLE_ID,
  paletteCss,
  paletteTokens,
  resolvePaletteToken,
} from '@maximal/maximal-design-system/color'
import { BUILT_IN_THEMES } from './themes/catalog'

const TERMINAL_PALETTE = {
  mode: 'auto',
  dark: {
    background: '#111317',
    foreground: '#F5F5F5',
    cursor: '#5198A6',
    selectionBackground: '#264F78',
    black: '#1E1E1E',
    red: '#F44747',
    green: '#6A9955',
    yellow: '#D7BA7D',
    blue: '#569CD6',
    magenta: '#C586C0',
    cyan: '#4EC9B0',
    white: '#D4D4D4',
    brightBlack: '#808080',
    brightRed: '#F44747',
    brightGreen: '#6A9955',
    brightYellow: '#D7BA7D',
    brightBlue: '#569CD6',
    brightMagenta: '#C586C0',
    brightCyan: '#4EC9B0',
    brightWhite: '#FFFFFF',
  },
  light: {
    background: '#FAFAFA',
    foreground: '#383A42',
    cursor: '#2563EB',
    selectionBackground: '#BFCEFF',
    black: '#383A42',
    red: '#E45649',
    green: '#50A14F',
    yellow: '#986801',
    blue: '#4078F2',
    magenta: '#A626A4',
    cyan: '#0184BC',
    white: '#D7D7D7',
    brightBlack: '#696C77',
    brightRed: '#C93B2F',
    brightGreen: '#3F8F3E',
    brightYellow: '#8A5D00',
    brightBlue: '#2F67DB',
    brightMagenta: '#8F218D',
    brightCyan: '#00749F',
    brightWhite: '#FFFFFF',
  },
  minimumContrast: 4.5,
  effects: {
    opacity: 1,
    blur: 0,
    tint: '#5198A6',
    tintAmount: 0,
    tone: 0,
    blendMode: 'normal',
    stamp: false,
    compensate: true,
  },
} satisfies Parameters<typeof terminalPaletteForTheme>[1]

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
  it('auto-discovers the foundations, expanded themes, and complete hue board', () => {
    expect(BUILT_IN_THEMES).toHaveLength(121)
    expect(new Set(BUILT_IN_THEMES.map(({ id }) => id)).size).toBe(121)
    const boardThemes = BUILT_IN_THEMES.filter(({ id }) => id.startsWith('board-'))
    expect(boardThemes).toHaveLength(64)
    expect(new Set(boardThemes.map(({ placement }) =>
      `${String(placement?.cue)}:${String(placement?.hue)}`,
    )).size).toBe(64)
    expect(BUILT_IN_THEMES.find(({ id }) => id === 'maximized')?.shader)
      .toMatchObject({ material: 'candy-paint' })
  })

  it('uses colored surfaces rather than off-white for every hue-board zone', () => {
    for (const theme of BUILT_IN_THEMES.filter(({ id }) => id.startsWith('board-'))) {
      const mode = theme.appearance === 'light' ? 'light' : 'dark'
      const channels = [1, 3, 5].map((offset) =>
        Number.parseInt(theme.colors[mode].background.slice(offset, offset + 2), 16))
      expect(
        channels.every((channel) => channel >= 240),
        theme.id,
      ).toBe(false)
      expect(Math.max(...channels) - Math.min(...channels), theme.id)
        .toBeGreaterThanOrEqual(10)
    }
  })

  it('ships readable surface, text, accent, and button pairs', () => {
    for (const theme of BUILT_IN_THEMES) {
      for (const mode of ['light', 'dark'] as const) {
        const palette = theme.colors[mode]
        expect(
          contrastRatio(palette.text, palette.background),
          `${theme.id} ${mode} text/background`,
        ).toBeGreaterThanOrEqual(7)
        expect(
          contrastRatio(palette.text, palette.surface),
          `${theme.id} ${mode} text/surface`,
        ).toBeGreaterThanOrEqual(7)
        expect(
          contrastRatio(palette.accent, palette.background),
          `${theme.id} ${mode} accent/background`,
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('keeps an optional accent icon colour and rejects a malformed one', () => {
    const parsed = parseAppearanceTheme(JSON.stringify(DEFAULT_APPEARANCE))
    expect(parsed.colors.light.accentIcon).toBe(BRAND_CREAM_HEX.toUpperCase())
    expect(parsed.colors.dark.accentIcon).toBe(BRAND_CREAM_HEX.toUpperCase())
    expect(BUILT_IN_THEMES.find((theme) => theme.id === 'maximal')?.colors.dark.accentIcon).toBe(BRAND_CREAM_HEX.toUpperCase())
    expect(() =>
      parseAppearanceTheme(JSON.stringify({
        ...DEFAULT_APPEARANCE,
        colors: { ...DEFAULT_APPEARANCE.colors, dark: { ...DEFAULT_APPEARANCE.colors.dark, accentIcon: 'cream' } },
      })),
    ).toThrow('Dark accent icon must be a six-digit hex')
  })

  it('rejects unknown schemas, malformed palettes, and inaccessible accents', () => {
    expect(() => parseAppearanceTheme('{"schema":"unknown"}')).toThrow(
      'unsupported schema',
    )
    expect(() =>
      parseAppearanceTheme(JSON.stringify({
        ...DEFAULT_APPEARANCE,
        colors: {
          ...DEFAULT_APPEARANCE.colors,
          light: {
            ...DEFAULT_APPEARANCE.colors.light,
            accent: 'blue',
          },
        },
      })),
    ).toThrow('six-digit hex')
    expect(() =>
      parseAppearanceTheme(JSON.stringify({
        ...DEFAULT_APPEARANCE,
        colors: {
          ...DEFAULT_APPEARANCE.colors,
          spatialCanvasBackground: 'transparent',
        },
      })),
    ).toThrow('Spatial canvas background')
    expect(() =>
      parseAppearanceTheme(JSON.stringify({
        schema: 'https://maximal.dev/schemas/theme/v1',
        name: 'Legacy',
        appearance: 'dark',
        preset: 'maximal',
        colors: { spatialCanvasBackground: 'transparent' },
      })),
    ).toThrow('Spatial canvas background')
    expect(() =>
      parseAppearanceTheme(JSON.stringify({
        ...DEFAULT_APPEARANCE,
        colors: {
          ...DEFAULT_APPEARANCE.colors,
          spatialCanvasBackground: 123456,
        },
      })),
    ).toThrow('Spatial canvas background')
    expect(() =>
      parseAppearanceTheme(JSON.stringify({
        ...DEFAULT_APPEARANCE,
        colors: {
          ...DEFAULT_APPEARANCE.colors,
          light: {
            ...DEFAULT_APPEARANCE.colors.light,
            accent: '#FDFDFD',
          },
        },
      })),
    ).toThrow('WCAG AA')
    expect(() =>
      parseAppearanceTheme(JSON.stringify({
        ...DEFAULT_APPEARANCE,
        placement: { hue: 8, cue: 0 },
      })),
    ).toThrow('zero through seven')
  })

  it('normalizes portable spatial canvas colors', () => {
    const theme = parseAppearanceTheme(JSON.stringify({
      ...DEFAULT_APPEARANCE,
      colors: {
        ...DEFAULT_APPEARANCE.colors,
        spatialCanvasBackground: '#123abc',
      },
    }))

    expect(theme.colors.spatialCanvasBackground).toBe('#123ABC')
  })

  it('preserves namespaced extensions when a theme is exchanged', () => {
    const theme = parseAppearanceTheme(JSON.stringify({
      ...DEFAULT_APPEARANCE,
      extensions: {
        'dev.maximal.example': { density: 'compact' },
      },
    }))

    expect(serializeAppearance(theme)).toContain(
      '"dev.maximal.example": {',
    )
  })

  it('migrates a v1 preset into a complete v2 theme', () => {
    const themeWithoutOverrides = parseAppearanceTheme(JSON.stringify({
      schema: 'https://maximal.dev/schemas/theme/v1',
      name: 'Maximal',
      appearance: 'system',
      preset: 'maximal',
    }))
    const theme = parseAppearanceTheme(JSON.stringify({
      schema: 'https://maximal.dev/schemas/theme/v1',
      name: 'Mocha',
      appearance: 'dark',
      preset: 'mocha-mousse-2025',
      colors: { spatialCanvasBackground: '#123abc' },
    }))

    expect(themeWithoutOverrides.colors.spatialCanvasBackground).toBeUndefined()
    expect(theme.schema).toBe('https://maximal.dev/schemas/theme/v2')
    expect(theme.id).toBe('mocha-mousse-2025')
    expect(theme.colors.dark.accent).toBe('#C8967F')
    expect(theme.colors.spatialCanvasBackground).toBe('#123ABC')
  })

  it('persists and applies complete semantic tokens', () => {
    const theme = BUILT_IN_THEMES.find(({ id }) => id === 'celadon-studio')!
    saveAppearance(theme)

    expect(readAppearance().theme.name).toBe('Celadon Studio')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.documentElement.dataset.appearancePreset).toBe('celadon-studio')
    expect(document.getElementById(PALETTE_STYLE_ID)?.textContent).toBe(paletteCss(theme.colors))
    const light = paletteTokens(theme.colors).light
    expect(resolvePaletteToken(light, '--maximal-color-bg-default')).toBe('#f8fcf7')
    expect(resolvePaletteToken(light, '--maximal-color-bg-brand')).toBe('#376a58')
    expect(document.documentElement.style.getPropertyValue('--maximal-color-bg-default')).toBe('')
  })

  it('uses the operating-system scheme for system mode', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })))

    applyAppearance(DEFAULT_APPEARANCE)

    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('uses the shipped dark palette when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined)

    expect(appearanceAccent(DEFAULT_APPEARANCE)).toBe('#F65467')
    expect(() => applyAppearance(DEFAULT_APPEARANCE)).not.toThrow()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('derives coordinated terminal surfaces while preserving ANSI semantics', () => {
    const theme = BUILT_IN_THEMES.find(({ id }) => id === 'neon-han-river')!
    const palette = terminalPaletteForTheme(
      theme,
      TERMINAL_PALETTE,
    )

    expect(palette.mode).toBe('dark')
    expect(palette.dark).toMatchObject({
      background: theme.colors.dark.surface,
      foreground: '#FFF3FA',
      cursor: '#FF6FB5',
    })
    expect(palette.dark.red).toBe(TERMINAL_PALETTE.dark.red)
    expect(palette.minimumContrast).toBeGreaterThanOrEqual(4.5)
  })

  it('builds safe gradient previews only from validated shader stops', () => {
    const theme = BUILT_IN_THEMES.find(({ id }) => id === 'arctic-aurora')!

    expect(themeGradient(theme)).toBe(
      'linear-gradient(118deg, #0B2D48 0%, #187C78 48%, #725B9D 100%)',
    )
  })

  it('applies and persists a dedicated spatial canvas background', () => {
    saveAppearance({
      ...DEFAULT_APPEARANCE,
      colors: {
        ...DEFAULT_APPEARANCE.colors,
        spatialCanvasBackground: '#123456',
      },
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

  it('leaves the spatial canvas on the canvas alias unless a theme overrides it', () => {
    saveAppearance(DEFAULT_APPEARANCE)

    const style = document.documentElement.style
    expect(style.getPropertyValue('--shell-spatial-canvas-background')).toBe('')
    const mode = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
    expect(resolvePaletteToken(
      paletteTokens(DEFAULT_APPEARANCE.colors)[mode],
      '--maximal-color-bg-secondary',
    )).toBe(appearanceSpatialCanvasBackground(DEFAULT_APPEARANCE).toLowerCase())
  })

  it('resolves spatial canvas backgrounds from active theme palettes', () => {
    const appleSystem = BUILT_IN_THEMES.find(({ id }) => id === 'apple-system')!
    const vivaMagenta = BUILT_IN_THEMES.find(({ id }) => id === 'viva-magenta-2023')!
    const mochaMousse = BUILT_IN_THEMES.find(({ id }) => id === 'mocha-mousse-2025')!

    expect(appearanceSpatialCanvasBackground({
      ...appleSystem,
      appearance: 'light',
    })).toBe('#F2F2F7')
    expect(appearanceSpatialCanvasBackground({
      ...appleSystem,
      appearance: 'dark',
    })).toBe('#1C1C1E')
    expect(appearanceSpatialCanvasBackground({
      ...vivaMagenta,
      appearance: 'light',
    })).toBe('#F7EAEF')
    expect(appearanceSpatialCanvasBackground({
      ...mochaMousse,
      appearance: 'dark',
    })).toBe('#2A211E')
  })

  it('surfaces corrupt persisted data and falls back safely', () => {
    localStorage.setItem('maximal.appearance.v2', '{')
    const state = readAppearance()
    expect(state.theme).toEqual(DEFAULT_APPEARANCE)
    expect(state.error).toBeTruthy()
  })
})

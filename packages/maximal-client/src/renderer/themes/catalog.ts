import {
  parseThemeCollection,
  type AppearanceThemeFile,
  type ThemeBoardPlacement,
} from '../appearance'

const themeModules = import.meta.glob<unknown>('./*.json', {
  eager: true,
  import: 'default',
})

function hueFromHex(hex: string): number {
  const [red, green, blue] = [1, 3, 5]
    .map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
  const maximum = Math.max(red ?? 0, green ?? 0, blue ?? 0)
  const minimum = Math.min(red ?? 0, green ?? 0, blue ?? 0)
  const delta = maximum - minimum
  if (delta === 0) return 0
  const hue = maximum === red
    ? ((green ?? 0) - (blue ?? 0)) / delta
    : maximum === green
      ? 2 + (((blue ?? 0) - (red ?? 0)) / delta)
      : 4 + (((red ?? 0) - (green ?? 0)) / delta)
  return ((hue * 60) + 360) % 360
}

function lightnessFromHex(hex: string): number {
  const channels = [1, 3, 5]
    .map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
  return (Math.max(...channels) + Math.min(...channels)) / 2 * 100
}

export function themeBoardPlacement(
  theme: AppearanceThemeFile,
): ThemeBoardPlacement {
  if (theme.placement !== undefined) return theme.placement
  const mode = theme.appearance === 'light' ? 'light' : 'dark'
  const palette = theme.colors[mode]
  const hue = Math.round(hueFromHex(palette.accent) / 45) % 8
  const lightness = lightnessFromHex(palette.background)
  const cue = mode === 'dark'
    ? lightness < 10 ? 0 : lightness < 15 ? 1 : lightness < 20 ? 2 : 3
    : lightness < 78 ? 4 : lightness < 82 ? 5 : lightness < 86 ? 6 : 7
  return { hue, cue }
}

function loadThemes(): AppearanceThemeFile[] {
  const ids = new Set<string>()
  const themes = Object.entries(themeModules)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([, value]) => parseThemeCollection(value))
  for (const theme of themes) {
    if (ids.has(theme.id)) throw new Error(`Duplicate built-in theme id: ${theme.id}`)
    ids.add(theme.id)
  }
  return themes.sort((left, right) => {
    const leftPlacement = themeBoardPlacement(left)
    const rightPlacement = themeBoardPlacement(right)
    return leftPlacement.cue - rightPlacement.cue
      || leftPlacement.hue - rightPlacement.hue
      || left.name.localeCompare(right.name)
  })
}

export const BUILT_IN_THEMES = loadThemes()

export function builtInTheme(id: string): AppearanceThemeFile | undefined {
  return BUILT_IN_THEMES.find((theme) => theme.id === id)
}

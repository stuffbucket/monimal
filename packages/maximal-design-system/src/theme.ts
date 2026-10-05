import { applyPalette, type PaletteSeeds } from './color/palette'
import type { ColorMode } from './color/ramps'

export type { PaletteSeed, PaletteSeeds } from './color/palette'

export type ThemeMode = ColorMode | 'system'

export interface DesignSystemTheme {
  appearance: ThemeMode
  colors: PaletteSeeds
}

export interface ThemeManager {
  setTheme(theme: DesignSystemTheme): void
  dispose(): void
}

export interface ThemeMediaQuery {
  readonly matches: boolean
  addEventListener(type: 'change', listener: () => void): void
  removeEventListener(type: 'change', listener: () => void): void
}

export type ThemeMatchMedia = (query: string) => ThemeMediaQuery

interface ThemeEnvironment {
  document?: Document
  matchMedia?: ThemeMatchMedia
}

const COLOR_SCHEME_QUERY = '(prefers-color-scheme: light)'

function globalMatchMedia(): ThemeMatchMedia | undefined {
  return typeof globalThis.matchMedia === 'function'
    ? globalThis.matchMedia
    : undefined
}

export function resolveThemeMode(
  mode: ThemeMode,
  matchMedia = globalMatchMedia(),
): ColorMode {
  if (mode !== 'system') return mode
  return matchMedia?.(COLOR_SCHEME_QUERY).matches === true ? 'light' : 'dark'
}

export function applyTheme(
  theme: DesignSystemTheme,
  target = globalThis.document,
  matchMedia = globalMatchMedia(),
): void {
  if (target === undefined) return
  target.documentElement.dataset.theme = resolveThemeMode(theme.appearance, matchMedia)
  applyPalette(theme.colors, target)
}

export function createThemeManager(environment: ThemeEnvironment = {}): ThemeManager {
  let current: DesignSystemTheme | undefined
  let media: ThemeMediaQuery | undefined
  let mediaFactory: ThemeMatchMedia | undefined

  const target = () => environment.document ?? globalThis.document
  const factory = () => environment.matchMedia ?? globalMatchMedia()
  const applyCurrent = (): void => {
    if (current !== undefined) applyTheme(current, target(), mediaFactory)
  }
  const onSystemChange = (): void => {
    if (current?.appearance === 'system') applyCurrent()
  }
  const connect = (): void => {
    const nextFactory = factory()
    if (nextFactory === mediaFactory) return
    media?.removeEventListener('change', onSystemChange)
    mediaFactory = nextFactory
    media = mediaFactory?.(COLOR_SCHEME_QUERY)
    media?.addEventListener('change', onSystemChange)
  }

  return {
    setTheme(theme) {
      current = theme
      connect()
      applyCurrent()
    },
    dispose() {
      media?.removeEventListener('change', onSystemChange)
      current = undefined
      media = undefined
      mediaFactory = undefined
    },
  }
}

export type AppearanceMode = 'system' | 'light' | 'dark'
export type AppearancePreset =
  | 'maximal'
  | 'apple-system'
  | 'very-peri-2022'
  | 'viva-magenta-2023'
  | 'mocha-mousse-2025'
  | 'cloud-dancer-2026'

export interface AppearanceThemeFile {
  schema: 'https://maximal.dev/schemas/theme/v1'
  name: string
  appearance: AppearanceMode
  preset: AppearancePreset
  colors?: {
    accent?: string
    spatialCanvasBackground?: string
  }
}

export interface AppearanceState {
  theme: AppearanceThemeFile
  error?: string
}

export const DEFAULT_APPEARANCE: AppearanceThemeFile = {
  schema: 'https://maximal.dev/schemas/theme/v1',
  name: 'Maximal',
  appearance: 'system',
  preset: 'maximal',
}

export const APPEARANCE_PRESETS: ReadonlyArray<{
  value: AppearancePreset
  label: string
  source: string
}> = [
  {
    value: 'maximal',
    label: 'Maximal',
    source: 'Maximal’s restrained neutral palette',
  },
  {
    value: 'apple-system',
    label: 'Apple System',
    source: 'Apple semantic system colors with iOS and macOS light/dark values',
  },
  {
    value: 'very-peri-2022',
    label: 'Very Peri',
    source: 'PANTONE 17-3938, Color of the Year 2022',
  },
  {
    value: 'viva-magenta-2023',
    label: 'Viva Magenta',
    source: 'PANTONE 18-1750, Color of the Year 2023',
  },
  {
    value: 'mocha-mousse-2025',
    label: 'Mocha Mousse',
    source: 'PANTONE 17-1230, Color of the Year 2025',
  },
  {
    value: 'cloud-dancer-2026',
    label: 'Cloud Dancer',
    source: 'PANTONE 11-4201, Color of the Year 2026',
  },
]

const STORAGE_KEY = 'maximal.appearance.v1'
const CHANGE_EVENT = 'maximal:appearance-changed'
const HEX_COLOR = /^#[0-9a-f]{6}$/i

function isHexColor(value: unknown): value is string {
  // Stryker disable next-line ConditionalExpression: the regex rejects every non-string JSON value after coercion.
  return typeof value === 'string' && HEX_COLOR.test(value)
}
const MODES = new Set<AppearanceMode>(['system', 'light', 'dark'])
const PRESETS = new Set<AppearancePreset>(APPEARANCE_PRESETS.map(({ value }) => value))
const OVERRIDDEN_TOKENS = [
  '--shell-background',
  '--shell-canvas',
  '--shell-spatial-canvas-background',
  '--shell-raised',
  '--shell-text',
  '--shell-text-muted',
  '--shell-text-subtle',
  '--shell-border',
  '--shell-border-strong',
  '--shell-input-background',
  '--shell-hover',
  '--shell-active',
  '--shell-accent',
  '--shell-accent-contrast',
  '--shell-accent-muted',
] as const

type ThemeTokens = Partial<Record<(typeof OVERRIDDEN_TOKENS)[number], string>>

const APPLE_SYSTEM_TOKENS: Record<Exclude<AppearanceMode, 'system'>, ThemeTokens> = {
  light: {
    '--shell-background': '#FFFFFF',
    '--shell-canvas': '#F2F2F7',
    '--shell-raised': '#FFFFFF',
    '--shell-text': '#000000',
    '--shell-text-muted': 'rgb(60 60 67 / 0.6)',
    '--shell-text-subtle': 'rgb(60 60 67 / 0.45)',
    '--shell-border': 'rgb(60 60 67 / 0.18)',
    '--shell-border-strong': 'rgb(60 60 67 / 0.29)',
    '--shell-input-background': '#FFFFFF',
    '--shell-hover': 'rgb(120 120 128 / 0.12)',
    '--shell-active': 'rgb(120 120 128 / 0.2)',
    '--shell-accent': '#5856D6',
    '--shell-accent-contrast': '#FFFFFF',
    '--shell-accent-muted': 'rgb(88 86 214 / 0.12)',
  },
  dark: {
    '--shell-background': '#000000',
    '--shell-canvas': '#1C1C1E',
    '--shell-raised': '#2C2C2E',
    '--shell-text': '#FFFFFF',
    '--shell-text-muted': 'rgb(235 235 245 / 0.6)',
    '--shell-text-subtle': 'rgb(235 235 245 / 0.45)',
    '--shell-border': 'rgb(84 84 88 / 0.65)',
    '--shell-border-strong': '#636366',
    '--shell-input-background': '#1C1C1E',
    '--shell-hover': 'rgb(118 118 128 / 0.24)',
    '--shell-active': 'rgb(118 118 128 / 0.32)',
    '--shell-accent': '#0A84FF',
    '--shell-accent-contrast': '#000000',
    '--shell-accent-muted': 'rgb(10 132 255 / 0.18)',
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseAppearanceTheme(raw: string): AppearanceThemeFile {
  const parsed: unknown = JSON.parse(raw)
  if (!isRecord(parsed)) throw new Error('Theme file must contain a JSON object.')
  if (parsed.schema !== DEFAULT_APPEARANCE.schema) {
    throw new Error('Theme file uses an unsupported schema.')
  }
  if (typeof parsed.name !== 'string' || parsed.name.trim() === '') {
    throw new Error('Theme file must have a name.')
  }
  if (typeof parsed.appearance !== 'string' || !MODES.has(parsed.appearance as AppearanceMode)) {
    throw new Error('Theme appearance must be system, light, or dark.')
  }
  if (typeof parsed.preset !== 'string' || !PRESETS.has(parsed.preset as AppearancePreset)) {
    throw new Error('Theme preset is not supported.')
  }
  const colors = parsed.colors
  if (colors !== undefined && !isRecord(colors)) {
    throw new Error('Theme colors must be a JSON object.')
  }
  const accent = colors?.accent
  if (accent !== undefined && (typeof accent !== 'string' || !HEX_COLOR.test(accent))) {
    throw new Error('Theme accent must be a six-digit hex color.')
  }
  const spatialCanvasBackground = colors?.spatialCanvasBackground
  if (
    spatialCanvasBackground !== undefined
    && !isHexColor(spatialCanvasBackground)
  ) {
    throw new Error('Spatial canvas background must be a six-digit hex color.')
  }
  const normalizedColors = {
    ...(typeof accent === 'string' ? { accent: accent.toUpperCase() } : {}),
    ...(typeof spatialCanvasBackground === 'string'
      ? { spatialCanvasBackground: spatialCanvasBackground.toUpperCase() }
      : {}),
  }
  return {
    schema: DEFAULT_APPEARANCE.schema,
    name: parsed.name.trim(),
    appearance: parsed.appearance as AppearanceMode,
    preset: parsed.preset as AppearancePreset,
    ...(Object.keys(normalizedColors).length > 0 ? { colors: normalizedColors } : {}),
  }
}

export function readAppearance(): AppearanceState {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === null) return { theme: DEFAULT_APPEARANCE }
  try {
    return { theme: parseAppearanceTheme(raw) }
  } catch (error) {
    return {
      theme: DEFAULT_APPEARANCE,
      error: error instanceof Error ? error.message : 'The saved theme could not be read.',
    }
  }
}

function effectiveMode(mode: AppearanceMode): Exclude<AppearanceMode, 'system'> {
  if (mode !== 'system') return mode
  return typeof matchMedia === 'function'
    && matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark'
}

function contrastForeground(hex: string): '#000000' | '#FFFFFF' {
  const channels = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  })
  const luminance =
    0.2126 * (channels[0] ?? 0)
    + 0.7152 * (channels[1] ?? 0)
    + 0.0722 * (channels[2] ?? 0)
  return (luminance + 0.05) / 0.05 > 1.05 / (luminance + 0.05)
    ? '#000000'
    : '#FFFFFF'
}

function presetTokens(
  preset: AppearancePreset,
  mode: Exclude<AppearanceMode, 'system'>,
): ThemeTokens {
  if (preset === 'apple-system') return APPLE_SYSTEM_TOKENS[mode]
  if (preset === 'mocha-mousse-2025' && mode === 'dark') {
    return {
      '--shell-accent': '#A47764',
      '--shell-accent-contrast': '#16181D',
      '--shell-accent-muted': 'rgb(164 119 100 / 0.18)',
    }
  }
  if (preset === 'cloud-dancer-2026' && mode === 'light') {
    return { '--shell-canvas': '#F0EEE9' }
  }
  if (preset === 'very-peri-2022' && mode === 'light') {
    return {
      '--shell-accent': '#6667AB',
      '--shell-accent-contrast': '#FFFFFF',
      '--shell-accent-muted': 'rgb(102 103 171 / 0.12)',
    }
  }
  if (preset === 'very-peri-2022') {
    return { '--shell-accent-muted': 'rgb(102 103 171 / 0.24)' }
  }
  if (preset === 'viva-magenta-2023' && mode === 'light') {
    return {
      '--shell-accent': '#BB2649',
      '--shell-accent-contrast': '#FFFFFF',
      '--shell-accent-muted': 'rgb(187 38 73 / 0.12)',
    }
  }
  if (preset === 'viva-magenta-2023') {
    return { '--shell-accent-muted': 'rgb(187 38 73 / 0.24)' }
  }
  return {}
}

export function appearanceAccent(theme: AppearanceThemeFile): string {
  if (theme.colors?.accent !== undefined) return theme.colors.accent
  const mode = effectiveMode(theme.appearance)
  const accent = presetTokens(theme.preset, mode)['--shell-accent']
  if (accent !== undefined) return accent
  return mode === 'light' ? '#2563EB' : '#5198A6'
}

export function appearanceSpatialCanvasBackground(
  theme: AppearanceThemeFile,
): string {
  if (theme.colors?.spatialCanvasBackground !== undefined) {
    return theme.colors.spatialCanvasBackground
  }
  const mode = effectiveMode(theme.appearance)
  const canvas = presetTokens(theme.preset, mode)['--shell-canvas']
  if (canvas !== undefined) return canvas
  return mode === 'light' ? '#EEF0F4' : '#1C1F26'
}

export function applyAppearance(theme: AppearanceThemeFile): void {
  const root = document.documentElement
  const mode = effectiveMode(theme.appearance)
  root.dataset.theme = mode
  root.dataset.appearancePreset = theme.preset
  for (const token of OVERRIDDEN_TOKENS) root.style.removeProperty(token)
  for (const [token, value] of Object.entries(presetTokens(theme.preset, mode))) {
    root.style.setProperty(token, value)
  }
  root.style.setProperty(
    '--shell-spatial-canvas-background',
    appearanceSpatialCanvasBackground(theme),
  )
  if (theme.colors?.accent !== undefined) {
    root.style.setProperty('--shell-accent', theme.colors.accent)
    root.style.setProperty(
      '--shell-accent-contrast',
      contrastForeground(theme.colors.accent),
    )
  }
}

export function saveAppearance(theme: AppearanceThemeFile): void {
  const validated = parseAppearanceTheme(JSON.stringify(theme))
  localStorage.setItem(STORAGE_KEY, JSON.stringify(validated))
  applyAppearance(validated)
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: validated }))
}

export function subscribeToAppearance(listener: (theme: AppearanceThemeFile) => void): () => void {
  const onChange = (event: Event): void => {
    if (event instanceof CustomEvent) listener(event.detail as AppearanceThemeFile)
  }
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => window.removeEventListener(CHANGE_EVENT, onChange)
}

export function initializeAppearance(): AppearanceState {
  const state = readAppearance()
  applyAppearance(state.theme)
  if (typeof matchMedia !== 'function') return state
  const media = matchMedia('(prefers-color-scheme: light)')
  const onSystemChange = (): void => {
    const current = readAppearance().theme
    if (current.appearance === 'system') applyAppearance(current)
  }
  media.addEventListener('change', onSystemChange)
  return state
}

export function serializeAppearance(theme: AppearanceThemeFile): string {
  return `${JSON.stringify(parseAppearanceTheme(JSON.stringify(theme)), undefined, 2)}\n`
}

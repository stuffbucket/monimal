import type { TerminalPaletteSettings } from '@maximal/maximal-terminal/renderer'

import {
  MATERIAL_PRESET_VALUES,
  type MaterialPreset,
  type PersistedMaterialPreference,
} from '../shared/host'

export type AppearanceMode = 'system' | 'light' | 'dark'
export type ThemeCategory =
  | 'expressive'
  | 'heritage-inspired'
  | 'modern'
  | 'nature'
  | 'studio'

export interface ThemePaletteSeed {
  background: string
  surface: string
  text: string
  accent: string
}

export interface ThemeShader {
  material: MaterialPreset
  strength: number
  motion: number
  gradient: {
    type: 'linear' | 'radial'
    angle?: number
    stops: Array<{
      color: string
      position: number
    }>
  }
}

export interface ThemeBoardPlacement {
  hue: number
  cue: number
}

export interface AppearanceThemeFile {
  schema: 'https://maximal.dev/schemas/theme/v2'
  id: string
  name: string
  description: string
  source: string
  category: ThemeCategory
  tags: string[]
  appearance: AppearanceMode
  placement?: ThemeBoardPlacement
  colors: {
    light: ThemePaletteSeed
    dark: ThemePaletteSeed
    spatialCanvasBackground?: string
  }
  shader?: ThemeShader
  extensions?: Record<string, unknown>
}

export interface AppearanceState {
  theme: AppearanceThemeFile
  error?: string
}

export interface ThemeableSettingsSnapshot {
  theme: AppearanceThemeFile
  terminalPalette?: TerminalPaletteSettings
  appearance?: {
    backgroundEffectsEnabled: boolean
    reducedMotionEnabled: boolean
    vibrancyEnabled: boolean
  }
  material?: PersistedMaterialPreference
  selectedAt: string
}

const MAXIMAL_LIGHT: ThemePaletteSeed = {
  background: '#FFFFFF',
  surface: '#EEF0F4',
  text: '#12141A',
  accent: '#2159D1',
}

const MAXIMAL_DARK: ThemePaletteSeed = {
  background: '#16181D',
  surface: '#1C1F26',
  text: '#F5F5F5',
  accent: '#62A9B7',
}

export const DEFAULT_APPEARANCE: AppearanceThemeFile = {
  schema: 'https://maximal.dev/schemas/theme/v2',
  id: 'maximal',
  name: 'Maximal',
  description: 'A restrained blue-green studio palette.',
  source: 'Maximal product palette',
  category: 'studio',
  tags: ['balanced', 'neutral'],
  appearance: 'system',
  colors: {
    light: MAXIMAL_LIGHT,
    dark: MAXIMAL_DARK,
  },
}

const LEGACY_PRESETS: Record<string, Pick<AppearanceThemeFile, 'id' | 'name' | 'colors'>> = {
  maximal: {
    id: 'maximal',
    name: 'Maximal',
    colors: { light: MAXIMAL_LIGHT, dark: MAXIMAL_DARK },
  },
  'apple-system': {
    id: 'apple-system',
    name: 'Apple System',
    colors: {
      light: {
        background: '#FFFFFF',
        surface: '#F2F2F7',
        text: '#111111',
        accent: '#4D4BC2',
      },
      dark: {
        background: '#000000',
        surface: '#1C1C1E',
        text: '#FFFFFF',
        accent: '#3F9BFF',
      },
    },
  },
  'very-peri-2022': {
    id: 'very-peri-2022',
    name: 'Very Peri',
    colors: {
      light: {
        background: '#FBFAFF',
        surface: '#F0EFFA',
        text: '#17162A',
        accent: '#55569A',
      },
      dark: {
        background: '#171725',
        surface: '#222238',
        text: '#F6F4FF',
        accent: '#AEB0FF',
      },
    },
  },
  'viva-magenta-2023': {
    id: 'viva-magenta-2023',
    name: 'Viva Magenta',
    colors: {
      light: {
        background: '#FFF8FA',
        surface: '#F7EAEF',
        text: '#26151B',
        accent: '#9D1F3D',
      },
      dark: {
        background: '#211217',
        surface: '#311923',
        text: '#FFF5F8',
        accent: '#F06B8A',
      },
    },
  },
  'mocha-mousse-2025': {
    id: 'mocha-mousse-2025',
    name: 'Mocha Mousse',
    colors: {
      light: {
        background: '#FCF8F5',
        surface: '#EFE6E0',
        text: '#251B17',
        accent: '#795040',
      },
      dark: {
        background: '#1D1715',
        surface: '#2A211E',
        text: '#FAF4F0',
        accent: '#C8967F',
      },
    },
  },
  'cloud-dancer-2026': {
    id: 'cloud-dancer-2026',
    name: 'Cloud Dancer',
    colors: {
      light: {
        background: '#FAF9F6',
        surface: '#F0EEE9',
        text: '#202225',
        accent: '#435D72',
      },
      dark: {
        background: '#191A1C',
        surface: '#242629',
        text: '#F0EEE9',
        accent: '#91B3CC',
      },
    },
  },
}

const STORAGE_KEY = 'maximal.appearance.v2'
const LEGACY_STORAGE_KEY = 'maximal.appearance.v1'
const CHANGE_EVENT = 'maximal:appearance-changed'
const HEX_COLOR = /^#[0-9a-f]{6}$/i

function isHexColor(value: unknown): value is string {
  // Stryker disable next-line ConditionalExpression: the regex rejects every non-string JSON value after coercion.
  return typeof value === 'string' && HEX_COLOR.test(value)
}
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MODES = new Set<AppearanceMode>(['system', 'light', 'dark'])
const CATEGORIES = new Set<ThemeCategory>([
  'expressive',
  'heritage-inspired',
  'modern',
  'nature',
  'studio',
])
const MATERIAL_PRESETS = new Set<string>(MATERIAL_PRESET_VALUES)
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

type ThemeTokens = Record<(typeof OVERRIDDEN_TOKENS)[number], string>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(
  value: unknown,
  message: string,
  pattern?: RegExp,
): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(message)
  const result = value.trim()
  if (pattern !== undefined && !pattern.test(result)) throw new Error(message)
  return result
}

function requireHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !HEX_COLOR.test(value)) {
    throw new Error(`${label} must be a six-digit hex color.`)
  }
  return value.toUpperCase()
}

function parsePalette(value: unknown, label: string): ThemePaletteSeed {
  if (!isRecord(value)) throw new Error(`${label} colors must be a JSON object.`)
  const palette = {
    background: requireHex(value.background, `${label} background`),
    surface: requireHex(value.surface, `${label} surface`),
    text: requireHex(value.text, `${label} text`),
    accent: requireHex(value.accent, `${label} accent`),
  }
  if (contrastRatio(palette.text, palette.background) < 7
    || contrastRatio(palette.text, palette.surface) < 7) {
    throw new Error(`${label} text must meet WCAG AAA contrast against its surfaces.`)
  }
  if (contrastRatio(palette.accent, palette.background) < 4.5) {
    throw new Error(`${label} accent must meet WCAG AA contrast against the background.`)
  }
  return palette
}

function parseShader(value: unknown): ThemeShader | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) throw new Error('Theme shader must be a JSON object.')
  const gradient = value.gradient
  if (!isRecord(gradient)) throw new Error('Theme shader gradient must be a JSON object.')
  if (gradient.type !== 'linear' && gradient.type !== 'radial') {
    throw new Error('Theme shader gradient type must be linear or radial.')
  }
  if (!Array.isArray(gradient.stops) || gradient.stops.length < 2 || gradient.stops.length > 6) {
    throw new Error('Theme shader gradient must contain between two and six stops.')
  }
  const material = requireString(value.material, 'Theme shader material is required.')
  if (!MATERIAL_PRESETS.has(material)) throw new Error('Theme shader material is not supported.')
  const strength = value.strength
  const motion = value.motion
  if (typeof strength !== 'number' || strength < 0 || strength > 1) {
    throw new Error('Theme shader strength must be between zero and one.')
  }
  if (typeof motion !== 'number' || motion < 0 || motion > 1) {
    throw new Error('Theme shader motion must be between zero and one.')
  }
  const angle = gradient.angle
  if (angle !== undefined && (typeof angle !== 'number' || angle < 0 || angle > 360)) {
    throw new Error('Theme shader gradient angle must be between zero and 360.')
  }
  return {
    material: material as MaterialPreset,
    strength,
    motion,
    gradient: {
      type: gradient.type,
      ...(typeof angle === 'number' ? { angle } : {}),
      stops: gradient.stops.map((stop, index) => {
        if (!isRecord(stop)) throw new Error('Theme shader stops must be JSON objects.')
        const position = stop.position
        if (typeof position !== 'number' || position < 0 || position > 100) {
          throw new Error('Theme shader stop positions must be between zero and 100.')
        }
        return {
          color: requireHex(stop.color, `Shader stop ${String(index + 1)}`),
          position,
        }
      }),
    },
  }
}

function parseV2(parsed: Record<string, unknown>): AppearanceThemeFile {
  const colors = parsed.colors
  if (!isRecord(colors)) throw new Error('Theme colors must be a JSON object.')
  const appearance = requireString(
    parsed.appearance,
    'Theme appearance must be system, light, or dark.',
  )
  if (!MODES.has(appearance as AppearanceMode)) {
    throw new Error('Theme appearance must be system, light, or dark.')
  }
  const category = requireString(parsed.category, 'Theme category is required.')
  if (!CATEGORIES.has(category as ThemeCategory)) {
    throw new Error('Theme category is not supported.')
  }
  if (!Array.isArray(parsed.tags) || parsed.tags.some((tag) => typeof tag !== 'string')) {
    throw new Error('Theme tags must be an array of strings.')
  }
  const tags = parsed.tags.filter((tag): tag is string => typeof tag === 'string')
  if (parsed.extensions !== undefined && !isRecord(parsed.extensions)) {
    throw new Error('Theme extensions must be a JSON object.')
  }
  const placement = parsed.placement
  if (placement !== undefined
    && (!isRecord(placement)
      || typeof placement.hue !== 'number'
      || !Number.isInteger(placement.hue)
      || placement.hue < 0
      || placement.hue > 7
      || typeof placement.cue !== 'number'
      || !Number.isInteger(placement.cue)
      || placement.cue < 0
      || placement.cue > 7)) {
    throw new Error('Theme placement must use hue and cue zones from zero through seven.')
  }
  const spatialCanvasBackground = colors.spatialCanvasBackground
  if (spatialCanvasBackground !== undefined && !isHexColor(spatialCanvasBackground)) {
    throw new Error('Spatial canvas background must be a six-digit hex color.')
  }
  return {
    schema: 'https://maximal.dev/schemas/theme/v2',
    id: requireString(parsed.id, 'Theme id must use lowercase words separated by hyphens.', ID),
    name: requireString(parsed.name, 'Theme file must have a name.'),
    description: requireString(parsed.description, 'Theme description is required.'),
    source: requireString(parsed.source, 'Theme source is required.'),
    category: category as ThemeCategory,
    tags: tags.map((tag) => tag.trim()).filter(Boolean),
    appearance: appearance as AppearanceMode,
    ...(isRecord(placement)
      ? { placement: { hue: placement.hue as number, cue: placement.cue as number } }
      : {}),
    colors: {
      light: parsePalette(colors.light, 'Light'),
      dark: parsePalette(colors.dark, 'Dark'),
      ...(typeof spatialCanvasBackground === 'string'
        ? { spatialCanvasBackground: spatialCanvasBackground.toUpperCase() }
        : {}),
    },
    ...(parsed.shader !== undefined ? { shader: parseShader(parsed.shader) } : {}),
    ...(parsed.extensions !== undefined ? { extensions: parsed.extensions } : {}),
  }
}

function migrateV1(parsed: Record<string, unknown>): AppearanceThemeFile {
  const preset = typeof parsed.preset === 'string' ? parsed.preset : 'maximal'
  const legacy = LEGACY_PRESETS[preset]
  if (legacy === undefined) throw new Error('Theme preset is not supported.')
  const appearance = parsed.appearance
  if (typeof appearance !== 'string' || !MODES.has(appearance as AppearanceMode)) {
    throw new Error('Theme appearance must be system, light, or dark.')
  }
  const customColors = parsed.colors
  if (customColors !== undefined && !isRecord(customColors)) {
    throw new Error('Theme colors must be a JSON object.')
  }
  const accent = customColors?.accent
  const paletteColors = accent === undefined
    ? legacy.colors
    : {
        light: { ...legacy.colors.light, accent: requireHex(accent, 'Theme accent') },
        dark: { ...legacy.colors.dark, accent: requireHex(accent, 'Theme accent') },
      }
  const spatialCanvasBackground = customColors?.spatialCanvasBackground
  if (spatialCanvasBackground !== undefined && !isHexColor(spatialCanvasBackground)) {
    throw new Error('Spatial canvas background must be a six-digit hex color.')
  }
  return {
    ...DEFAULT_APPEARANCE,
    ...legacy,
    name: typeof parsed.name === 'string' && parsed.name.trim() !== ''
      ? parsed.name.trim()
      : legacy.name,
    appearance: appearance as AppearanceMode,
    colors: {
      ...paletteColors,
      ...(typeof spatialCanvasBackground === 'string'
        ? { spatialCanvasBackground: spatialCanvasBackground.toUpperCase() }
        : {}),
    },
  }
}

export function parseAppearanceTheme(raw: string): AppearanceThemeFile {
  const parsed: unknown = JSON.parse(raw)
  if (!isRecord(parsed)) throw new Error('Theme file must contain a JSON object.')
  if (parsed.schema === 'https://maximal.dev/schemas/theme/v1') return migrateV1(parsed)
  if (parsed.schema !== DEFAULT_APPEARANCE.schema) {
    throw new Error('Theme file uses an unsupported schema.')
  }
  return parseV2(parsed)
}

export function parseThemeCollection(raw: unknown): AppearanceThemeFile[] {
  const entries = Array.isArray(raw) ? raw : [raw]
  return entries.map((entry) => parseAppearanceTheme(JSON.stringify(entry)))
}

export function readAppearance(): AppearanceState {
  const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
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

export function effectiveAppearanceMode(
  mode: AppearanceMode,
): Exclude<AppearanceMode, 'system'> {
  if (mode !== 'system') return mode
  return typeof matchMedia === 'function'
    && matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark'
}

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)) as [
    number,
    number,
    number,
  ]
}

function mix(left: string, right: string, amount: number): string {
  const from = rgb(left)
  const to = rgb(right)
  return `#${from.map((channel, index) =>
    Math.round(channel + (((to[index] ?? channel) - channel) * amount))
      .toString(16)
      .padStart(2, '0')).join('')}`.toUpperCase()
}

function luminance(hex: string): number {
  const channels = rgb(hex).map((value) => {
    const channel = value / 255
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  })
  return (0.2126 * (channels[0] ?? 0))
    + (0.7152 * (channels[1] ?? 0))
    + (0.0722 * (channels[2] ?? 0))
}

export function contrastRatio(left: string, right: string): number {
  const lighter = Math.max(luminance(left), luminance(right))
  const darker = Math.min(luminance(left), luminance(right))
  return (lighter + 0.05) / (darker + 0.05)
}

function contrastForeground(hex: string): '#000000' | '#FFFFFF' {
  return contrastRatio('#000000', hex) >= contrastRatio('#FFFFFF', hex)
    ? '#000000'
    : '#FFFFFF'
}

function themeTokens(seed: ThemePaletteSeed): ThemeTokens {
  return {
    '--shell-background': seed.background,
    '--shell-canvas': seed.surface,
    '--shell-spatial-canvas-background': seed.surface,
    '--shell-raised': mix(seed.surface, seed.text, 0.08),
    '--shell-text': seed.text,
    '--shell-text-muted': mix(seed.background, seed.text, 0.72),
    '--shell-text-subtle': mix(seed.background, seed.text, 0.62),
    '--shell-border': mix(seed.background, seed.text, 0.2),
    '--shell-border-strong': mix(seed.background, seed.text, 0.42),
    '--shell-input-background': mix(seed.background, seed.text, 0.035),
    '--shell-hover': mix(seed.background, seed.text, 0.075),
    '--shell-active': mix(seed.background, seed.text, 0.12),
    '--shell-accent': seed.accent,
    '--shell-accent-contrast': contrastForeground(seed.accent),
    '--shell-accent-muted': mix(seed.background, seed.accent, 0.18),
  }
}

export function appearanceAccent(theme: AppearanceThemeFile): string {
  return theme.colors[effectiveAppearanceMode(theme.appearance)].accent
}

export function themeGradient(theme: AppearanceThemeFile): string | undefined {
  const gradient = theme.shader?.gradient
  if (gradient === undefined) return undefined
  const stops = gradient.stops
    .map(({ color, position }) => `${color} ${String(position)}%`)
    .join(', ')
  return gradient.type === 'radial'
    ? `radial-gradient(circle at 35% 30%, ${stops})`
    : `linear-gradient(${String(gradient.angle ?? 135)}deg, ${stops})`
}

export function appearanceSpatialCanvasBackground(
  theme: AppearanceThemeFile,
): string {
  if (theme.colors.spatialCanvasBackground !== undefined) {
    return theme.colors.spatialCanvasBackground
  }
  return theme.colors[effectiveAppearanceMode(theme.appearance)].surface
}

export function applyAppearance(theme: AppearanceThemeFile): void {
  const root = document.documentElement
  const mode = effectiveAppearanceMode(theme.appearance)
  root.dataset.theme = mode
  root.dataset.appearancePreset = theme.id
  for (const token of OVERRIDDEN_TOKENS) root.style.removeProperty(token)
  for (const [token, value] of Object.entries(themeTokens(theme.colors[mode]))) {
    root.style.setProperty(token, value)
  }
  root.style.setProperty(
    '--shell-spatial-canvas-background',
    appearanceSpatialCanvasBackground(theme),
  )
}

export function terminalPaletteForTheme(
  theme: AppearanceThemeFile,
  current: TerminalPaletteSettings,
): TerminalPaletteSettings {
  const light = theme.colors.light
  const dark = theme.colors.dark
  return {
    ...current,
    mode: theme.appearance === 'system' ? 'auto' : theme.appearance,
    light: {
      ...current.light,
      background: light.background,
      foreground: light.text,
      cursor: light.accent,
      selectionBackground: mix(light.background, light.accent, 0.28),
    },
    dark: {
      ...current.dark,
      background: dark.background,
      foreground: dark.text,
      cursor: dark.accent,
      selectionBackground: mix(dark.background, dark.accent, 0.34),
    },
    minimumContrast: Math.max(4.5, current.minimumContrast),
  }
}

export function saveAppearance(theme: AppearanceThemeFile): void {
  const validated = parseAppearanceTheme(JSON.stringify(theme))
  localStorage.setItem(STORAGE_KEY, JSON.stringify(validated))
  localStorage.removeItem(LEGACY_STORAGE_KEY)
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

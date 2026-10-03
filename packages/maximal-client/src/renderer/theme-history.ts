import {
  MATERIAL_PRESET_VALUES,
  type AppearancePreference,
  type PersistedMaterialPreference,
} from '../shared/host'
import {
  TERMINAL_PALETTE_COLOURS,
  type TerminalBlendMode,
  type TerminalColorMode,
  type TerminalPalette,
  type TerminalPaletteSettings,
} from '@maximal/maximal-terminal/renderer'
import {
  parseAppearanceTheme,
  type ThemeableSettingsSnapshot,
} from './appearance'

const HISTORY_KEY = 'maximal.theme-history.v1'
const HISTORY_LIMIT = 5
const MATERIAL_PRESETS = new Set<string>(MATERIAL_PRESET_VALUES)
const HEX_COLOR = /^#[0-9a-f]{6}$/i

interface ThemeHistoryState {
  entries: ThemeableSettingsSnapshot[]
  error?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseAppearancePreference(
  value: unknown,
): ThemeableSettingsSnapshot['appearance'] {
  if (value === undefined) return undefined
  if (!isRecord(value)
    || typeof value.backgroundEffectsEnabled !== 'boolean'
    || typeof value.reducedMotionEnabled !== 'boolean'
    || typeof value.vibrancyEnabled !== 'boolean') {
    throw new Error('Theme history contains invalid appearance settings.')
  }
  return {
    backgroundEffectsEnabled: value.backgroundEffectsEnabled,
    reducedMotionEnabled: value.reducedMotionEnabled,
    vibrancyEnabled: value.vibrancyEnabled,
  }
}

function parseMaterial(
  value: unknown,
): PersistedMaterialPreference | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)
    || typeof value.preset !== 'string'
    || !MATERIAL_PRESETS.has(value.preset)
    || (value.quality !== 'battery'
      && value.quality !== 'balanced'
      && value.quality !== 'high')
    || typeof value.strength !== 'number'
    || value.strength < 0
    || value.strength > 1
    || typeof value.motion !== 'number'
    || value.motion < 0
    || value.motion > 1
    || (value.lighting !== 'fixed' && value.lighting !== 'timezone')
    || typeof value.timezone !== 'string'
    || (value.solarFacingOffset !== undefined
      && (typeof value.solarFacingOffset !== 'number'
        || value.solarFacingOffset < -180
        || value.solarFacingOffset > 180))
    || (value.solarFollowStrength !== undefined
      && (typeof value.solarFollowStrength !== 'number'
        || value.solarFollowStrength < 0
        || value.solarFollowStrength > 1))
    || (value.solarEffect !== undefined
      && value.solarEffect !== 'atmospheric'
      && value.solarEffect !== 'rays')) {
    throw new Error('Theme history contains invalid shader settings.')
  }
  const preset = MATERIAL_PRESET_VALUES.find((candidate) => candidate === value.preset)
  if (preset === undefined) throw new Error('Theme history contains an invalid shader preset.')
  return {
    preset,
    quality: value.quality,
    strength: value.strength,
    motion: value.motion,
    lighting: value.lighting,
    timezone: value.timezone,
    solarFacingOffset: value.solarFacingOffset ?? 0,
    solarFollowStrength: value.solarFollowStrength ?? 0.5,
    solarEffect: value.solarEffect ?? 'atmospheric',
  }
}

function parseTerminalMode(value: unknown): TerminalColorMode {
  if (value === 'auto' || value === 'light' || value === 'dark') return value
  throw new Error('Theme history contains an invalid terminal color mode.')
}

function parseBlendMode(value: unknown): TerminalBlendMode {
  if (value === 'normal'
    || value === 'multiply'
    || value === 'screen'
    || value === 'overlay'
    || value === 'darken'
    || value === 'lighten') return value
  throw new Error('Theme history contains an invalid terminal blend mode.')
}

function parseTerminalColours(value: unknown): TerminalPalette {
  if (!isRecord(value)) {
    throw new Error('Theme history contains an invalid terminal palette.')
  }
  const entries = TERMINAL_PALETTE_COLOURS.map((key) => {
    const color = value[key]
    if (typeof color !== 'string' || !HEX_COLOR.test(color)) {
      throw new Error(`Theme history contains an invalid terminal ${key} color.`)
    }
    return [key, color.toUpperCase()] as const
  })
  return Object.fromEntries(entries) as TerminalPalette
}

function parseTerminalPalette(value: unknown): TerminalPaletteSettings | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)
    || typeof value.minimumContrast !== 'number'
    || value.minimumContrast < 1
    || value.minimumContrast > 21
    || !isRecord(value.effects)
    || typeof value.effects.opacity !== 'number'
    || value.effects.opacity < 0
    || value.effects.opacity > 1
    || typeof value.effects.blur !== 'number'
    || value.effects.blur < 0
    || typeof value.effects.tint !== 'string'
    || !HEX_COLOR.test(value.effects.tint)
    || typeof value.effects.tintAmount !== 'number'
    || value.effects.tintAmount < 0
    || value.effects.tintAmount > 1
    || typeof value.effects.tone !== 'number'
    || value.effects.tone < -1
    || value.effects.tone > 1
    || typeof value.effects.stamp !== 'boolean'
    || typeof value.effects.compensate !== 'boolean') {
    throw new Error('Theme history contains invalid terminal colors.')
  }
  return {
    mode: parseTerminalMode(value.mode),
    light: parseTerminalColours(value.light),
    dark: parseTerminalColours(value.dark),
    minimumContrast: value.minimumContrast,
    effects: {
      opacity: value.effects.opacity,
      blur: value.effects.blur,
      tint: value.effects.tint.toUpperCase(),
      tintAmount: value.effects.tintAmount,
      tone: value.effects.tone,
      blendMode: parseBlendMode(value.effects.blendMode),
      stamp: value.effects.stamp,
      compensate: value.effects.compensate,
    },
  }
}

function parseSnapshot(value: unknown): ThemeableSettingsSnapshot {
  if (!isRecord(value) || typeof value.selectedAt !== 'string') {
    throw new Error('Theme history contains an invalid entry.')
  }
  const terminalPalette = parseTerminalPalette(value.terminalPalette)
  return {
    theme: parseAppearanceTheme(JSON.stringify(value.theme)),
    selectedAt: value.selectedAt,
    ...(terminalPalette !== undefined ? { terminalPalette } : {}),
    ...(value.appearance !== undefined
      ? { appearance: parseAppearancePreference(value.appearance) }
      : {}),
    ...(value.material !== undefined
      ? { material: parseMaterial(value.material) }
      : {}),
  }
}

export function readThemeHistory(): ThemeHistoryState {
  const raw = localStorage.getItem(HISTORY_KEY)
  if (raw === null) return { entries: [] }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error('Theme history must be an array.')
    return { entries: parsed.slice(0, HISTORY_LIMIT).map(parseSnapshot) }
  } catch (error) {
    return {
      entries: [],
      error: error instanceof Error
        ? error.message
        : 'Theme history could not be read.',
    }
  }
}

export function pushThemeHistory(snapshot: ThemeableSettingsSnapshot): ThemeHistoryState {
  const current = readThemeHistory()
  if (current.error !== undefined) throw new Error(current.error)
  const entries = [snapshot, ...current.entries].slice(0, HISTORY_LIMIT)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries))
  return { entries }
}

export function clearThemeHistory(): void {
  localStorage.removeItem(HISTORY_KEY)
}

export function snapshotAppearance(
  preference: AppearancePreference,
): NonNullable<ThemeableSettingsSnapshot['appearance']> {
  return {
    backgroundEffectsEnabled: preference.backgroundEffectsEnabled,
    reducedMotionEnabled: preference.reducedMotionEnabled,
    vibrancyEnabled: preference.vibrancyEnabled,
  }
}

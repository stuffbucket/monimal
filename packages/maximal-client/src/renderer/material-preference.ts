export const MATERIAL_PRESETS = [
  { value: 'clouds', label: 'Cozy clouds', cost: 'Low' },
  { value: 'acrylic', label: 'Acrylic', cost: 'Low' },
  { value: 'paper', label: 'Paper', cost: 'Low' },
  { value: 'cloth', label: 'Cloth', cost: 'Low' },
  { value: 'marble', label: 'Marble', cost: 'Low' },
  { value: 'water', label: 'Water', cost: 'Medium' },
  { value: 'cel-sky', label: 'Cel-painted sky', cost: 'Low' },
  { value: 'halftone', label: 'Manga halftone', cost: 'Low' },
  { value: 'ink-wash', label: 'Ink wash', cost: 'Low' },
  { value: 'stardust', label: 'Animated stardust', cost: 'Medium' },
] as const

export type MaterialPreset = (typeof MATERIAL_PRESETS)[number]['value']
export type MaterialQuality = 'battery' | 'balanced' | 'high'
export type MaterialLighting = 'fixed' | 'timezone'

export interface MaterialPreference {
  preset: MaterialPreset
  quality: MaterialQuality
  strength: number
  motion: number
  lighting: MaterialLighting
  timezone: string
  latitude: number
  longitude: number
}

const STORAGE_KEY = 'maximal.material-preference.v1'
const CHANGE_EVENT = 'maximal-material-preference-change'
let sessionCoordinates = { latitude: 0, longitude: 0 }

export const DEFAULT_MATERIAL_PREFERENCE: MaterialPreference = {
  preset: 'clouds',
  quality: 'balanced',
  strength: 0.75,
  motion: 0.5,
  lighting: 'fixed',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  latitude: 0,
  longitude: 0,
}

function numberInRange(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback
}

export function parseMaterialPreference(value: unknown): MaterialPreference {
  if (typeof value !== 'object' || value === null) {
    return DEFAULT_MATERIAL_PREFERENCE
  }
  const input = value as Record<string, unknown>
  const preset = MATERIAL_PRESETS.some(({ value }) => value === input.preset)
    ? input.preset as MaterialPreset
    : DEFAULT_MATERIAL_PREFERENCE.preset
  const quality = ['battery', 'balanced', 'high'].includes(String(input.quality))
    ? input.quality as MaterialQuality
    : DEFAULT_MATERIAL_PREFERENCE.quality
  const lighting = ['fixed', 'timezone'].includes(String(input.lighting))
    ? input.lighting as MaterialLighting
    : DEFAULT_MATERIAL_PREFERENCE.lighting
  const timezone = typeof input.timezone === 'string'
    && Intl.supportedValuesOf('timeZone').includes(input.timezone)
    ? input.timezone
    : DEFAULT_MATERIAL_PREFERENCE.timezone

  return {
    preset,
    quality,
    strength: numberInRange(input.strength, 0.25, 1, DEFAULT_MATERIAL_PREFERENCE.strength),
    motion: numberInRange(input.motion, 0, 1, DEFAULT_MATERIAL_PREFERENCE.motion),
    lighting,
    timezone,
    latitude: numberInRange(input.latitude, -90, 90, DEFAULT_MATERIAL_PREFERENCE.latitude),
    longitude: numberInRange(input.longitude, -180, 180, DEFAULT_MATERIAL_PREFERENCE.longitude),
  }
}

export function readMaterialPreference(): MaterialPreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    const preference = saved === null
      ? DEFAULT_MATERIAL_PREFERENCE
      : parseMaterialPreference(JSON.parse(saved))
    return { ...preference, ...sessionCoordinates }
  } catch {
    return { ...DEFAULT_MATERIAL_PREFERENCE, ...sessionCoordinates }
  }
}

export function saveMaterialPreference(preference: MaterialPreference): void {
  const parsed = parseMaterialPreference(preference)
  sessionCoordinates = {
    latitude: parsed.latitude,
    longitude: parsed.longitude,
  }
  const {
    latitude: _latitude,
    longitude: _longitude,
    ...persisted
  } = parsed
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: parsed }))
}

export function subscribeMaterialPreference(
  listener: (preference: MaterialPreference) => void,
): () => void {
  const onChange = (event: Event): void => {
    listener((event as CustomEvent<MaterialPreference>).detail)
  }
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => window.removeEventListener(CHANGE_EVENT, onChange)
}

export function materialPresetIndex(preset: MaterialPreset): number {
  return MATERIAL_PRESETS.findIndex(({ value }) => value === preset)
}

export function solarLightDirection(
  preference: Pick<
    MaterialPreference,
    'lighting' | 'timezone' | 'latitude' | 'longitude'
  >,
  now = new Date(),
): Float32Array {
  if (preference.lighting === 'fixed') {
    return new Float32Array([-0.42, -0.91])
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: preference.timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((entry) => entry.type === type)?.value ?? 0)
  const local = new Date(Date.UTC(part('year'), part('month') - 1, part('day')))
  const start = new Date(Date.UTC(local.getUTCFullYear(), 0, 0))
  const day = Math.floor((local.getTime() - start.getTime()) / 86_400_000)
  const declination = 23.45 * Math.sin((Math.PI * 2 * (284 + day)) / 365)
  const localTimestamp = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
  )
  const offsetHours = (localTimestamp - now.getTime()) / 3_600_000
  const solarHour = part('hour') + part('minute') / 60
    + (preference.longitude - offsetHours * 15) / 15
  const hourAngle = (solarHour - 12) * 15
  const radians = Math.PI / 180
  const latitude = preference.latitude * radians
  const declinationRadians = declination * radians
  const hourRadians = hourAngle * radians
  const elevation = Math.asin(
    Math.sin(latitude) * Math.sin(declinationRadians)
      + Math.cos(latitude) * Math.cos(declinationRadians) * Math.cos(hourRadians),
  )
  const azimuth = Math.atan2(
    Math.sin(hourRadians),
    Math.cos(hourRadians) * Math.sin(latitude)
      - Math.tan(declinationRadians) * Math.cos(latitude),
  )
  const daylight = Math.max(0.2, Math.sin(elevation))
  return new Float32Array([
    Math.sin(azimuth) * daylight,
    -Math.cos(azimuth) * daylight,
  ])
}

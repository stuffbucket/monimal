import {
  MATERIAL_PRESET_VALUES,
  type MaterialPreset,
  type PersistedMaterialPreference,
} from '../shared/host'

export type {
  MaterialLighting,
  MaterialPreset,
  MaterialQuality,
  MaterialSolarEffect,
  PersistedMaterialPreference,
} from '../shared/host'

const MATERIAL_DETAILS: Record<
  MaterialPreset,
  { readonly label: string; readonly cost: 'Low' | 'Medium' }
> = {
  clouds: { label: 'Cozy clouds', cost: 'Low' },
  acrylic: { label: 'Acrylic', cost: 'Low' },
  paper: { label: 'Paper', cost: 'Low' },
  cloth: { label: 'Cloth', cost: 'Low' },
  marble: { label: 'Marble', cost: 'Low' },
  water: { label: 'Water', cost: 'Medium' },
  'cel-sky': { label: 'Cel-painted sky', cost: 'Low' },
  halftone: { label: 'Manga halftone', cost: 'Low' },
  'ink-wash': { label: 'Ink wash', cost: 'Low' },
  stardust: { label: 'Animated stardust', cost: 'Medium' },
  'candy-paint': { label: 'Maximal candy paint', cost: 'Medium' },
}

export const MATERIAL_PRESETS = MATERIAL_PRESET_VALUES.map((value) => ({
  value,
  ...MATERIAL_DETAILS[value],
}))

export interface MaterialPreference extends PersistedMaterialPreference {
  latitude: number
  longitude: number
}

export const DEFAULT_MATERIAL_PREFERENCE: MaterialPreference = {
  preset: 'clouds',
  quality: 'balanced',
  strength: 0.75,
  motion: 0.5,
  lighting: 'fixed',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  solarFacingOffset: 0,
  solarFollowStrength: 0.5,
  solarEffect: 'atmospheric',
  latitude: 0,
  longitude: 0,
}

export function materialPresetIndex(preset: MaterialPreset): number {
  return MATERIAL_PRESETS.findIndex(({ value }) => value === preset)
}

export function solarLightDirection(
  preference: Pick<
    MaterialPreference,
    | 'lighting'
    | 'timezone'
    | 'latitude'
    | 'longitude'
    | 'solarFacingOffset'
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
  const direction = [
    Math.sin(azimuth) * daylight,
    -Math.cos(azimuth) * daylight,
  ] as const
  const offset = preference.solarFacingOffset * radians
  const cosine = Math.cos(offset)
  const sine = Math.sin(offset)
  return new Float32Array([
    direction[0] * cosine - direction[1] * sine,
    direction[0] * sine + direction[1] * cosine,
  ])
}

import { BRAND_CREAM_HEX, BRAND_HEX } from './ramps'
import type { PaletteSeeds } from './palette'

export interface PaletteFixture {
  id: string
  name: string
  colors: PaletteSeeds
}

export const DEFAULT_PALETTE_FIXTURE: PaletteFixture = {
  id: 'maximal-reference',
  name: 'Maximal reference',
  colors: {
    light: {
      background: '#ffffff',
      surface: '#eef0f4',
      text: '#12141a',
      accent: BRAND_HEX,
      accentIcon: BRAND_CREAM_HEX,
    },
    dark: {
      background: '#16181d',
      surface: '#1c1f26',
      text: '#f5f5f5',
      accent: '#f65467',
      accentIcon: BRAND_CREAM_HEX,
    },
  },
}

export const PALETTE_FIXTURES: readonly PaletteFixture[] = [
  DEFAULT_PALETTE_FIXTURE,
  {
    id: 'cool-reference',
    name: 'Cool reference',
    colors: {
      light: {
        background: '#f8fafc',
        surface: '#e2e8f0',
        text: '#172033',
        accent: '#2563eb',
      },
      dark: {
        background: '#111827',
        surface: '#1f2937',
        text: '#f8fafc',
        accent: '#60a5fa',
      },
    },
  },
]

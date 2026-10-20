import { BRAND_CREAM_HEX, BRAND_HEX } from './ramps'
import { REFERENCE_PALETTE_SEEDS, type PaletteSeeds } from './palette'

export interface PaletteFixture {
  id: string
  name: string
  colors: PaletteSeeds
}

export const DEFAULT_PALETTE_FIXTURE: PaletteFixture = {
  id: 'maximal-reference',
  name: 'Maximal reference',
  colors: REFERENCE_PALETTE_SEEDS,
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

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_MATERIAL_PREFERENCE,
  parseMaterialPreference,
  readMaterialPreference,
  saveMaterialPreference,
  solarLightDirection,
  subscribeMaterialPreference,
} from './material-preference'

beforeEach(() => {
  localStorage.clear()
})

describe('material preference', () => {
  it('bounds persisted controls and rejects unknown preset values', () => {
    expect(parseMaterialPreference({
      preset: 'unknown',
      quality: 'high',
      strength: 4,
      motion: -2,
      lighting: 'timezone',
      timezone: 'America/Los_Angeles',
      latitude: 120,
      longitude: -220,
    })).toEqual({
      preset: 'clouds',
      quality: 'high',
      strength: 1,
      motion: 0,
      lighting: 'timezone',
      timezone: 'America/Los_Angeles',
      latitude: 90,
      longitude: -180,
    })
  })

  it('persists and broadcasts a validated preference', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeMaterialPreference(listener)
    const preference = {
      ...DEFAULT_MATERIAL_PREFERENCE,
      preset: 'water' as const,
      quality: 'battery' as const,
    }

    saveMaterialPreference(preference)

    expect(readMaterialPreference()).toEqual(preference)
    expect(listener).toHaveBeenCalledWith(preference)
    unsubscribe()
  })
})

describe('solar material lighting', () => {
  it('uses a stable studio direction in fixed mode', () => {
    expect([...solarLightDirection(DEFAULT_MATERIAL_PREFERENCE)]).toEqual([
      expect.closeTo(-0.42),
      expect.closeTo(-0.91),
    ])
  })

  it('calculates finite local sun directions from timezone and location', () => {
    const morning = solarLightDirection({
      lighting: 'timezone',
      timezone: 'America/Los_Angeles',
      latitude: 37.7749,
      longitude: -122.4194,
    }, new Date('2026-06-21T15:00:00Z'))
    const evening = solarLightDirection({
      lighting: 'timezone',
      timezone: 'America/Los_Angeles',
      latitude: 37.7749,
      longitude: -122.4194,
    }, new Date('2026-06-22T02:00:00Z'))

    expect([...morning].every(Number.isFinite)).toBe(true)
    expect([...evening].every(Number.isFinite)).toBe(true)
    expect([...morning]).not.toEqual([...evening])
  })
})

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_MATERIAL_PREFERENCE,
  solarLightDirection,
} from './material-preference'

describe('material preference', () => {
  it('provides a complete default preference', () => {
    expect(DEFAULT_MATERIAL_PREFERENCE).toMatchObject({
      preset: 'clouds',
      quality: 'balanced',
      lighting: 'fixed',
      latitude: 0,
      longitude: 0,
      solarFacingOffset: 0,
      solarFollowStrength: 0.5,
      solarEffect: 'atmospheric',
    })
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
      solarFacingOffset: 0,
    }, new Date('2026-06-21T15:00:00Z'))
    const evening = solarLightDirection({
      lighting: 'timezone',
      timezone: 'America/Los_Angeles',
      latitude: 37.7749,
      longitude: -122.4194,
      solarFacingOffset: 0,
    }, new Date('2026-06-22T02:00:00Z'))

    expect([...morning].every(Number.isFinite)).toBe(true)
    expect([...evening].every(Number.isFinite)).toBe(true)
    expect([...morning]).not.toEqual([...evening])
  })

  it('rotates the calculated direction by the user facing offset', () => {
    const base = solarLightDirection({
      lighting: 'timezone',
      timezone: 'America/Los_Angeles',
      latitude: 37.7749,
      longitude: -122.4194,
      solarFacingOffset: 0,
    }, new Date('2026-06-21T15:00:00Z'))
    const rotated = solarLightDirection({
      lighting: 'timezone',
      timezone: 'America/Los_Angeles',
      latitude: 37.7749,
      longitude: -122.4194,
      solarFacingOffset: 90,
    }, new Date('2026-06-21T15:00:00Z'))

    expect(rotated[0]).toBeCloseTo(-(base[1] ?? 0))
    expect(rotated[1]).toBeCloseTo(base[0] ?? 0)
    expect(Math.hypot(...rotated)).toBeCloseTo(Math.hypot(...base))
  })
})

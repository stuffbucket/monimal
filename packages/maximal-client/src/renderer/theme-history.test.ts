import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_APPEARANCE,
  type ThemeableSettingsSnapshot,
} from './appearance'
import {
  clearThemeHistory,
  pushThemeHistory,
  readThemeHistory,
  snapshotAppearance,
} from './theme-history'
import { BUILT_IN_THEMES } from './themes/catalog'

function snapshot(index: number): ThemeableSettingsSnapshot {
  return {
    theme: BUILT_IN_THEMES[index] ?? DEFAULT_APPEARANCE,
    selectedAt: new Date(Date.UTC(2026, 0, 1, index)).toISOString(),
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('theme history', () => {
  it('starts empty', () => {
    expect(readThemeHistory()).toEqual({ entries: [] })
  })

  it('keeps the five most recent distinct theme snapshots', () => {
    for (let index = 0; index < 7; index += 1) pushThemeHistory(snapshot(index))

    expect(readThemeHistory().entries.map(({ theme }) => theme.id)).toEqual(
      BUILT_IN_THEMES.slice(2, 7).reverse().map(({ id }) => id),
    )
    expect(JSON.parse(
      localStorage.getItem('maximal.theme-history.v1') ?? '[]',
    )).toHaveLength(5)
  })

  it('caps oversized persisted history when reading', () => {
    localStorage.setItem(
      'maximal.theme-history.v1',
      JSON.stringify(Array.from({ length: 7 }, (_, index) => snapshot(index))),
    )

    expect(readThemeHistory().entries).toHaveLength(5)
  })

  it('keeps repeated themes when their terminal or shader snapshot may differ', () => {
    pushThemeHistory(snapshot(0))
    pushThemeHistory(snapshot(1))
    pushThemeHistory(snapshot(0))

    expect(readThemeHistory().entries.map(({ theme }) => theme.id)).toEqual([
      BUILT_IN_THEMES[0]?.id,
      BUILT_IN_THEMES[1]?.id,
      BUILT_IN_THEMES[0]?.id,
    ])
  })

  it('reports corrupt snapshots and can clear them', () => {
    localStorage.setItem('maximal.theme-history.v1', '[{"selectedAt":"now"}]')
    expect(readThemeHistory()).toEqual({
      entries: [],
      error: '"undefined" is not valid JSON',
    })

    clearThemeHistory()
    expect(readThemeHistory()).toEqual({ entries: [] })
  })

  it('refuses to overwrite corrupt history', () => {
    localStorage.setItem('maximal.theme-history.v1', '{}')

    expect(() => pushThemeHistory(snapshot(0)))
      .toThrow('Theme history must be an array.')
  })

  it('reports non-Error storage parsing failures', () => {
    localStorage.setItem('maximal.theme-history.v1', '[]')
    vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- Exercises the defensive non-Error catch path.
      throw 'parse value'
    })

    expect(readThemeHistory()).toEqual({
      entries: [],
      error: 'Theme history could not be read.',
    })
  })

  it('captures only restorable appearance settings', () => {
    expect(snapshotAppearance({
      vibrancyEnabled: true,
      vibrancySupported: false,
      backgroundEffectsEnabled: true,
      reducedMotionEnabled: false,
    })).toEqual({
      vibrancyEnabled: true,
      backgroundEffectsEnabled: true,
      reducedMotionEnabled: false,
    })
  })
})

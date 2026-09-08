import { describe, expect, it } from 'vitest'

import {
  isSettingsSectionId,
  SETTINGS_SECTION_IDS,
  SETTINGS_SECTIONS,
} from './settings-sections'

describe('SETTINGS_SECTIONS', () => {
  it('declares each id exactly once, in the id list', () => {
    // The id list is what makes the renderer's panel table total: a section
    // added here and forgotten there has to fail to compile, and that only
    // holds while the two agree.
    expect(SETTINGS_SECTIONS.map(({ id }) => id)).toEqual([...SETTINGS_SECTION_IDS])
  })

  it('names every section', () => {
    // The label is product copy: it reaches the native menu and the rail.
    expect(SETTINGS_SECTIONS.every(({ label }) => label.trim() !== '')).toBe(true)
  })
})

describe('isSettingsSectionId', () => {
  it('accepts a declared id', () => {
    expect(isSettingsSectionId('settings-account-heading')).toBe(true)
  })

  it('rejects anything else', () => {
    // Main sends only declared ids, so this narrows a rename that got away
    // rather than untrusted input — but the renderer must not scroll to a
    // heading that does not exist either way.
    expect(isSettingsSectionId('settings-language-heading')).toBe(false)
    expect(isSettingsSectionId(undefined)).toBe(false)
    expect(isSettingsSectionId(7)).toBe(false)
  })
})

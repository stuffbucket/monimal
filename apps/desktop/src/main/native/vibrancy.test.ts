import { describe, expect, it, vi } from 'vitest'

import {
  applyVibrancy,
  OPAQUE_WINDOW_BACKGROUND,
  vibrancyPreference,
} from './vibrancy'

describe('vibrancy', () => {
  it('reports vibrancy as a macOS-only preference', () => {
    expect(vibrancyPreference(true, 'darwin')).toEqual({
      enabled: true,
      supported: true,
    })
    expect(vibrancyPreference(true, 'win32')).toEqual({
      enabled: false,
      supported: false,
    })
  })

  it('enables and disables the under-window material on macOS', () => {
    const window = {
      setBackgroundColor: vi.fn(),
      setVibrancy: vi.fn(),
    }

    expect(applyVibrancy(window, true, 'darwin')).toEqual({
      enabled: true,
      supported: true,
    })
    expect(window.setVibrancy).toHaveBeenLastCalledWith('under-window')
    expect(window.setBackgroundColor).toHaveBeenLastCalledWith('#00000000')

    applyVibrancy(window, false, 'darwin')
    expect(window.setVibrancy).toHaveBeenLastCalledWith(null)
    expect(window.setBackgroundColor).toHaveBeenLastCalledWith(
      OPAQUE_WINDOW_BACKGROUND,
    )
  })

  it('does not call macOS-only window methods on other platforms', () => {
    const window = {
      setBackgroundColor: vi.fn(),
      setVibrancy: vi.fn(),
    }

    applyVibrancy(window, true, 'linux')

    expect(window.setVibrancy).not.toHaveBeenCalled()
    expect(window.setBackgroundColor).not.toHaveBeenCalled()
  })
})

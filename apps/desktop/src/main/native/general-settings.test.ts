import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getLoginItemSettings,
  getVersion,
  setLoginItemSettings,
} = vi.hoisted(() => ({
  getLoginItemSettings: vi.fn(() => ({ openAtLogin: false })),
  getVersion: vi.fn(() => '1.2.3'),
  setLoginItemSettings: vi.fn(),
}))

vi.mock('electron', () => ({
  app: {
    getLoginItemSettings,
    getVersion,
    setLoginItemSettings,
  },
}))

import {
  getGeneralDesktopSettings,
  setStartOnLogin,
} from './general-settings'

beforeEach(() => {
  vi.clearAllMocks()
  getLoginItemSettings.mockReturnValue({ openAtLogin: false })
})

describe('general desktop settings', () => {
  it('reads version and login-item state from Electron', () => {
    expect(getGeneralDesktopSettings()).toEqual({
      version: '1.2.3',
      startOnLogin: false,
      quickAccessShortcut: 'control-control',
    })
  })

  it('updates Electron login-item state and returns the resulting settings', () => {
    getLoginItemSettings.mockReturnValue({ openAtLogin: true })

    expect(setStartOnLogin(true)).toEqual({
      version: '1.2.3',
      startOnLogin: true,
      quickAccessShortcut: 'control-control',
    })
    expect(setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true })
  })
})

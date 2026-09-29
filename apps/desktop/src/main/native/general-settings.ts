import { app } from 'electron'

import type { GeneralDesktopSettings } from '@maximal/maximal-client/shared/host'

export function getGeneralDesktopSettings(): GeneralDesktopSettings {
  return {
    version: app.getVersion(),
    startOnLogin: app.getLoginItemSettings().openAtLogin,
    quickAccessShortcut: 'control-control',
  }
}

export function setStartOnLogin(enabled: boolean): GeneralDesktopSettings {
  app.setLoginItemSettings({ openAtLogin: enabled })
  return getGeneralDesktopSettings()
}

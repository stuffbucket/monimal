import type { TerminalTypographySettings } from '@maximal/maximal-client/shared/host'
import { app, ipcMain } from 'electron'
import { z } from 'zod'

import { BRIDGE_CHANNELS } from '../../shared/bridge-channels.js'
import {
  listGhosttyNerdFonts,
  waitForGhosttyNerdFont,
} from './ghostty-fonts.js'
import { installNerdFont } from './nerd-font-installer.js'
import {
  loadApplicationSettings,
  setTerminalTypography,
  terminalTypographySettingsSchema,
} from '../preferences/application-settings.js'

export function registerAppearanceIpc(
  broadcast: (channel: string, settings: TerminalTypographySettings) => void,
  openTypographyPreview: () => void,
): void {
  ipcMain.handle(BRIDGE_CHANNELS.terminalTypographyGet, () =>
    loadApplicationSettings(app.getPath('userData')).settings.terminalTypography,
  )
  ipcMain.handle(
    BRIDGE_CHANNELS.terminalTypographyUpdate,
    async (_event, input: unknown) => {
      const settings = await setTerminalTypography(
        app.getPath('userData'),
        terminalTypographySettingsSchema.parse(input),
      )
      broadcast(BRIDGE_CHANNELS.terminalTypographyChanged, settings)
      return settings
    },
  )
  ipcMain.handle(BRIDGE_CHANNELS.terminalTypographyFonts, () =>
    listGhosttyNerdFonts(),
  )
  ipcMain.handle(
    BRIDGE_CHANNELS.terminalTypographyInstallFont,
    async (_event, fontId: unknown) => {
      const asset = await installNerdFont(z.string().min(1).parse(fontId))
      const catalog = await waitForGhosttyNerdFont(asset.family)
      if (
        catalog.status !== 'available'
        || !catalog.fonts.includes(asset.family)
      ) {
        throw new Error(
          `${asset.label} was installed, but the terminal font catalog did not report ${asset.family}.`,
        )
      }
      return catalog
    },
  )
  ipcMain.handle(BRIDGE_CHANNELS.terminalTypographyOpenPreview, () => {
    openTypographyPreview()
  })
}

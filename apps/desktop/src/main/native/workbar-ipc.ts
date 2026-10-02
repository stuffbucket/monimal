import type { WorkbarLayout } from '@maximal/maximal-client/shared/host'
import { app, ipcMain } from 'electron'

import { BRIDGE_CHANNELS } from '../../shared/bridge-channels.js'
import {
  loadApplicationSettings,
  setWorkbarLayout,
  workbarLayoutUpdateSchema,
} from '../preferences/application-settings.js'

export function registerWorkbarIpc(
  broadcast: (channel: string, layout: WorkbarLayout) => void,
): void {
  ipcMain.handle(BRIDGE_CHANNELS.workbarGet, () =>
    loadApplicationSettings(app.getPath('userData')).settings.workbarLayout,
  )
  ipcMain.handle(BRIDGE_CHANNELS.workbarUpdate, async (_event, input: unknown) => {
    const layout = await setWorkbarLayout(
      app.getPath('userData'),
      workbarLayoutUpdateSchema.parse(input),
    )
    broadcast(BRIDGE_CHANNELS.workbarChanged, layout)
    return layout
  })
}

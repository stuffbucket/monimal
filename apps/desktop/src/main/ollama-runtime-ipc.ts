import {
  getOllamaRuntimeStatus,
  launchOllama,
  updateOllamaContextLength,
} from '@maximal/maximal-ollama'
import { ipcMain } from 'electron'
import { z } from 'zod'

import { BRIDGE_CHANNELS } from '../shared/bridge-channels.js'

const endpoint = z.url().refine((value) => {
  const protocol = new URL(value).protocol
  return protocol === 'http:' || protocol === 'https:'
}, 'Ollama endpoint must use HTTP or HTTPS')

function configuredEndpoint(input: unknown): string | undefined {
  return input === undefined ? undefined : endpoint.parse(input)
}

export function registerOllamaRuntimeIpc(options: {
  preferences: () => unknown
  updatePreferences: (input: unknown) => Promise<unknown>
}): void {
  ipcMain.handle(BRIDGE_CHANNELS.ollamaRuntimeStatus, (_event, input: unknown) =>
    getOllamaRuntimeStatus({ configuredEndpoint: configuredEndpoint(input) }))
  ipcMain.handle(BRIDGE_CHANNELS.ollamaRuntimeLaunch, (_event, input: unknown) =>
    launchOllama({ configuredEndpoint: configuredEndpoint(input) }))
  ipcMain.handle(
    BRIDGE_CHANNELS.ollamaRuntimeUpdateContext,
    (_event, value: unknown) =>
      updateOllamaContextLength(z.number().int().parse(value)),
  )
  ipcMain.handle(
    BRIDGE_CHANNELS.ollamaRuntimePreferences,
    () => options.preferences(),
  )
  ipcMain.handle(
    BRIDGE_CHANNELS.ollamaRuntimeUpdatePreferences,
    (_event, input: unknown) => options.updatePreferences(input),
  )
}

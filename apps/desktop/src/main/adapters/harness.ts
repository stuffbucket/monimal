import { join } from 'node:path'

import { createElectronPanel, type ElectronPanel } from '@maximal/maximal-electron/electron-panel'
import type { AskAccepted } from '@maximal/maximal-harness'
import {
  abortAgent,
  configureAgent,
  discoverProvider,
  isAgentBusy,
  resolveApproval,
  runAgent,
  selectAgentModel,
  shutdownAgent,
} from '@maximal/maximal-harness/host'
import { LLAMA_WORKER_FILENAME } from '@maximal/maximal-llama-cpp'
import {
  configureLlamaHost,
  configureModel,
  DEFAULT_EMBEDDED_MODEL_FILE,
  ensureModel,
  stopEngine,
} from '@maximal/maximal-llama-cpp/host'
import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  type IpcMainInvokeEvent,
  type Rectangle,
} from 'electron'
import { z } from 'zod'

import { BRIDGE_CHANNELS } from '../../shared/bridge-channels.js'
import { loadHarnessOptions } from './harness-options.js'
import { mainLogger } from '../main-logger.js'
import { updateUserPreferences } from '../preferences/user-preferences.js'

const HOTKEY = 'CommandOrControl+Shift+Space'
const PANEL_MAX_WIDTH = 720
const PANEL_MAX_HEIGHT = 640
const PANEL_HORIZONTAL_MARGIN = 24
const PANEL_VERTICAL_MARGIN = 48
const askRequest = z.object({ prompt: z.string().trim().min(1) })
const modelSelection = z.string().trim().min(1).max(1_000)
const approvalRequest = z.object({
  id: z.string().min(1),
  allow: z.boolean(),
  remember: z.boolean(),
})

const SYSTEM_PROMPT = [
  'You are a concise coding assistant in the Maximal desktop application.',
  'You have read, write, edit, and bash tools for the working directory.',
  'Use a tool only when it is needed to answer or act.',
  'Answer general questions directly and never run a destructive command unless asked.',
].join(' ')

let panel: ElectronPanel | undefined
let registered = false
let boundHotkey = false

export function assistantPanelBounds(display: Rectangle): Rectangle {
  const width = Math.min(PANEL_MAX_WIDTH, Math.max(1, display.width - PANEL_HORIZONTAL_MARGIN * 2))
  const height = Math.min(PANEL_MAX_HEIGHT, Math.max(1, display.height - PANEL_VERTICAL_MARGIN * 2))
  return {
    x: display.x + Math.floor((display.width - width) / 2),
    y: display.y + Math.floor((display.height - height) / 2),
    width,
    height,
  }
}

function owner(event: IpcMainInvokeEvent): BrowserWindow {
  const window = panel?.window()
  if (!window || window.isDestroyed() || event.sender !== window.webContents) {
    throw new Error('Harness requests are accepted only from the overlay window.')
  }
  return window
}

function send(channel: string, payload: unknown): void {
  const window = panel?.window()
  if (!window || window.isDestroyed()) return
  window.webContents.send(channel, payload)
}

function loadRenderer(window: BrowserWindow): void {
  if (typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined' && MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void window.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}/overlay.html`)
  } else {
    void window.loadFile(join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/overlay.html`))
  }
}

function registerIpc(): void {
  if (registered) return
  registered = true

  ipcMain.handle(BRIDGE_CHANNELS.harnessShow, () => {
    panel?.show()
  })
  ipcMain.handle(BRIDGE_CHANNELS.harnessHide, (event) => {
    owner(event)
    panel?.hide()
  })
  ipcMain.handle(BRIDGE_CHANNELS.harnessProvider, (event) => {
    owner(event)
    return discoverProvider()
  })
  ipcMain.handle(
    BRIDGE_CHANNELS.harnessSelectModel,
    async (event, input: unknown) => {
      owner(event)
      const selected = await selectAgentModel(modelSelection.parse(input))
      if (selected.state !== 'ready') {
        throw new Error('The selected model did not become ready.')
      }
      await updateUserPreferences({ agentModel: selected.modelKey })
      return selected
    },
  )
  ipcMain.handle(BRIDGE_CHANNELS.harnessAsk, (event, input: unknown): AskAccepted => {
    owner(event)
    const { prompt } = askRequest.parse(input)
    if (isAgentBusy()) return { started: false, reason: 'Already working on the previous request.' }

    void runAgent(prompt, {
      onDelta: (text) => send(BRIDGE_CHANNELS.harnessDelta, { text }),
      onTool: (name, phase, isError) =>
        send(BRIDGE_CHANNELS.harnessTool, { name, phase, isError }),
      onApproval: (request) => send(BRIDGE_CHANNELS.harnessApproval, request),
      onEnd: (result) => send(BRIDGE_CHANNELS.harnessEnd, result),
    })
    return { started: true }
  })
  ipcMain.handle(BRIDGE_CHANNELS.harnessAbort, (event) => {
    owner(event)
    abortAgent()
  })
  ipcMain.handle(BRIDGE_CHANNELS.harnessApprove, (event, input: unknown) => {
    owner(event)
    resolveApproval(approvalRequest.parse(input))
  })
  ipcMain.handle(BRIDGE_CHANNELS.harnessEnsureModel, async (event) => {
    owner(event)
    const progress = await ensureModel((next) =>
      send(BRIDGE_CHANNELS.harnessModelProgress, next),
    )
    if (progress.state === 'ready') {
      const selected = await selectAgentModel(
        `embedded:${DEFAULT_EMBEDDED_MODEL_FILE}`,
      )
      if (selected.state !== 'ready') {
        throw new Error('The downloaded model did not become ready.')
      }
      await updateUserPreferences({ agentModel: selected.modelKey })
    }
    return progress
  })
}

export function startHarnessHost(options: { modelDirectory: string }): void {
  configureLlamaHost({ workerPath: join(__dirname, LLAMA_WORKER_FILENAME) })
  configureModel({ directory: options.modelDirectory })
  configureAgent({
    systemPrompt: SYSTEM_PROMPT,
    ...loadHarnessOptions(app.getPath('userData')),
  })
  panel = createElectronPanel({
    preloadPath: join(__dirname, 'preload.js'),
    loadRenderer,
    bounds: assistantPanelBounds,
  })
  registerIpc()

  try {
    boundHotkey = globalShortcut.register(HOTKEY, () => panel?.toggle())
    if (!boundHotkey) mainLogger.error({ hotkey: HOTKEY }, 'Harness hotkey is already in use')
  } catch (error) {
    mainLogger.error(
      { hotkey: HOTKEY, errorName: error instanceof Error ? error.name : 'unknown' },
      'Harness hotkey is invalid',
    )
  }
}

export function showHarnessHost(): void {
  panel?.show()
}

export function isHarnessBusy(): boolean {
  return isAgentBusy()
}

export async function stopHarnessHost(): Promise<void> {
  if (boundHotkey) globalShortcut.unregister(HOTKEY)
  boundHotkey = false
  panel?.destroy()
  panel = undefined
  await shutdownAgent()
  stopEngine()

  if (registered) {
    for (const channel of [
      BRIDGE_CHANNELS.harnessShow,
      BRIDGE_CHANNELS.harnessHide,
      BRIDGE_CHANNELS.harnessProvider,
      BRIDGE_CHANNELS.harnessSelectModel,
      BRIDGE_CHANNELS.harnessAsk,
      BRIDGE_CHANNELS.harnessAbort,
      BRIDGE_CHANNELS.harnessApprove,
      BRIDGE_CHANNELS.harnessEnsureModel,
    ]) ipcMain.removeHandler(channel)
    registered = false
  }
}

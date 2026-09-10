import { join } from 'node:path'

import { createElectronPanel, type ElectronPanel } from '@stuffbucket/maximal-electron/electron-panel'
import type { AskAccepted } from '@stuffbucket/maximal-harness'
import { LLAMA_WORKER_FILENAME } from '@stuffbucket/maximal-harness/packaging'
import {
  abortAgent,
  configureAgent,
  configureLlamaHost,
  configureModel,
  discoverProvider,
  ensureModel,
  isAgentBusy,
  resolveApproval,
  runAgent,
  shutdownAgent,
  stopEngine,
} from '@stuffbucket/maximal-harness/host'
import { app, BrowserWindow, globalShortcut, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'

import { BRIDGE_CHANNELS } from '../shared/bridge-channels.js'
import { loadAgentPreferences } from './agent-preferences.js'

const HOTKEY = 'CommandOrControl+Shift+Space'
const askRequest = z.object({ prompt: z.string().trim().min(1) })
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

  ipcMain.handle(BRIDGE_CHANNELS.harnessHide, (event) => {
    owner(event)
    panel?.hide()
  })
  ipcMain.handle(BRIDGE_CHANNELS.harnessProvider, (event) => {
    owner(event)
    return discoverProvider()
  })
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
  ipcMain.handle(BRIDGE_CHANNELS.harnessEnsureModel, (event) => {
    owner(event)
    return ensureModel((progress) => send(BRIDGE_CHANNELS.harnessModelProgress, progress))
  })
}

export function startHarnessHost(): void {
  configureLlamaHost({ workerPath: join(__dirname, LLAMA_WORKER_FILENAME) })
  configureModel({ directory: join(app.getPath('userData'), 'models') })
  configureAgent({
    systemPrompt: SYSTEM_PROMPT,
    ...loadAgentPreferences(app.getPath('userData')),
  })
  panel = createElectronPanel({
    preloadPath: join(__dirname, 'preload.js'),
    loadRenderer,
  })
  registerIpc()

  try {
    boundHotkey = globalShortcut.register(HOTKEY, () => panel?.toggle())
    if (!boundHotkey) console.error(`Harness hotkey "${HOTKEY}" is already in use.`)
  } catch (error) {
    console.error(`Harness hotkey "${HOTKEY}" is invalid:`, error)
  }
}

export function showHarnessHost(): void {
  panel?.show()
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
      BRIDGE_CHANNELS.harnessHide,
      BRIDGE_CHANNELS.harnessProvider,
      BRIDGE_CHANNELS.harnessAsk,
      BRIDGE_CHANNELS.harnessAbort,
      BRIDGE_CHANNELS.harnessApprove,
      BRIDGE_CHANNELS.harnessEnsureModel,
    ]) ipcMain.removeHandler(channel)
    registered = false
  }
}

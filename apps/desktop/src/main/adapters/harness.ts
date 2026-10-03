import { join } from 'node:path'

import { createElectronPanel, type ElectronPanel } from '@maximal/maximal-electron/electron-panel'
import type { AgentEffort, AskAccepted } from '@maximal/maximal-harness'
import {
  abortAgent,
  configureAgent,
  discoverProvider,
  isAgentBusy,
  resolveApproval,
  runAgent,
  selectAgentEffort,
  selectAgentModel,
  setAgentEffortPreference,
  shutdownAgent,
} from '@maximal/maximal-harness/host'
import { LLAMA_WORKER_FILENAME } from '@maximal/maximal-runner-llama-cpp'
import {
  configureLlamaHost,
  configureModel,
  DEFAULT_EMBEDDED_MODEL_FILE,
  ensureModel,
  stopEngine,
} from '@maximal/maximal-runner-llama-cpp/host'
import {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  type IpcMainInvokeEvent,
  type Rectangle,
} from 'electron'
import { z } from 'zod'

import { BRIDGE_CHANNELS } from '../../shared/bridge-channels.js'
import { loadHarnessOptions } from './harness-options.js'
import { mainLogger } from '../main-logger.js'
import { DoubleControlShortcut } from '../native/double-control-shortcut.js'
import {
  readUserPreferences,
  updateUserPreferences,
} from '../preferences/user-preferences.js'

const PANEL_MAX_WIDTH = 640
const PANEL_MAX_HEIGHT = 480
const PANEL_HORIZONTAL_MARGIN = 24
const PANEL_VERTICAL_MARGIN = 32
const askRequest = z.object({ prompt: z.string().trim().min(1) })
const modelSelection = z.string().trim().min(1).max(1_000)
const effortSelection = z.enum(['low', 'medium', 'high'])
const rectangle = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})
const overlayAnchorSchema = z.object({
  displayWorkArea: rectangle,
  offsetX: z.number().int(),
  offsetY: z.number().int(),
  panelWidth: z.number().int().positive(),
  panelHeight: z.number().int().positive(),
})
type OverlayAnchor = z.infer<typeof overlayAnchorSchema>
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
let quickAccessShortcut: DoubleControlShortcut | undefined
let activationAllowed = (): boolean => true
let overlayAnchor: OverlayAnchor | undefined
let anchorMoved = false
let preferenceLoadGeneration = 0
let summonOnStart = false

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

function anchoredPanelBounds(fallbackDisplay: Rectangle): Rectangle {
  if (!overlayAnchor) return assistantPanelBounds(fallbackDisplay)
  const matchingDisplay = screen.getDisplayMatching(overlayAnchor.displayWorkArea)
  const display = matchingDisplay.workArea
  const bounds = assistantPanelBounds(display)
  const previousWidth = Math.max(
    1,
    overlayAnchor.displayWorkArea.width - overlayAnchor.panelWidth,
  )
  const previousHeight = Math.max(
    1,
    overlayAnchor.displayWorkArea.height - overlayAnchor.panelHeight,
  )
  const availableWidth = Math.max(0, display.width - bounds.width)
  const availableHeight = Math.max(0, display.height - bounds.height)
  const relativeX = Math.min(1, Math.max(0, overlayAnchor.offsetX / previousWidth))
  const relativeY = Math.min(1, Math.max(0, overlayAnchor.offsetY / previousHeight))
  return {
    ...bounds,
    x: display.x + Math.round(relativeX * availableWidth),
    y: display.y + Math.round(relativeY * availableHeight),
  }
}

function persistPanelAnchor(bounds: Rectangle): void {
  anchorMoved = true
  const displayWorkArea = screen.getDisplayMatching(bounds).workArea
  overlayAnchor = {
    displayWorkArea,
    offsetX: bounds.x - displayWorkArea.x,
    offsetY: bounds.y - displayWorkArea.y,
    panelWidth: bounds.width,
    panelHeight: bounds.height,
  }
  void updateUserPreferences({ overlayAnchor }).catch((error: unknown) => {
    mainLogger.error(
      { errorName: error instanceof Error ? error.name : 'unknown' },
      'Failed to save the assistant overlay position',
    )
  })
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

  ipcMain.handle(BRIDGE_CHANNELS.harnessShow, showHarnessHost)
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
  ipcMain.handle(
    BRIDGE_CHANNELS.harnessSelectEffort,
    async (event, input: unknown) => {
      owner(event)
      const effort: AgentEffort = effortSelection.parse(input)
      const selected = await selectAgentEffort(effort)
      await updateUserPreferences({ agentEffort: effort })
      return selected
    },
  )
  ipcMain.handle(BRIDGE_CHANNELS.harnessAsk, (event, input: unknown): AskAccepted => {
    owner(event)
    const { prompt } = askRequest.parse(input)
    if (isAgentBusy()) return { started: false, reason: 'Already working on the previous request.' }

    void runAgent(prompt, {
      onDelta: (text) => send(BRIDGE_CHANNELS.harnessDelta, { text }),
      onTool: (id, name, phase, isError) =>
        send(BRIDGE_CHANNELS.harnessTool, { id, name, phase, isError }),
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

export async function startHarnessHost(options: {
  modelDirectory: string
  canActivate?: () => boolean
}): Promise<void> {
  activationAllowed = options.canActivate ?? (() => true)
  configureLlamaHost({ workerPath: join(__dirname, LLAMA_WORKER_FILENAME) })
  configureModel({ directory: options.modelDirectory })
  const agentOptions = {
    systemPrompt: SYSTEM_PROMPT,
    ...loadHarnessOptions(app.getPath('userData')),
  }
  configureAgent(agentOptions)
  anchorMoved = false
  const loadGeneration = ++preferenceLoadGeneration
  void readUserPreferences().then((preferences) => {
    if (loadGeneration !== preferenceLoadGeneration) return
    const anchor = overlayAnchorSchema.safeParse(preferences.overlayAnchor)
    if (!anchorMoved) overlayAnchor = anchor.success ? anchor.data : undefined
    const effort = effortSelection.safeParse(preferences.agentEffort)
    if (effort.success) setAgentEffortPreference(effort.data)
  }).catch((error: unknown) => {
    mainLogger.error(
      { errorName: error instanceof Error ? error.name : 'unknown' },
      'Failed to load assistant overlay preferences',
    )
  })
  panel = createElectronPanel({
    preloadPath: join(__dirname, 'preload.js'),
    loadRenderer,
    bounds: anchoredPanelBounds,
    movable: true,
    onMoved: persistPanelAnchor,
  })
  if (summonOnStart && activationAllowed()) {
    summonOnStart = false
    panel.show()
  }
  registerIpc()

  if (process.env['MAXIMAL_DISABLE_GLOBAL_KEYBOARD_HOOK'] !== '1') {
    const { uIOhook } = await import('uiohook-napi')
    quickAccessShortcut = new DoubleControlShortcut(uIOhook, toggleHarnessHost)
    try {
      quickAccessShortcut.start()
    } catch (error) {
      quickAccessShortcut = undefined
      mainLogger.error(
        { errorName: error instanceof Error ? error.name : 'unknown' },
        'Quick access keyboard hook failed to start',
      )
    }
  }
}

export function showHarnessHost(): void {
  if (!activationAllowed()) return
  if (panel) panel.show()
  else summonOnStart = true
}

export function toggleHarnessHost(): void {
  if (!activationAllowed()) return
  if (panel) panel.toggle()
  else summonOnStart = !summonOnStart
}

export function isHarnessBusy(): boolean {
  return isAgentBusy()
}

export async function stopHarnessHost(): Promise<void> {
  preferenceLoadGeneration += 1
  quickAccessShortcut?.stop()
  quickAccessShortcut = undefined
  panel?.destroy()
  panel = undefined
  summonOnStart = false
  activationAllowed = () => true
  await shutdownAgent()
  stopEngine()

  if (registered) {
    for (const channel of [
      BRIDGE_CHANNELS.harnessShow,
      BRIDGE_CHANNELS.harnessHide,
      BRIDGE_CHANNELS.harnessProvider,
      BRIDGE_CHANNELS.harnessSelectModel,
      BRIDGE_CHANNELS.harnessSelectEffort,
      BRIDGE_CHANNELS.harnessAsk,
      BRIDGE_CHANNELS.harnessAbort,
      BRIDGE_CHANNELS.harnessApprove,
      BRIDGE_CHANNELS.harnessEnsureModel,
    ]) ipcMain.removeHandler(channel)
    registered = false
  }
}

import { join } from 'node:path'

import { createElectronPanel, type ElectronPanel } from '@maximal/maximal-electron/electron-panel'
import type {
  AgentEffort,
  AskAccepted,
  AssistantOverlayPreferences,
} from '@maximal/maximal-harness'
import {
  abortAgent,
  configureAgent,
  createAssistantChatStore,
  discoverProvider,
  isAgentBusy,
  resolveApproval,
  runAgent,
  selectAgentEffort,
  selectAgentModel,
  setAgentEffortPreference,
  shutdownAgent,
  HARNESS_SYSTEM_PROMPT,
  type AssistantChatStore,
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
  screen,
  type IpcMainInvokeEvent,
  type Rectangle,
} from 'electron'
import { z } from 'zod'

import { BRIDGE_CHANNELS } from '../../shared/bridge-channels.js'
import { loadHarnessOptions } from './harness-options.js'
import { launchAssistantTerminal } from './terminal.js'
import { mainLogger } from '../main-logger.js'
import {
  readUserPreferences,
  updateUserPreferences,
} from '../preferences/user-preferences.js'
import {
  loadApplicationSettings,
  setAssistantOverlayPreferences,
} from '../preferences/application-settings.js'

const HOTKEY = 'CommandOrControl+Shift+Space'
const PANEL_MAX_WIDTH = 960
const PANEL_MAX_HEIGHT = 520
const PANEL_HORIZONTAL_MARGIN = 24
const PANEL_VERTICAL_MARGIN = 32
const CHAT_DATABASE_FILENAME = 'assistant-chats.sqlite'
const ASSISTANT_CLI_FILENAME = 'assistant-cli.cjs'
const MAIN_CHAT_OWNER = `electron:${String(process.pid)}`
const CHAT_LEASE_TTL_MS = 30_000
const CHAT_LEASE_RENEW_MS = 10_000
const askRequest = z.object({
  prompt: z.string().trim().min(1),
  chatId: z.string().min(1).optional(),
})
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
const overlayPreferencesUpdate = z.object({
  candy: z.boolean().optional(),
  approval: z.enum(['all', 'writes', 'none']).optional(),
}).refine((update) => Object.keys(update).length > 0)
const chatId = z.string().min(1)
const chatListQuery = z.object({
  search: z.string().optional(),
  status: z.enum(['active', 'archived', 'all']).optional(),
  sort: z.enum(['activity', 'created', 'title']).optional(),
  direction: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
})
const chatUpdate = z.object({
  id: chatId,
  update: z.object({
    title: z.string().trim().min(1).max(200).optional(),
    status: z.enum(['active', 'archived']).optional(),
    attention: z.enum(['read', 'unread', 'notification']).optional(),
    pinned: z.boolean().optional(),
  }).refine((update) => Object.keys(update).length > 0),
})
const chatTerminal = z.object({
  id: chatId,
  cols: z.number().int().positive().max(1_000),
  rows: z.number().int().positive().max(1_000),
})

let panel: ElectronPanel | undefined
let registered = false
let boundHotkey = false
let overlayAnchor: OverlayAnchor | undefined
let anchorMoved = false
let preferenceLoadGeneration = 0
let summonOnStart = false
let chats: AssistantChatStore | undefined

function chatStore(): AssistantChatStore {
  if (!chats) throw new Error('Assistant chat storage is not available.')
  return chats
}

function chatDatabasePath(): string {
  return join(app.getPath('userData'), CHAT_DATABASE_FILENAME)
}

function overlayPreferences(): AssistantOverlayPreferences {
  const settings = loadApplicationSettings(app.getPath('userData')).settings
  return {
    candy: settings.assistantOverlayCandy,
    approval: settings.agentApproval,
    hotkey: HOTKEY,
  }
}

function configureHarnessAgent(): void {
  configureAgent({
    systemPrompt: HARNESS_SYSTEM_PROMPT,
    ...loadHarnessOptions(app.getPath('userData')),
  })
}

export function assistantPanelBounds(workArea: Rectangle): Rectangle {
  const width = Math.min(PANEL_MAX_WIDTH, Math.max(1, workArea.width - PANEL_HORIZONTAL_MARGIN * 2))
  const height = Math.min(PANEL_MAX_HEIGHT, Math.max(1, workArea.height - PANEL_VERTICAL_MARGIN * 2))
  return {
    x: workArea.x + Math.floor((workArea.width - width) / 2),
    y: workArea.y + workArea.height - height - PANEL_VERTICAL_MARGIN,
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

function broadcastChatsChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(BRIDGE_CHANNELS.harnessChatsChanged)
    }
  }
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
  ipcMain.handle(BRIDGE_CHANNELS.harnessToggle, () => {
    panel?.toggle()
  })
  ipcMain.handle(BRIDGE_CHANNELS.harnessOpenChat, (_event, input: unknown) => {
    const id = chatId.parse(input)
    chatStore().open(id)
    panel?.show()
    send(BRIDGE_CHANNELS.harnessChatSelected, { id })
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
    const { prompt, chatId: requestedChatId } = askRequest.parse(input)
    if (isAgentBusy()) return { started: false, reason: 'Already working on the previous request.' }
    const conversation = requestedChatId
      ? chatStore().open(requestedChatId)
      : chatStore().create(prompt.slice(0, 80))
    if (!chatStore().acquire(conversation.id, MAIN_CHAT_OWNER, CHAT_LEASE_TTL_MS)) {
      return {
        started: false,
        reason: 'This chat is active in a terminal. Close it or wait for it to finish.',
      }
    }
    const initialMessages = chatStore().agentMessages(conversation.id)
    chatStore().append(conversation.id, 'user', prompt)
    broadcastChatsChanged()
    let answer = ''
    const leaseTimer = setInterval(() => {
      chatStore().renew(conversation.id, MAIN_CHAT_OWNER, CHAT_LEASE_TTL_MS)
    }, CHAT_LEASE_RENEW_MS)
    leaseTimer.unref()

    void runAgent(prompt, {
      onDelta: (text) => {
        answer += text
        send(BRIDGE_CHANNELS.harnessDelta, { text })
      },
      onTool: (id, name, phase, isError) =>
        send(BRIDGE_CHANNELS.harnessTool, { id, name, phase, isError }),
      onApproval: (request) => send(BRIDGE_CHANNELS.harnessApproval, request),
      onEnd: (result) => {
        clearInterval(leaseTimer)
        chatStore().release(conversation.id, MAIN_CHAT_OWNER)
        if (answer) chatStore().append(conversation.id, 'assistant', answer)
        if (!result.ok) {
          chatStore().update(conversation.id, { attention: 'notification' })
        } else if (panel?.window()?.isVisible() === false) {
          chatStore().update(conversation.id, { attention: 'unread' })
        }
        broadcastChatsChanged()
        send(BRIDGE_CHANNELS.harnessEnd, result)
      },
    }, {
      initialMessages,
    }).then((messages) => {
      if (messages) {
        chatStore().saveAgentState(conversation.id, { version: 1, messages })
      }
    })
    return { started: true, chatId: conversation.id }
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
  ipcMain.handle(BRIDGE_CHANNELS.harnessPreferences, () =>
    overlayPreferences(),
  )
  ipcMain.handle(
    BRIDGE_CHANNELS.harnessUpdatePreferences,
    async (_event, input: unknown) => {
      const update = overlayPreferencesUpdate.parse(input)
      await setAssistantOverlayPreferences(app.getPath('userData'), update)
      configureHarnessAgent()
      const preferences = overlayPreferences()
      send(BRIDGE_CHANNELS.harnessPreferencesChanged, preferences)
      return preferences
    },
  )
  ipcMain.handle(BRIDGE_CHANNELS.harnessChatsList, (_event, input: unknown) =>
    chatStore().list(chatListQuery.parse(input ?? {})),
  )
  ipcMain.handle(BRIDGE_CHANNELS.harnessChatCreate, (_event, input: unknown) =>
    Promise.resolve(chatStore().create(
      input === undefined ? undefined : z.string().trim().min(1).max(200).parse(input),
    )).then((created) => {
      broadcastChatsChanged()
      return created
    }),
  )
  ipcMain.handle(BRIDGE_CHANNELS.harnessChatOpen, (_event, input: unknown) =>
    chatStore().open(chatId.parse(input)),
  )
  ipcMain.handle(BRIDGE_CHANNELS.harnessChatUpdate, (_event, input: unknown) => {
    const parsed = chatUpdate.parse(input)
    const updated = chatStore().update(parsed.id, parsed.update)
    broadcastChatsChanged()
    return updated
  })
  ipcMain.handle(BRIDGE_CHANNELS.harnessChatRemove, (_event, input: unknown) => {
    chatStore().remove(chatId.parse(input))
    broadcastChatsChanged()
  })
  ipcMain.handle(BRIDGE_CHANNELS.harnessChatMessages, (_event, input: unknown) =>
    chatStore().messages(chatId.parse(input)),
  )
  ipcMain.handle(BRIDGE_CHANNELS.harnessChatTerminal, (event, input: unknown) => {
    const request = chatTerminal.parse(input)
    const conversation = chatStore().open(request.id)
    const options = loadHarnessOptions(app.getPath('userData'))
    const args = [
      join(__dirname, ASSISTANT_CLI_FILENAME),
      '--chat', conversation.id,
      '--database', chatDatabasePath(),
      '--cwd', options.cwd,
      '--approval', options.approval,
      options.codingTools ? '--coding-tools' : '--no-coding-tools',
      ...options.toolsetIds.flatMap((id) => ['--toolset', id]),
      ...(options.preferredModel ? ['--model', options.preferredModel] : []),
    ]
    broadcastChatsChanged()
    return launchAssistantTerminal(
      BrowserWindow.fromWebContents(event.sender) ?? undefined,
      {
        command: process.execPath,
        args,
        cwd: options.cwd,
        env: { ELECTRON_RUN_AS_NODE: '1' },
        cols: request.cols,
        rows: request.rows,
        label: conversation.title,
      },
    )
  })
}

export function startHarnessHost(options: { modelDirectory: string }): void {
  configureLlamaHost({ workerPath: join(__dirname, LLAMA_WORKER_FILENAME) })
  configureModel({ directory: options.modelDirectory })
  chats = createAssistantChatStore(chatDatabasePath())
  configureHarnessAgent()
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
  if (summonOnStart) {
    summonOnStart = false
    panel.show()
  }
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
  if (panel) panel.show()
  else summonOnStart = true
}

export function toggleHarnessHost(): void {
  if (panel) panel.toggle()
  else summonOnStart = !summonOnStart
}

export function isHarnessBusy(): boolean {
  return isAgentBusy()
}

export async function stopHarnessHost(): Promise<void> {
  preferenceLoadGeneration += 1
  if (boundHotkey) globalShortcut.unregister(HOTKEY)
  boundHotkey = false
  panel?.destroy()
  panel = undefined
  summonOnStart = false
  await shutdownAgent()
  stopEngine()

  if (registered) {
    for (const channel of [
      BRIDGE_CHANNELS.harnessShow,
      BRIDGE_CHANNELS.harnessToggle,
      BRIDGE_CHANNELS.harnessOpenChat,
      BRIDGE_CHANNELS.harnessHide,
      BRIDGE_CHANNELS.harnessProvider,
      BRIDGE_CHANNELS.harnessSelectModel,
      BRIDGE_CHANNELS.harnessSelectEffort,
      BRIDGE_CHANNELS.harnessAsk,
      BRIDGE_CHANNELS.harnessAbort,
      BRIDGE_CHANNELS.harnessApprove,
      BRIDGE_CHANNELS.harnessEnsureModel,
      BRIDGE_CHANNELS.harnessPreferences,
      BRIDGE_CHANNELS.harnessUpdatePreferences,
      BRIDGE_CHANNELS.harnessChatsList,
      BRIDGE_CHANNELS.harnessChatCreate,
      BRIDGE_CHANNELS.harnessChatOpen,
      BRIDGE_CHANNELS.harnessChatUpdate,
      BRIDGE_CHANNELS.harnessChatRemove,
      BRIDGE_CHANNELS.harnessChatMessages,
      BRIDGE_CHANNELS.harnessChatTerminal,
    ]) ipcMain.removeHandler(channel)
    registered = false
  }
  chats?.close()
  chats = undefined
}

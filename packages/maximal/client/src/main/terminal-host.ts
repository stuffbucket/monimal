import {
  acknowledgePty,
  copyPty,
  configurePty,
  discoverTerminalTargets,
  grantPtyProjection,
  killAllPtys,
  killPty,
  launchTerminal,
  listTerminalProfiles,
  listPtys,
  resizePty,
  spawnPty,
  syncPtyPane,
  transferPty,
  transferPtyProjection,
  writePty,
} from 'stuffbucket-electron/electron-terminal'
import { registerTerminalChannels } from 'stuffbucket-electron/host/terminal'

import { BrowserWindow, ipcMain } from 'electron'
import { z } from 'zod'

import { BRIDGE_CHANNELS } from '../shared/bridge-channels.js'
import type {
  TerminalPaneLayout,
  TerminalRedockRequest,
  TerminalWindowRequest,
} from '../shared/bridge-types.js'

const nonEmptyString = z.string().min(1)
const positiveInteger = z.number().int().positive()
const terminalId = z.object({ id: nonEmptyString })
const terminalSpawn = terminalId.extend({
  cols: positiveInteger,
  rows: positiveInteger,
  shell: z.string().optional(),
  cwd: z.string().optional(),
})
const terminalWrite = terminalId.extend({ data: z.string() })
const terminalResize = terminalId.extend({ cols: positiveInteger, rows: positiveInteger })
const terminalAck = terminalId.extend({ sequence: z.number().int().nonnegative() })
const terminalLaunchRequest = z.object({
  profileId: nonEmptyString,
  targetId: z.string().optional(),
  cols: positiveInteger,
  rows: positiveInteger,
})
const terminalPane: z.ZodType<TerminalPaneLayout> = z.lazy(() => z.union([
  z.object({ sessionId: nonEmptyString }),
  z.object({
    direction: z.enum(['right', 'down']),
    first: terminalPane,
    second: terminalPane,
  }),
]))
const terminalWindowRequest = terminalId.extend({
  cols: positiveInteger,
  rows: positiveInteger,
  x: z.number().finite(),
  y: z.number().finite(),
  title: nonEmptyString,
  canRunInBackground: z.boolean(),
  sessionIds: z.array(nonEmptyString).optional(),
  pane: terminalPane.optional(),
})
const terminalRedockRequest = terminalWindowRequest.extend({
  sourceFrameId: nonEmptyString,
  targetFrameId: nonEmptyString,
})
const terminalPaneSync = terminalId.extend({ pane: terminalPane })

interface TerminalWindowActions {
  undock(owner: BrowserWindow | undefined, request: TerminalWindowRequest): boolean
  copy(owner: BrowserWindow | undefined, request: TerminalWindowRequest): boolean
  redock(owner: BrowserWindow | undefined, request: TerminalRedockRequest): boolean
}

let terminalWindowActions: TerminalWindowActions = {
  undock: () => false,
  copy: () => false,
  redock: () => false,
}

const TERMINAL_CHANNELS = {
  spawn: BRIDGE_CHANNELS.terminalSpawn,
  write: BRIDGE_CHANNELS.terminalWrite,
  resize: BRIDGE_CHANNELS.terminalResize,
  ack: BRIDGE_CHANNELS.terminalAck,
  terminate: BRIDGE_CHANNELS.terminalTerminate,
  list: BRIDGE_CHANNELS.terminalList,
} as const

export function registerTerminalIpc(): void {
  ipcMain.handle(BRIDGE_CHANNELS.terminalFrameId, (event) =>
    String(BrowserWindow.fromWebContents(event.sender)?.id ?? ''),
  )
  ipcMain.handle(BRIDGE_CHANNELS.terminalUndock, (event, request: unknown) =>
    terminalWindowActions.undock(
      BrowserWindow.fromWebContents(event.sender) ?? undefined,
      terminalWindowRequest.parse(request),
    ),
  )
  ipcMain.handle(BRIDGE_CHANNELS.terminalCopy, (event, request: unknown) =>
    terminalWindowActions.copy(
      BrowserWindow.fromWebContents(event.sender) ?? undefined,
      terminalWindowRequest.parse(request),
    ),
  )
  ipcMain.handle(BRIDGE_CHANNELS.terminalRedock, (event, request: unknown) =>
    terminalWindowActions.redock(
      BrowserWindow.fromWebContents(event.sender) ?? undefined,
      terminalRedockRequest.parse(request),
    ),
  )
  ipcMain.handle(BRIDGE_CHANNELS.terminalPaneSync, (event, request: unknown) => {
    const parsed = terminalPaneSync.parse(request)
    syncPtyPane(BrowserWindow.fromWebContents(event.sender) ?? undefined, parsed.id, parsed.pane)
  })
  ipcMain.handle(BRIDGE_CHANNELS.terminalProfiles, (event) =>
    listTerminalProfiles(BrowserWindow.fromWebContents(event.sender) ?? undefined),
  )
  ipcMain.handle(BRIDGE_CHANNELS.terminalDiscover, (event) =>
    discoverTerminalTargets(BrowserWindow.fromWebContents(event.sender) ?? undefined),
  )
  ipcMain.handle(BRIDGE_CHANNELS.terminalLaunch, (event, request: unknown) =>
    launchTerminal(
      BrowserWindow.fromWebContents(event.sender) ?? undefined,
      terminalLaunchRequest.parse(request),
    ),
  )
  registerTerminalChannels(
    ipcMain,
    (event) => {
      const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined
      return {
        spawn: (request) => spawnPty(owner, terminalSpawn.parse(request)),
        write: (id, data) => {
          const request = terminalWrite.parse({ id, data })
          writePty(owner, request.id, request.data)
        },
        resize: (id, cols, rows) => {
          const request = terminalResize.parse({ id, cols, rows })
          resizePty(owner, request.id, request.cols, request.rows)
        },
        acknowledge: (id, sequence) => {
          const request = terminalAck.parse({ id, sequence })
          acknowledgePty(owner, request.id, request.sequence)
        },
        terminate: (id) => killPty(owner, terminalId.parse({ id }).id),
        list: () => listPtys(owner),
      }
    },
    { channels: TERMINAL_CHANNELS },
  )
}

export function configureTerminalHost(): void {
  configurePty({
    emit: (owner, id, data, sequence) => {
      if (!owner || owner.isDestroyed() || owner.webContents.isDestroyed()) return
      owner.webContents.send(BRIDGE_CHANNELS.terminalData, { id, data, sequence })
    },
    onExit: (owner, id, exitCode) => {
      if (!owner || owner.isDestroyed() || owner.webContents.isDestroyed()) return
      owner.webContents.send(BRIDGE_CHANNELS.terminalExit, { id, exitCode })
    },
    onStatus: () => undefined,
    onPane: (owner, id, pane, revision, origin: string) => {
      if (!owner || owner.isDestroyed() || owner.webContents.isDestroyed()) return
      owner.webContents.send(BRIDGE_CHANNELS.terminalPaneChanged, {
        id,
        pane,
        revision,
        origin,
      })
    },
  })
}

export function configureTerminalWindowActions(actions: TerminalWindowActions): void {
  terminalWindowActions = actions
}

export function moveTerminalSessions(
  owner: BrowserWindow | undefined,
  recipient: BrowserWindow | undefined,
  request: TerminalWindowRequest,
): boolean {
  const moved: string[] = []
  for (const id of request.sessionIds ?? [request.id]) {
    if (
      transferPtyProjection(owner, id, recipient, request.cols, request.rows)
      || transferPty(owner, recipient, { id, cols: request.cols, rows: request.rows })
    ) {
      moved.push(id)
      continue
    }
    for (const movedId of moved.reverse()) {
      transferPty(recipient, owner, {
        id: movedId,
        cols: request.cols,
        rows: request.rows,
      })
    }
    return false
  }
  return true
}

export function copyTerminalSessions(
  owner: BrowserWindow | undefined,
  recipient: BrowserWindow | undefined,
  request: TerminalWindowRequest,
): boolean {
  return (request.sessionIds ?? [request.id]).every((id) =>
    grantPtyProjection(owner, id, recipient, request.cols, request.rows)
    || copyPty(owner, recipient, { id, cols: request.cols, rows: request.rows }),
  )
}

export function stopTerminalHost(): void {
  killAllPtys()
}
import {
  acknowledgePty,
  configurePty,
  discoverTerminalTargets,
  killAllPtys,
  killPty,
  launchTerminal,
  listTerminalProfiles,
  listPtys,
  resizePty,
  spawnPty,
  writePty,
} from 'stuffbucket-electron/electron-terminal'
import { registerTerminalChannels } from 'stuffbucket-electron/host/terminal'

import { BrowserWindow, ipcMain } from 'electron'
import { z } from 'zod'

import { BRIDGE_CHANNELS } from '../shared/bridge-channels.js'

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

const TERMINAL_CHANNELS = {
  spawn: BRIDGE_CHANNELS.terminalSpawn,
  write: BRIDGE_CHANNELS.terminalWrite,
  resize: BRIDGE_CHANNELS.terminalResize,
  ack: BRIDGE_CHANNELS.terminalAck,
  terminate: BRIDGE_CHANNELS.terminalTerminate,
  list: BRIDGE_CHANNELS.terminalList,
} as const

export function registerTerminalIpc(): void {
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
    emit: (owner, id, data, sequence) =>
      owner.webContents.send(BRIDGE_CHANNELS.terminalData, { id, data, sequence }),
    onExit: (owner, id, exitCode) =>
      owner.webContents.send(BRIDGE_CHANNELS.terminalExit, { id, exitCode }),
    onStatus: () => undefined,
  })
}

export function stopTerminalHost(): void {
  killAllPtys()
}
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'

import { BRIDGE_CHANNELS } from '../shared/bridge-channels'

const {
  copyPty,
  grantPtyProjection,
  ipcHandlers,
  transferPty,
  transferPtyProjection,
} = vi.hoisted(() => ({
  copyPty: vi.fn(),
  grantPtyProjection: vi.fn(),
  ipcHandlers: new Map<string, (...args: unknown[]) => unknown>(),
  transferPty: vi.fn(),
  transferPtyProjection: vi.fn(),
}))

const owner = { id: 1, webContents: {} } as BrowserWindow
const recipient = { id: 2, webContents: {} } as BrowserWindow

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(() => owner),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, handler)
    }),
  },
}))

vi.mock('stuffbucket-electron/electron-terminal', () => ({
  acknowledgePty: vi.fn(),
  configurePty: vi.fn(),
  copyPty,
  discoverTerminalTargets: vi.fn(),
  grantPtyProjection,
  killAllPtys: vi.fn(),
  killPty: vi.fn(),
  launchTerminal: vi.fn(),
  listTerminalProfiles: vi.fn(),
  listPtys: vi.fn(),
  resizePty: vi.fn(),
  spawnPty: vi.fn(),
  syncPtyPane: vi.fn(),
  transferPty,
  transferPtyProjection,
  writePty: vi.fn(),
}))

vi.mock('stuffbucket-electron/host/terminal', () => ({
  registerTerminalChannels: vi.fn(),
}))

const {
  configureTerminalWindowActions,
  copyTerminalSessions,
  moveTerminalSessions,
  registerTerminalIpc,
} = await import('./terminal-host')

const request = {
  id: 'primary',
  cols: 120,
  rows: 40,
  x: 100,
  y: 200,
  title: 'Terminal',
  canRunInBackground: true,
  sessionIds: ['primary', 'split'],
}

describe('terminal host window actions', () => {
  beforeEach(() => {
    ipcHandlers.clear()
    copyPty.mockReset()
    grantPtyProjection.mockReset()
    transferPty.mockReset()
    transferPtyProjection.mockReset()
  })

  it('validates an undock request before dispatching it with the sender window', () => {
    const undock = vi.fn(() => true)
    configureTerminalWindowActions({
      undock,
      copy: vi.fn(() => false),
      redock: vi.fn(() => false),
    })
    registerTerminalIpc()

    const handler = ipcHandlers.get(BRIDGE_CHANNELS.terminalUndock)
    expect(handler?.({ sender: owner.webContents }, request)).toBe(true)
    expect(undock).toHaveBeenCalledWith(owner, request)
    expect(() => handler?.({ sender: owner.webContents }, {
      ...request,
      sessionIds: [''],
    })).toThrow()
  })

  it('moves projection and direct sessions as one window operation', () => {
    transferPtyProjection
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
    transferPty.mockReturnValue(true)

    expect(moveTerminalSessions(owner, recipient, request)).toBe(true)
    expect(transferPtyProjection).toHaveBeenNthCalledWith(
      1,
      owner,
      'primary',
      recipient,
      120,
      40,
    )
    expect(transferPty).toHaveBeenCalledWith(owner, recipient, {
      id: 'split',
      cols: 120,
      rows: 40,
    })
  })

  it('grants projection copies and falls back to direct PTY mirrors', () => {
    grantPtyProjection
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
    copyPty.mockReturnValue(true)

    expect(copyTerminalSessions(owner, recipient, request)).toBe(true)
    expect(copyPty).toHaveBeenCalledWith(owner, recipient, {
      id: 'split',
      cols: 120,
      rows: 40,
    })
  })
})

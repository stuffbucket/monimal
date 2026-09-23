import { describe, expect, it, vi } from 'vitest'

const { killAllPtys, listPtys, windows } = vi.hoisted(() => ({
  killAllPtys: vi.fn(),
  listPtys: vi.fn((_owner: unknown) => [] as unknown[]),
  windows: [] as object[],
}))

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(),
    getAllWindows: () => windows,
  },
  ipcMain: { handle: vi.fn() },
}))

vi.mock('stuffbucket-electron/electron-terminal', () => ({
  acknowledgePty: vi.fn(),
  configurePty: vi.fn(),
  discoverTerminalTargets: vi.fn(),
  killAllPtys,
  killPty: vi.fn(),
  launchTerminal: vi.fn(),
  listTerminalProfiles: vi.fn(),
  listPtys,
  resizePty: vi.fn(),
  spawnPty: vi.fn(),
  writePty: vi.fn(),
}))

vi.mock('stuffbucket-electron/host/terminal', () => ({
  registerTerminalChannels: vi.fn(),
}))

import { activeTerminalCount, stopTerminalHost } from './terminal-host.js'

describe('terminal host shutdown', () => {
  it('counts sessions owned by a hidden window as active', () => {
    const visibleWindow = { isVisible: () => true }
    const hiddenWindow = { isVisible: () => false }
    windows.push(visibleWindow, hiddenWindow)
    listPtys.mockImplementation((owner) =>
      owner === hiddenWindow ? [{ id: 'backgrounded' }] : [],
    )

    expect(activeTerminalCount()).toBe(1)
  })

  it('stops every terminal host during shutdown', () => {
    stopTerminalHost()

    expect(killAllPtys).toHaveBeenCalledOnce()
  })
})
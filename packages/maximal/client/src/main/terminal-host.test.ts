import type { BrowserWindow } from 'electron'
import { describe, expect, it, vi } from 'vitest'

const { configurePty } = vi.hoisted(() => ({
  configurePty: vi.fn(),
}))

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn(),
  },
}))

vi.mock('stuffbucket-electron/electron-terminal', () => ({
  acknowledgePty: vi.fn(),
  configurePty,
  discoverTerminalTargets: vi.fn(),
  killAllPtys: vi.fn(),
  killPty: vi.fn(),
  launchTerminal: vi.fn(),
  listTerminalProfiles: vi.fn(),
  listPtys: vi.fn(),
  resizePty: vi.fn(),
  spawnPty: vi.fn(),
  writePty: vi.fn(),
}))

vi.mock('stuffbucket-electron/host/terminal', () => ({
  registerTerminalChannels: vi.fn(),
}))

const { configureTerminalHost } = await import('./terminal-host')

describe('terminal host event delivery', () => {
  it('drops late events after their window owner has been released', () => {
    configureTerminalHost()
    const handlers = configurePty.mock.calls.at(-1)?.[0] as {
      emit(owner: BrowserWindow | undefined, id: string, data: string): void
      onExit(owner: BrowserWindow | undefined, id: string, exitCode: number): void
    }

    expect(() => handlers.emit(undefined, 'session', 'late output')).not.toThrow()
    expect(() => handlers.onExit(undefined, 'session', 0)).not.toThrow()
  })
})

import { describe, expect, it, vi } from 'vitest'
import type * as Terminal from '@maximal/maximal-terminal'
import type { TerminalDiagnosticRecord } from '@maximal/maximal-terminal'

const { configureTerminalDiagnostics, killAllPtys, listPtys, logWarn, windows } = vi.hoisted(() => ({
  configureTerminalDiagnostics: vi.fn<(
    enabled: boolean,
    sink: (record: TerminalDiagnosticRecord) => void
  ) => void>(),
  killAllPtys: vi.fn(),
  listPtys: vi.fn((_owner: unknown) => [] as unknown[]),
  logWarn: vi.fn(),
  windows: [] as object[],
}))

vi.mock('../main-logger.js', () => ({ mainLogger: { warn: logWarn } }))
vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(),
    getAllWindows: () => windows,
  },
  ipcMain: { handle: vi.fn() },
}))

vi.mock('@maximal/maximal-electron/electron-terminal', () => ({
  TERMINAL_SESSION_PREFIX: 'maximal',
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

vi.mock('@maximal/maximal-terminal', async (importOriginal) => ({
  ...(await importOriginal<typeof Terminal>()),
  configureTerminalDiagnostics,
  registerTerminalChannels: vi.fn(),
}))

import { activeTerminalCount, configureTerminalHost, stopTerminalHost } from './terminal.js'

const core = {
  terminalScopeIssue: vi.fn(),
  terminalScopeRevoke: vi.fn(),
}

describe('terminal host shutdown', () => {
  it('uses the application-resolved diagnostics setting', () => {
    configureTerminalHost({
      terminalDiagnostics: true,
      terminalSessionPrefix: 'maximal',
      terminalTmuxStatus: 'off',
    }, core)
    expect(configureTerminalDiagnostics).toHaveBeenLastCalledWith(true, expect.any(Function))
    const record: TerminalDiagnosticRecord = {
      component: 'pty-host', event: 'started', ownerId: 'owner-1',
      sessionId: 'session-1', sessionCount: 1, timestamp: 123,
      processId: 12, rss: 1024, heapUsed: 512,
    }
    configureTerminalDiagnostics.mock.lastCall?.[1](record)
    expect(logWarn).toHaveBeenCalledWith(record, 'Terminal lifecycle event')
    configureTerminalHost({
      terminalDiagnostics: false,
      terminalSessionPrefix: 'maximal',
      terminalTmuxStatus: 'off',
    }, core)
    expect(configureTerminalDiagnostics).toHaveBeenLastCalledWith(false, expect.any(Function))
  })
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
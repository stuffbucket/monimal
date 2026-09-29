import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Terminal from '@maximal/maximal-terminal'
import type { BrowserWindow } from 'electron'

import { BRIDGE_CHANNELS } from '../../shared/bridge-channels'

const {
  configurePty,
  discoverTerminalTargets,
  ipcHandlers,
  launchTerminal,
  logError,
  stagePtyOwnership,
} = vi.hoisted(() => ({
  configurePty: vi.fn(),
  discoverTerminalTargets: vi.fn(),
  ipcHandlers: new Map<string, (...args: unknown[]) => unknown>(),
  launchTerminal: vi.fn(),
  logError: vi.fn(),
  stagePtyOwnership: vi.fn(),
}))

const owner = {
  id: 1,
  isDestroyed: vi.fn(() => false),
  webContents: {
    isDestroyed: vi.fn(() => false),
    send: vi.fn(),
  },
} as unknown as BrowserWindow
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

vi.mock('@maximal/maximal-electron/electron-terminal', () => ({
  TERMINAL_SESSION_PREFIX: 'maximal',
  acknowledgePty: vi.fn(),
  configurePty,
  discoverTerminalTargets,
  killAllPtys: vi.fn(),
  killPty: vi.fn(),
  launchTerminal,
  listTerminalProfiles: vi.fn(),
  listPtys: vi.fn(),
  resizePty: vi.fn(),
  spawnPty: vi.fn(),
  stagePtyOwnership,
  syncPtyPane: vi.fn(),
  writePty: vi.fn(),
}))

vi.mock('../main-logger.js', () => ({
  mainLogger: {
    error: logError,
    warn: vi.fn(),
  },
}))

vi.mock('@maximal/maximal-terminal', async (importOriginal) => ({
  ...(await importOriginal<typeof Terminal>()),
  configureTerminalDiagnostics: vi.fn(),
  registerTerminalChannels: vi.fn(),
}))

const {
  configureTerminalHost,
  configureTerminalProjectTrust,
  configureTerminalWindowActions,
  copyTerminalSessions,
  moveTerminalSessions,
  registerTerminalIpc,
} = await import('./terminal')

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
const core = {
  terminalScopeIssue: vi.fn(async (input: {
    sessionId: string
    profileId: string
    application: string | null
  }) => ({
    ok: true as const,
    value: {
      ...input,
      credential: 'terminal-credential',
      expiresAt: '2026-09-29T00:00:00.000Z',
      environment: {},
    },
  })),
  terminalScopeRevoke: vi.fn(async (sessionId: string) => ({
    ok: true as const,
    value: { sessionId, revoked: true },
  })),
}

vi.mock('../sidecar/core.js', () => ({
  awaitProxyUrl: vi.fn(async () => 'http://127.0.0.1:4141'),
}))

describe('terminal host window actions', () => {
  for (const kind of ['output', 'exit'] as const) {
    for (const lifecycle of ['live', 'released', 'window-destroyed', 'contents-destroyed'] as const) {
      it(`${kind} delivery with ${lifecycle} owner`, () => {
        const delivered: Array<{ channel: string; payload: unknown }> = []
        const targetOwner = {
          isDestroyed: () => lifecycle === 'window-destroyed',
          webContents: {
            isDestroyed: () => lifecycle === 'contents-destroyed',
            send(channel: string, payload: unknown) {
              if (lifecycle !== 'live') throw new Error('Object has been destroyed')
              delivered.push({ channel, payload })
            },
          },
        }
        configureTerminalHost({
          terminalDiagnostics: false,
          terminalSessionPrefix: 'maximal',
          terminalTmuxStatus: 'off',
        }, core)
        type Owner = typeof targetOwner
        const handlers = configurePty.mock.calls.at(-1)![0] as {
          emit(owner: Owner | undefined, id: string, data: string, sequence: number): void
          onExit(owner: Owner | undefined, id: string, exitCode: number): void
        }
        const target = lifecycle === 'released' ? undefined : targetOwner
        expect(() => {
          if (kind === 'output') handlers.emit(target, 'session', 'ready', 7)
          else handlers.onExit(target, 'session', 0)
        }).not.toThrow()
        expect(delivered).toEqual(lifecycle === 'live' ? [{
          channel: kind === 'output' ? BRIDGE_CHANNELS.terminalData : BRIDGE_CHANNELS.terminalExit,
          payload: kind === 'output'
            ? { id: 'session', data: 'ready', sequence: 7 }
            : { id: 'session', exitCode: 0 },
        }] : [])
      })
    }
  }

  beforeEach(() => {
    ipcHandlers.clear()
    discoverTerminalTargets.mockReset()
    launchTerminal.mockReset()
    logError.mockReset()
    stagePtyOwnership.mockReset()
    configureTerminalProjectTrust(() => false)
  })

  it('validates an undock request before dispatching it with the sender window', () => {
    const undock = vi.fn(() => true)
    configureTerminalWindowActions({
      undock,
      copy: vi.fn(() => false),
      redock: vi.fn(() => false),
      syncMenu: vi.fn(),
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

  it('validates terminal menu entries before dispatching them with the sender window', () => {
    const syncMenu = vi.fn()
    configureTerminalWindowActions({
      undock: vi.fn(() => false),
      copy: vi.fn(() => false),
      redock: vi.fn(() => false),
      syncMenu,
    })
    registerTerminalIpc()

    const entries = [{
      id: 'primary',
      title: 'Build workspace',
      paneSessionIds: ['primary', 'split'],
    }]
    const handler = ipcHandlers.get(BRIDGE_CHANNELS.terminalMenuSync)
    expect(handler?.({ sender: owner.webContents }, entries)).toBeUndefined()
    expect(syncMenu).toHaveBeenCalledWith(owner, entries)
    expect(() => handler?.({ sender: owner.webContents }, [{
      ...entries[0],
      paneSessionIds: [],
    }])).toThrow()
  })

  it('logs terminal discovery and launch failures without terminal data', async () => {
    const discoveryError = new Error('private discovery details')
    const launchError = new TypeError('private launch details')
    discoverTerminalTargets.mockRejectedValue(discoveryError)
    launchTerminal.mockImplementation(() => { throw launchError })
    registerTerminalIpc()

    const discover = ipcHandlers.get(BRIDGE_CHANNELS.terminalDiscover)
    await expect(discover?.({ sender: owner.webContents })).rejects.toBe(discoveryError)
    const launch = ipcHandlers.get(BRIDGE_CHANNELS.terminalLaunch)
    expect(() => launch?.({ sender: owner.webContents }, {
      profileId: 'tmux',
      targetId: 'opaque',
      cols: 80,
      rows: 24,
    })).toThrow(launchError)

    expect(logError).toHaveBeenCalledWith(
      { errorName: 'Error' },
      'Terminal target discovery failed',
    )
    expect(logError).toHaveBeenCalledWith(
      { errorName: 'TypeError', profileId: 'tmux' },
      'Terminal launch failed',
    )
    expect(JSON.stringify(logError.mock.calls)).not.toContain('private')
    expect(JSON.stringify(logError.mock.calls)).not.toContain('opaque')
  })

  it('enforces project trust before launching with a working directory', () => {
    configureTerminalProjectTrust((path) => path === '/trusted/project')
    registerTerminalIpc()
    const launch = ipcHandlers.get(BRIDGE_CHANNELS.terminalLaunch)

    expect(() => launch?.({ sender: owner.webContents }, {
      profileId: 'local',
      cwd: '/untrusted/project',
      cols: 80,
      rows: 24,
    })).toThrow('The project folder is not trusted.')
    expect(launchTerminal).not.toHaveBeenCalled()

    launch?.({ sender: owner.webContents }, {
      profileId: 'local',
      cwd: '/trusted/project',
      cols: 80,
      rows: 24,
    })
    expect(launchTerminal).toHaveBeenCalledWith(owner, {
      profileId: 'local',
      cwd: '/trusted/project',
      cols: 80,
      rows: 24,
    })
  })

  it('configures tmux with the Maximal-owned session prefix', () => {
    configureTerminalHost({
      terminalDiagnostics: false,
      terminalSessionPrefix: 'maximal',
      terminalTmuxStatus: 'inherit',
    }, core)

    expect(configurePty).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.objectContaining({
        tmuxSessionPrefix: 'maximal',
        tmuxStatus: 'inherit',
      }),
    )
  })

  it('moves all sessions through one native ownership transaction', () => {
    const commit = vi.fn(() => true)
    stagePtyOwnership.mockReturnValue({ commit, rollback: vi.fn() })

    expect(moveTerminalSessions(owner, recipient, request)).toBe(true)
    expect(stagePtyOwnership).toHaveBeenCalledWith(
      owner,
      recipient,
      [
        { id: 'primary', cols: 120, rows: 40 },
        { id: 'split', cols: 120, rows: 40 },
      ],
      'move',
    )
    expect(commit).toHaveBeenCalledOnce()
  })

  it('reports a rejected ownership transaction', () => {
    stagePtyOwnership.mockReturnValue(undefined)

    expect(moveTerminalSessions(owner, recipient, request)).toBe(false)
  })

  describe('terminal host event delivery', () => {
    it('drops late events after their window owner has been released', () => {
      configureTerminalHost({
        terminalDiagnostics: false,
        terminalSessionPrefix: 'maximal',
        terminalTmuxStatus: 'off',
      }, core)
      const handlers = configurePty.mock.calls.at(-1)?.[0] as {
        emit(owner: BrowserWindow | undefined, id: string, data: string): void
        onExit(owner: BrowserWindow | undefined, id: string, exitCode: number): void
        onPane(owner: BrowserWindow | undefined, id: string, pane: unknown, revision: number, origin: string): void
      }

      expect(() => handlers.emit(undefined, 'session', 'late output')).not.toThrow()
      expect(() => handlers.onExit(undefined, 'session', 0)).not.toThrow()
      expect(() => handlers.onPane(undefined, 'session', {}, 1, 'late')).not.toThrow()
      expect(owner.webContents.send).not.toHaveBeenCalled()
    })
  })

  it('copies all sessions through one native ownership transaction', () => {
    const commit = vi.fn(() => true)
    stagePtyOwnership.mockReturnValue({ commit, rollback: vi.fn() })

    expect(copyTerminalSessions(owner, recipient, request)).toBe(true)
    expect(stagePtyOwnership).toHaveBeenCalledWith(
      owner,
      recipient,
      [
        { id: 'primary', cols: 120, rows: 40 },
        { id: 'split', cols: 120, rows: 40 },
      ],
      'copy',
    )
    expect(commit).toHaveBeenCalledOnce()
  })

  it('configures app-owned direct terminal profiles', () => {
    configureTerminalHost({
      terminalDiagnostics: false,
      terminalSessionPrefix: 'maximal',
      terminalTmuxStatus: 'off',
    }, core)

    const options = configurePty.mock.calls.at(-1)?.[1] as {
      tmuxSessionPrefix: string
      directProfiles: Terminal.DirectTerminalProfile[]
    }
    expect(options.tmuxSessionPrefix).toBe('maximal')
    expect(options.directProfiles.find(({ profile }) => profile.id === 'claude-code')).toMatchObject({
      profile: { id: 'claude-code', kind: 'command' },
      launch: { command: 'claude', args: [] },
    })
    expect(options.directProfiles.find(({ profile }) => profile.id === 'maximal')).toMatchObject({
      profile: { id: 'maximal', kind: 'command' },
      launch: { command: 'maximal', args: [] },
    })
  })

  it('prepares an isolated proxy environment for each local terminal session', async () => {
    configureTerminalHost({
      terminalDiagnostics: false,
      terminalSessionPrefix: 'maximal',
      terminalTmuxStatus: 'off',
    }, core)
    const options = configurePty.mock.calls.at(-1)?.[1] as {
      prepareSession(input: {
        sessionId: string
        profileId: string
        label: string
      }): Promise<Record<string, string>>
    }

    const environment = await options.prepareSession({
      sessionId: 'terminal-a',
      profileId: 'local',
      label: 'Local',
    })

    expect(core.terminalScopeIssue).toHaveBeenCalledWith({
      sessionId: 'terminal-a',
      profileId: 'local',
      application: null,
    })
    expect(environment).toEqual({
      MAXIMAL_TERMINAL_SESSION_ID: 'terminal-a',
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:4141',
      ANTHROPIC_AUTH_TOKEN: 'terminal-credential',
      OPENAI_BASE_URL: 'http://127.0.0.1:4141/v1',
      OPENAI_API_KEY: 'terminal-credential',
    })
  })

  it('uses the Maximal profile configurator environment returned by Core', async () => {
    core.terminalScopeIssue.mockResolvedValueOnce({
      ok: true,
      value: {
        sessionId: 'terminal-maximal',
        profileId: 'maximal',
        application: 'Maximal',
        credential: 'terminal-credential',
        expiresAt: '2026-09-29T00:00:00.000Z',
        environment: {
          MAXIMAL_CONFIGURATOR_MARKER: 'configured-by-core',
        },
      },
    })
    configureTerminalHost({
      terminalDiagnostics: false,
      terminalSessionPrefix: 'maximal',
      terminalTmuxStatus: 'off',
    }, core)
    const options = configurePty.mock.calls.at(-1)?.[1] as {
      prepareSession(input: {
        sessionId: string
        profileId: string
        label: string
      }): Promise<Record<string, string>>
    }

    const environment = await options.prepareSession({
      sessionId: 'terminal-maximal',
      profileId: 'maximal',
      label: 'Maximal',
    })

    expect(environment).toEqual({
      MAXIMAL_CONFIGURATOR_MARKER: 'configured-by-core',
    })
  })
})

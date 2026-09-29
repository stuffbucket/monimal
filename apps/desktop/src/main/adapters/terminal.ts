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
  stagePtyOwnership,
  syncPtyPane,
  writePty,
  type PtyOwnershipTransaction,
} from '@maximal/maximal-electron/electron-terminal'
import { configureTerminalDiagnostics, registerTerminalChannels } from '@maximal/maximal-terminal'

import { BrowserWindow, ipcMain } from 'electron'
import { z } from 'zod'

import { BRIDGE_CHANNELS } from '../../shared/bridge-channels.js'
import type {
  TerminalPaneLayout,
  TerminalRedockRequest,
  TerminalWindowRequest,
} from '@maximal/maximal-client/shared/host'
import { mainLogger } from '../main-logger.js'
import { awaitProxyUrl } from '../sidecar/core.js'
import type { CoreControlOperations } from './core-control-operations.js'
import { desktopTerminalProfiles } from './terminal-profiles.js'

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
  undock(
    owner: BrowserWindow | undefined,
    request: TerminalWindowRequest,
  ): boolean | Promise<boolean>
  copy(
    owner: BrowserWindow | undefined,
    request: TerminalWindowRequest,
  ): boolean | Promise<boolean>
  redock(
    owner: BrowserWindow | undefined,
    request: TerminalRedockRequest,
  ): boolean | Promise<boolean>
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

function terminalErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown'
}

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
  ipcMain.handle(BRIDGE_CHANNELS.terminalDiscover, async (event) => {
    try {
      return await discoverTerminalTargets(BrowserWindow.fromWebContents(event.sender) ?? undefined)
    } catch (error) {
      mainLogger.error({ errorName: terminalErrorName(error) }, 'Terminal target discovery failed')
      throw error
    }
  })
  ipcMain.handle(BRIDGE_CHANNELS.terminalLaunch, (event, request: unknown) => {
    const parsed = terminalLaunchRequest.parse(request)
    try {
      return launchTerminal(
        BrowserWindow.fromWebContents(event.sender) ?? undefined,
        parsed,
      )
    } catch (error) {
      mainLogger.error(
        { errorName: terminalErrorName(error), profileId: parsed.profileId },
        'Terminal launch failed',
      )
      throw error
    }
  })
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

const ROUTED_TERMINAL_PROFILES = new Set([
  'local',
  'claude-code',
  'copilot-cli',
  'codex',
  'maximal',
])

function applicationForProfile(profileId: string, label: string): string | null {
  return profileId === 'local' ? null : label
}

function proxyEnvironment(
  proxyUrl: string,
  credential: string,
  sessionId: string,
): Record<string, string> {
  const root = proxyUrl.replace(/\/+$/u, '')
  return {
    MAXIMAL_TERMINAL_SESSION_ID: sessionId,
    ANTHROPIC_BASE_URL: root,
    ANTHROPIC_AUTH_TOKEN: credential,
    OPENAI_BASE_URL: `${root}/v1`,
    OPENAI_API_KEY: credential,
  }
}

export function configureTerminalHost(
  settings: {
    terminalDiagnostics: boolean
    terminalSessionPrefix: string
    terminalTmuxStatus: 'off' | 'on' | 'inherit'
  },
  core: Pick<CoreControlOperations, 'terminalScopeIssue' | 'terminalScopeRevoke'>,
): void {
  configureTerminalDiagnostics(settings.terminalDiagnostics, (record) => {
    mainLogger.warn(record, 'Terminal lifecycle event')
  })
  configurePty({
    emit: (owner: BrowserWindow, id: string, data: string, sequence?: number) => {
      if (!owner || owner.isDestroyed() || owner.webContents.isDestroyed()) return
      owner.webContents.send(BRIDGE_CHANNELS.terminalData, { id, data, sequence })
    },
    onExit: (owner: BrowserWindow, id: string, exitCode: number) => {
      if (!owner || owner.isDestroyed() || owner.webContents.isDestroyed()) return
      owner.webContents.send(BRIDGE_CHANNELS.terminalExit, { id, exitCode })
    },
    onStatus: () => undefined,
    onPane: (
      owner: BrowserWindow,
      id: string,
      pane: TerminalPaneLayout,
      revision: number,
      origin: string,
    ) => {
      if (!owner || owner.isDestroyed() || owner.webContents.isDestroyed()) return
      owner.webContents.send(BRIDGE_CHANNELS.terminalPaneChanged, {
        id,
        pane,
        revision,
        origin,
      })
    },
  }, {
    tmuxSessionPrefix: settings.terminalSessionPrefix,
    directProfiles: desktopTerminalProfiles(),
    tmuxStatus: settings.terminalTmuxStatus,
    prepareSession: async ({ sessionId, profileId, label }) => {
      if (!ROUTED_TERMINAL_PROFILES.has(profileId)) return {}
      const [issued, proxyUrl] = await Promise.all([
        core.terminalScopeIssue({
          sessionId,
          profileId,
          application: applicationForProfile(profileId, label),
        }),
        awaitProxyUrl(),
      ])
      if (!issued.ok) throw new Error(issued.error.message)
      return proxyEnvironment(proxyUrl, issued.value.credential, sessionId)
    },
    releaseSession: async (sessionId) => {
      const revoked = await core.terminalScopeRevoke(sessionId)
      if (!revoked.ok) {
        mainLogger.warn(
          { sessionId, reason: revoked.error.reason },
          'Terminal proxy scope revocation failed',
        )
      }
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
  return stageTerminalSessions(owner, recipient, request, 'move')?.commit() ?? false
}

export function copyTerminalSessions(
  owner: BrowserWindow | undefined,
  recipient: BrowserWindow | undefined,
  request: TerminalWindowRequest,
): boolean {
  return stageTerminalSessions(owner, recipient, request, 'copy')?.commit() ?? false
}

export function stageTerminalSessions(
  owner: BrowserWindow | undefined,
  recipient: BrowserWindow | undefined,
  request: TerminalWindowRequest,
  mode: 'copy' | 'move',
): PtyOwnershipTransaction | undefined {
  return stagePtyOwnership(
    owner,
    recipient,
    (request.sessionIds ?? [request.id]).map((id) => ({
      id,
      cols: request.cols,
      rows: request.rows,
    })),
    mode,
  )
}

export function activeTerminalCount(): number {
  return BrowserWindow.getAllWindows()
    .reduce((count, window) => count + listPtys(window).length, 0)
}

export function stopTerminalHost(): void {
  killAllPtys()
}
import { createHostWindow, waitForHostWindowReady } from '@maximal/maximal-electron/host'
import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'

import { BRIDGE_CHANNELS } from '../../shared/bridge-channels.js'
import { mainLogger } from '../main-logger.js'

// Bound opaque renderer state without coupling the native host to board schemas.
export const PROJECTS_WINDOW_STATE_MAX_LENGTH = 1_048_576
const state = z.string().min(1).max(PROJECTS_WINDOW_STATE_MAX_LENGTH)
const frameId = z.string().trim().min(1)
const undockRequest = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  state,
})
const redockRequest = z.object({
  sourceFrameId: frameId,
  targetFrameId: frameId,
  state,
})

interface ProjectsWindowHostOptions {
  preloadPath: string
  workspaceWindow: () => BrowserWindow | null
  isRendererUrl: (url: string) => boolean
  loadRenderer: (window: BrowserWindow, query: URLSearchParams) => Promise<void>
  configureWindow: (window: BrowserWindow) => void
  focusWindow: (window: BrowserWindow) => void
  openWorkspaceSettings: () => void
}

interface DetachedProjectsWindow {
  window: BrowserWindow
  state: string
  ready: boolean
}

/** Owns only detached Projects windows; workspace and terminal lifecycles stay separate. */
export class ProjectsWindowHost {
  private readonly detached = new Map<string, DetachedProjectsWindow>()

  constructor(private readonly options: ProjectsWindowHostOptions) {}

  registerIpc(): void {
    ipcMain.handle(BRIDGE_CHANNELS.projectsUndockWindow, (event, request: unknown) =>
      this.undock(event, request))
    ipcMain.handle(BRIDGE_CHANNELS.projectsRedockWindow, (event, request: unknown) =>
      this.redock(event, request))
    ipcMain.handle(BRIDGE_CHANNELS.projectsWindowState, (event) => {
      const sender = this.authorizedSender(event)
      return sender ? this.detached.get(String(sender.id))?.state : undefined
    })
    ipcMain.handle(BRIDGE_CHANNELS.projectsOpenWorkspaceSettings, (event) => {
      const sender = this.authorizedSender(event)
      // Dedicated Projects windows delegate settings to the surviving workspace.
      if (!sender || !this.detached.get(String(sender.id))?.ready) {
        this.reject('Projects workspace settings rejected: unauthorized detached sender')
        throw new Error('Unauthorized Projects workspace settings sender')
      }
      this.options.openWorkspaceSettings()
    })
  }

  private knownWindow(id: string): BrowserWindow | undefined {
    const workspace = this.options.workspaceWindow()
    const window = workspace && String(workspace.id) === id
      ? workspace
      : this.detached.get(id)?.window
    return window && !window.isDestroyed() ? window : undefined
  }

  private trustedWindow(window: BrowserWindow): boolean {
    return !window.isDestroyed() && this.options.isRendererUrl(window.webContents.getURL())
  }

  private authorizedSender(event: IpcMainInvokeEvent): BrowserWindow | undefined {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || this.knownWindow(String(window.id)) !== window ||
      event.senderFrame !== event.sender.mainFrame ||
      !event.senderFrame || !this.options.isRendererUrl(event.senderFrame.url) ||
      !this.trustedWindow(window)) return undefined
    return window
  }

  private reject(message: string): false {
    mainLogger.warn(message)
    return false
  }

  private async undock(event: IpcMainInvokeEvent, input: unknown): Promise<boolean> {
    const parsed = undockRequest.safeParse(input)
    const owner = this.authorizedSender(event)
    if (!parsed.success || !owner) return this.reject('Projects window undock rejected: invalid request or sender')
    let window: BrowserWindow | undefined
    try {
      window = createHostWindow({
        preloadPath: this.options.preloadPath,
        title: 'Projects',
        titleBarStyle: 'hiddenInset',
        width: 1000,
        height: 700,
        x: parsed.data.x,
        y: parsed.data.y,
        showWhenReady: false,
        loadRenderer: () => undefined,
      })
      const entry = { window, state: parsed.data.state, ready: false }
      this.detached.set(String(window.id), entry)
      window.on('closed', () => this.detached.delete(String(entry.window.id)))
      this.options.configureWindow(window)
      const ready = waitForHostWindowReady(window)
      await this.options.loadRenderer(window, new URLSearchParams({ projectsWindow: 'true' }))
      if (!await ready || window.isDestroyed() || !this.trustedWindow(window) ||
        this.knownWindow(String(owner.id)) !== owner || !this.trustedWindow(owner)) {
        this.discard(window)
        return this.reject('Projects window undock failed: renderer or owner not ready')
      }
      entry.ready = true
      window.show()
      this.options.focusWindow(window)
      return true
    } catch (error: unknown) {
      if (window) this.discard(window)
      mainLogger.error(
        { errorName: error instanceof Error ? error.name : 'unknown' },
        'Projects window undock failed to load',
      )
      return false
    }
  }

  private discard(window: BrowserWindow): void {
    this.detached.delete(String(window.id))
    if (!window.isDestroyed()) window.destroy()
  }

  private redock(event: IpcMainInvokeEvent, input: unknown): boolean {
    const parsed = redockRequest.safeParse(input)
    const owner = this.authorizedSender(event)
    if (!parsed.success || !owner) return this.reject('Projects window redock rejected: invalid request or sender')
    const request = parsed.data
    const source = this.detached.get(request.sourceFrameId)
    const target = this.knownWindow(request.targetFrameId)
    // The receiving renderer owns the drop. Never close an unregistered source.
    if (!source?.ready || !target || target !== owner || source.window === target ||
      !this.trustedWindow(source.window) || !this.trustedWindow(target)) {
      return this.reject('Projects window redock rejected: unknown source or unauthorized target')
    }
    try {
      target.webContents.send(BRIDGE_CHANNELS.projectsWindowRedocked, request.state)
      this.detached.delete(request.sourceFrameId)
      source.window.close()
      this.options.focusWindow(target)
      return true
    } catch (error: unknown) {
      mainLogger.error(
        { errorName: error instanceof Error ? error.name : 'unknown' },
        'Projects window redock failed',
      )
      return false
    }
  }
}

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

import {
  app,
  BrowserWindow,
  Menu,
  nativeImage,
  Tray,
  type MenuItemConstructorOptions,
} from 'electron'
import { z } from 'zod'

import type { MenuBarModeAttempt, MenuBarModeState } from '@maximal/maximal-client/shared/host'
import type {
  TerminalMenuEntry,
  TerminalMenuFocusRequest,
} from '@maximal/maximal-client/shared/host'
import { readUserPreferences, updateUserPreferences } from '../preferences/user-preferences.js'
import { mainLogger } from '../main-logger.js'

const preferenceSchema = z.object({ menuBarOnly: z.boolean().default(false) })
const CONFIRMATION_MS = 15_000

interface PendingAttempt extends MenuBarModeAttempt {
  timer: NodeJS.Timeout
}

function trayIconPath(): string {
  const filename = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png'
  return app.isPackaged
    ? join(process.resourcesPath, 'tray', filename)
    : join(app.getAppPath(), 'resources', 'tray', filename)
}

async function readPreference(): Promise<boolean> {
  return preferenceSchema.parse(await readUserPreferences()).menuBarOnly
}

async function writePreference(menuBarOnly: boolean): Promise<void> {
  await updateUserPreferences({ menuBarOnly })
}

export class MenuBarModeController {
  private tray: Tray | null = null
  private enabled = false
  private confirmed = false
  private pending: PendingAttempt | null = null
  private dockHidden = false
  private readonly observedWindows = new WeakSet<BrowserWindow>()
  private readonly terminalMenus = new Map<BrowserWindow, TerminalMenuEntry[]>()
  private readonly onActivate: () => void
  private readonly onTerminalActivate: (
    win: BrowserWindow,
    request: TerminalMenuFocusRequest,
  ) => void

  constructor(
    onActivate: () => void,
    onTerminalActivate: (
      win: BrowserWindow,
      request: TerminalMenuFocusRequest,
    ) => void = () => undefined,
  ) {
    this.onActivate = onActivate
    this.onTerminalActivate = onTerminalActivate
  }

  state(): MenuBarModeState {
    return { enabled: this.enabled, pending: this.pending !== null }
  }

  keepsAlive(): boolean {
    return this.enabled && this.confirmed
  }

  async initialize(): Promise<void> {
    if (!(await readPreference())) return
    try {
      this.applyMenuBarOnly()
      this.confirmed = true
    } catch (error) {
      await writePreference(false)
      mainLogger.error(
        { errorName: error instanceof Error ? error.name : 'unknown' },
        'Could not restore menu-bar-only mode',
      )
    }
  }

  beginEnable(): MenuBarModeAttempt {
    this.revertPending()
    if (!this.enabled) this.applyMenuBarOnly()
    const attemptId = randomUUID()
    const deadlineMs = Date.now() + CONFIRMATION_MS
    const timer = setTimeout(() => this.revertPending(), CONFIRMATION_MS)
    this.pending = { attemptId, deadlineMs, timer }
    return { attemptId, deadlineMs }
  }

  async confirmEnable(attemptId: string): Promise<MenuBarModeState> {
    this.assertAttempt(attemptId)
    this.clearPending()
    try {
      await writePreference(true)
      if (!this.enabled) {
        await writePreference(false)
        throw new Error('Menu-bar-only confirmation was cancelled')
      }
      this.confirmed = true
      return this.state()
    } catch (error) {
      this.confirmed = false
      this.restoreNormalPresence()
      throw error
    }
  }

  cancelEnable(attemptId: string): MenuBarModeState {
    this.assertAttempt(attemptId)
    this.revertPending()
    return this.state()
  }

  async disable(): Promise<MenuBarModeState> {
    this.clearPending()
    this.restoreNormalPresence()
    this.confirmed = false
    await writePreference(false)
    return this.state()
  }

  applyToWindow(win: BrowserWindow): void {
    if (!this.observedWindows.has(win)) {
      this.observedWindows.add(win)
      win.on('closed', () => {
        this.terminalMenus.delete(win)
        this.updateTrayMenu()
        this.updateMacPresence()
      })
      if (process.platform === 'darwin') {
        win.on('show', () => this.updateMacPresence())
        win.on('restore', () => this.updateMacPresence())
        win.on('focus', () => this.updateMacPresence())
        win.on('hide', () => this.updateMacPresence())
        win.on('minimize', () => {
          if (!this.enabled) return
          win.hide()
          this.updateMacPresence()
        })
      }
    }
    if (process.platform !== 'darwin') {
      win.setSkipTaskbar(this.enabled)
      return
    }
    this.updateMacPresence()
  }

  syncTerminalMenu(win: BrowserWindow | undefined, entries: TerminalMenuEntry[]): void {
    if (!win || win.isDestroyed()) return
    this.terminalMenus.set(win, entries)
    this.updateTrayMenu()
  }

  cancelPending(): void {
    this.revertPending()
  }

  dispose(): void {
    this.clearPending()
    this.enabled = false
    this.showDock()
    this.tray?.destroy()
    this.tray = null
  }

  private assertAttempt(attemptId: string): void {
    if (this.pending?.attemptId !== attemptId) {
      throw new Error('Menu-bar-only confirmation is no longer active')
    }
  }

  private clearPending(): void {
    if (this.pending !== null) clearTimeout(this.pending.timer)
    this.pending = null
  }

  private revertPending(): void {
    if (this.pending === null && !this.enabled) return
    this.clearPending()
    if (!this.confirmed) this.restoreNormalPresence()
  }

  private applyMenuBarOnly(): void {
    this.ensureTray()
    this.enabled = true
    for (const win of BrowserWindow.getAllWindows()) this.applyToWindow(win)
    this.updateMacPresence()
  }

  private restoreNormalPresence(): void {
    this.enabled = false
    this.showDock()
    for (const win of BrowserWindow.getAllWindows()) win.setSkipTaskbar(false)
    this.tray?.destroy()
    this.tray = null
  }

  private updateMacPresence(): void {
    if (process.platform !== 'darwin') return
    const hasVisibleWindow = BrowserWindow.getAllWindows().some(
      (win) => !win.isDestroyed() && win.isVisible() && !win.isMinimized(),
    )
    if (this.enabled && !hasVisibleWindow) {
      if (this.dockHidden) return
      this.dockHidden = true
      void app.dock?.hide()
      return
    }
    this.showDock()
  }

  private showDock(): void {
    if (process.platform !== 'darwin' || !this.dockHidden) return
    this.dockHidden = false
    void app.dock?.show()
  }

  private ensureTray(): void {
    if (this.tray !== null) return
    const path = trayIconPath()
    if (!existsSync(path)) throw new Error(`Tray icon is missing at ${path}`)
    const image = nativeImage.createFromPath(path)
    if (image.isEmpty()) throw new Error(`Tray icon is unreadable at ${path}`)
    if (process.platform === 'darwin') image.setTemplateImage(true)
    const tray = new Tray(image)
    tray.setToolTip('Maximal')
    tray.on('click', this.onActivate)
    this.tray = tray
    this.updateTrayMenu()
  }

  private terminalMenuItems(): MenuItemConstructorOptions[] {
    const items: MenuItemConstructorOptions[] = []
    for (const [win, terminals] of this.terminalMenus) {
      if (win.isDestroyed()) continue
      for (const terminal of terminals) {
        const activate = (paneSessionId?: string): void => {
          this.onTerminalActivate(win, {
            id: terminal.id,
            ...(paneSessionId ? { paneSessionId } : {}),
          })
        }
        if (terminal.paneSessionIds.length <= 1) {
          items.push({ label: terminal.title, click: () => activate() })
          continue
        }
        items.push({
          label: terminal.title,
          submenu: [
            { label: 'Show Terminal', click: () => activate() },
            { type: 'separator' },
            ...terminal.paneSessionIds.map((sessionId, index) => ({
              label: `Split ${String(index + 1)}`,
              click: () => activate(sessionId),
            })),
          ],
        })
      }
    }
    return items
  }

  private updateTrayMenu(): void {
    if (this.tray === null) return
    const terminals = this.terminalMenuItems()
    this.tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open Maximal', click: this.onActivate },
      ...(terminals.length > 0
        ? [{ type: 'separator' as const }, ...terminals]
        : []),
      { type: 'separator' },
      { role: 'quit' },
    ]))
  }
}

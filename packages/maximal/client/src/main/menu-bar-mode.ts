import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

import { app, BrowserWindow, nativeImage, Tray } from 'electron'
import { z } from 'zod'

import type { MenuBarModeAttempt, MenuBarModeState } from '../shared/bridge-types.js'

const preferenceSchema = z.object({ menuBarOnly: z.boolean().default(false) })
const CONFIRMATION_MS = 15_000

interface PendingAttempt extends MenuBarModeAttempt {
  timer: NodeJS.Timeout
}

function preferencePath(): string {
  return join(app.getPath('userData'), 'preferences.json')
}

function trayIconPath(): string {
  const filename = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png'
  return app.isPackaged
    ? join(process.resourcesPath, 'tray', filename)
    : join(app.getAppPath(), 'resources', 'tray', filename)
}

async function readPreference(): Promise<boolean> {
  try {
    const raw = await readFile(preferencePath(), 'utf8')
    return preferenceSchema.parse(JSON.parse(raw)).menuBarOnly
  } catch {
    return false
  }
}

async function writePreference(menuBarOnly: boolean): Promise<void> {
  await writeFile(preferencePath(), `${JSON.stringify({ menuBarOnly }, undefined, 2)}\n`)
}

export class MenuBarModeController {
  private tray: Tray | null = null
  private enabled = false
  private confirmed = false
  private pending: PendingAttempt | null = null
  private readonly onActivate: () => void

  constructor(onActivate: () => void) {
    this.onActivate = onActivate
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
      console.error('[maximal-client] could not restore menu-bar-only mode:', error)
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
    win.setSkipTaskbar(this.enabled && process.platform !== 'darwin')
  }

  cancelPending(): void {
    this.revertPending()
  }

  dispose(): void {
    this.clearPending()
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
    if (process.platform === 'darwin') void app.dock?.hide()
  }

  private restoreNormalPresence(): void {
    this.enabled = false
    if (process.platform === 'darwin') void app.dock?.show()
    for (const win of BrowserWindow.getAllWindows()) win.setSkipTaskbar(false)
    this.tray?.destroy()
    this.tray = null
  }

  private ensureTray(): void {
    if (this.tray !== null) return
    const path = trayIconPath()
    if (!existsSync(path)) throw new Error(`Tray icon is missing at ${path}`)
    let image = nativeImage.createFromPath(path)
    if (image.isEmpty()) throw new Error(`Tray icon is unreadable at ${path}`)
    image = image.resize({ width: 18, height: 18 })
    if (process.platform === 'darwin') image.setTemplateImage(true)
    const tray = new Tray(image)
    tray.setToolTip('Maximal')
    tray.on('click', this.onActivate)
    this.tray = tray
  }
}

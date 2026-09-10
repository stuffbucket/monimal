/**
 * The application's identity to the operating system: its name, its menu, and
 * its dock icon.
 *
 * None of this is the window's `title`. On macOS the menu bar and the About
 * panel read `app.name`, and the dock reads an icon the OS resolves from the
 * bundle — so a window titled "Maximal" still sits under a menu bar reading
 * "Electron", which is what an unconfigured Electron app shows.
 *
 * The shell package solves the same problems for its own reference app, but
 * `tsconfig.host.json` compiles only `src/host/**`, so none of it reaches a
 * consumer. This is the client's own copy, deliberately small.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { app, Menu, nativeImage, shell, type MenuItemConstructorOptions } from 'electron'

import {
  SETTINGS_SECTIONS,
  type SettingsSectionId,
} from '../shared/settings-sections.js'

/** Where the runtime icon sits. Unpackaged only, because that is the only case
 *  this file sets an icon for — `scripts/gen-icon-png.mjs` writes it. */
function dockIconPath(): string {
  return join(app.getAppPath(), 'build', 'icon.png')
}

/**
 * Set the application name.
 *
 * MUST be called before `app.whenReady()`. `app.name` is read when the default
 * menu and the About panel are built, and setting it afterwards leaves both
 * showing whatever they were built with.
 */
export function applyAppName(name = 'Maximal'): void {
  app.setName(name)
}

/**
 * Point the dock at the application's own icon.
 *
 * Only meaningful unpackaged: a packaged bundle's icon comes from the `.icns`
 * the bundle carries, and calling this there would replace a correct icon with
 * a lower-resolution copy of itself. A missing file is left alone rather than
 * set — `nativeImage` returns an empty image for a path it cannot read, and
 * setting that clears the icon instead of restoring the default.
 */
export function applyDockIcon(): void {
  if (process.platform !== 'darwin' || app.dock === undefined) return
  if (app.isPackaged) return

  const path = dockIconPath()
  if (!existsSync(path)) {
    console.warn(`[maximal-client] no dock icon at ${path}; run gen-icon-png`)
    return
  }

  const image = nativeImage.createFromPath(path)
  if (image.isEmpty()) {
    console.warn(`[maximal-client] dock icon at ${path} is not a readable image`)
    return
  }

  app.dock.setIcon(image)
}

/**
 * What the menu can ask the application to do.
 *
 * A menu item cannot reach the renderer on its own, and main has no business
 * knowing what a settings surface is. So the template calls back, and
 * `main/index.ts` decides that the answer is a broadcast on a named channel.
 */
export interface MenuCallbacks {
  /** Ask the application's update owner to check for a new release. */
  onCheckForUpdates?: () => void
  /**
   * Show Settings.
   *
   * `sectionId` names a section to scroll to, or is `null` for the surface
   * itself with nothing in particular selected.
   */
  onOpenSettings?: (sectionId: SettingsSectionId | null) => void
}

/**
 * Install the application menu.
 *
 * Electron ships a default menu whose macOS application submenu is labelled
 * from the Electron binary, not from `app.name`. Replacing it is the only way
 * to get the product's name into the menu bar — and the submenu below is
 * labelled `app.name` rather than a literal, so the two can never disagree.
 *
 * Deliberately close to Electron's own default beyond that: standard roles
 * carry the platform's expected accelerators and behaviour, so Edit and Window
 * work without this file reimplementing copy, paste, or minimize.
 *
 * ## Settings by platform
 *
 * macOS groups product commands in the application submenu. Settings is a
 * flyout there, alongside an Actions flyout for the frequent Account and Apps
 * destinations. Elsewhere Settings remains its own top-level menu with the
 * platform accelerator. Both section lists come from
 * `shared/settings-sections.ts`, the same array the surface renders from, so a
 * menu entry cannot name a section that is not there.
 */
export function installApplicationMenu(callbacks: MenuCallbacks = {}): void {
  const isMac = process.platform === 'darwin'
  const { onCheckForUpdates, onOpenSettings } = callbacks

  const openSettings = (sectionId: SettingsSectionId | null) => () => {
    onOpenSettings?.(sectionId)
  }

  /* Enabled only when someone is listening. A menu item that reliably does
     nothing is worse than one that is visibly unavailable. */
  const settingsItem: MenuItemConstructorOptions = {
    label: 'Settings…',
    accelerator: 'CmdOrCtrl+,',
    enabled: onOpenSettings !== undefined,
    click: openSettings(null),
  }

  const sectionItems: MenuItemConstructorOptions[] = SETTINGS_SECTIONS.map(
    ({ id, label }) => ({
      label,
      enabled: onOpenSettings !== undefined,
      click: openSettings(id),
    }),
  )
  const actionsSubmenu: MenuItemConstructorOptions[] = [
    {
      label: 'Accounts',
      enabled: onOpenSettings !== undefined,
      click: openSettings('settings-account-heading'),
    },
    {
      label: 'Apps',
      enabled: onOpenSettings !== undefined,
      click: openSettings('settings-connections-heading'),
    },
  ]
  const settingsSubmenu: MenuItemConstructorOptions[] = [
    ...(isMac
      ? []
      : ([settingsItem, { type: 'separator' }] satisfies MenuItemConstructorOptions[])),
    { label: 'Open Section', submenu: sectionItems },
  ]

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              {
                label: `About ${app.name}`,
                click: () => app.showAboutPanel(),
              },
              {
                label: 'Check for Updates…',
                // No release feed exists yet. Keep the command honest until an
                // updater owner supplies the callback.
                enabled: onCheckForUpdates !== undefined,
                click: () => onCheckForUpdates?.(),
              },
              { type: 'separator' },
              { label: 'Settings', submenu: sectionItems },
              { label: 'Actions', submenu: actionsSubmenu },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ] satisfies MenuItemConstructorOptions[])
      : []),
    {
      label: 'File',
      submenu: [isMac ? { role: 'close' } : { role: 'quit' }],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    ...(!isMac
      ? [{ label: 'Settings', submenu: settingsSubmenu } satisfies MenuItemConstructorOptions]
      : []),
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'Learn More',
          click: () => void shell.openExternal('https://github.com/stuffbucket/maximal'),
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

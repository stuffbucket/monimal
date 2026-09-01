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
 */
export function installApplicationMenu(): void {
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: 'about' },
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

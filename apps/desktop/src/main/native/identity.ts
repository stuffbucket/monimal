/**
 * The application's identity to the operating system: its name, its menu, and
 * its dock icon.
 *
 * None of this is the window's `title`. On macOS the menu bar and the About
 * panel read `app.name`, and the dock reads an icon the OS resolves from the
 * bundle — so a window titled "Maximal" still sits under a menu bar reading
 * "Electron", which is what an unconfigured Electron app shows.
 *
 * The embeddable shell package does not own application identity. This is the
 * desktop client's implementation, deliberately small.
 */

import { app, Menu, shell, type MenuItemConstructorOptions } from 'electron'

import {
  SETTINGS_SECTIONS,
  type SettingsSectionId,
} from '@maximal/maximal-client/shared/settings-sections'

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
 * What the menu can ask the application to do.
 *
 * A menu item cannot reach the renderer on its own, and main has no business
 * knowing what a settings surface is. So the template calls back, and
 * `main/index.ts` decides that the answer is a broadcast on a named channel.
 */
export interface MenuCallbacks {
  /** Ask the application's update owner to check for a new release. */
  onCheckForUpdates?: () => void
  /** Show the bundled third-party licenses dialog. */
  onOpenLicenses?: () => void
  /**
   * Show Settings.
   *
   * `sectionId` names a section to scroll to, or is `null` for the surface
   * itself with nothing in particular selected.
   */
  onOpenSettings?: (sectionId: SettingsSectionId | null) => void
  /** Toggle an explicitly user-started recording of the main window. */
  onToggleRecording?: () => void
  /** Reveal the main-owned recordings directory in the system file manager. */
  onRevealRecordings?: () => void
  isRecording?: boolean
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
  const {
    onCheckForUpdates,
    onOpenLicenses,
    onOpenSettings,
    onRevealRecordings,
    onToggleRecording,
    isRecording,
  } = callbacks

  const openLicenses = () => () => {
    onOpenLicenses?.()
  }

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
  const licensesItem: MenuItemConstructorOptions = {
    label: 'Third Party Licenses',
    enabled: onOpenLicenses !== undefined,
    click: openLicenses(),
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
              licensesItem,
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
      submenu: [
        {
          label: isRecording ? 'Stop Window Recording' : 'Record Window…',
          enabled: onToggleRecording !== undefined,
          click: () => onToggleRecording?.(),
        },
        {
          label: 'Reveal Recordings Folder',
          enabled: onRevealRecordings !== undefined,
          click: () => onRevealRecordings?.(),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
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
        ...(!isMac ? [licensesItem] : []),
        {
          label: 'Learn More',
          click: () => void shell.openExternal('https://github.com/stuffbucket/maximal'),
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

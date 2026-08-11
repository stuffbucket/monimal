import {
  Menu,
  app,
  shell,
  type BrowserWindow,
  type MenuItemConstructorOptions,
} from 'electron';

import type { ViewId } from '../../shared/ipc.js';
import { isE2EQuiet } from './preferences.js';

/**
 * The application menu.
 *
 * It is the keyboard surface for everything the shell can do, and on macOS it
 * is also the only place some roles can live. Menu actions do not mutate the
 * renderer directly; they send a typed event, so the React shell stays the one
 * owner of view state.
 */

interface MenuCallbacks {
  onNavigate: (view: ViewId) => void;
  onTogglePanel: (panel: 'left' | 'right') => void;
  onCheckForUpdates: () => void;
  onOpenPreferences: () => void;
  /**
   * Reveal the local crash artifacts. Omitted where nothing writes them, so a
   * shell with no crash reporter has no item that opens an absent directory.
   * Issue #134.
   */
  onShowCrashReports?: () => void;
}

const REPO_URL = 'https://github.com/stuffbucket/maximal-electron';

function viewItems(callbacks: MenuCallbacks): MenuItemConstructorOptions[] {
  return [
    {
      label: 'Toggle Left Sidebar',
      accelerator: 'CmdOrCtrl+B',
      click: () => callbacks.onTogglePanel('left'),
    },
    {
      label: 'Toggle Right Panel',
      accelerator: 'CmdOrCtrl+Alt+B',
      click: () => callbacks.onTogglePanel('right'),
    },
    { type: 'separator' },
    {
      label: 'Go to Library',
      accelerator: 'CmdOrCtrl+1',
      click: () => callbacks.onNavigate('library'),
    },
    {
      label: 'Go to Recents',
      accelerator: 'CmdOrCtrl+2',
      click: () => callbacks.onNavigate('recents'),
    },
    {
      label: 'Go to Drafts',
      accelerator: 'CmdOrCtrl+3',
      click: () => callbacks.onNavigate('drafts'),
    },
    { type: 'separator' },
    { role: 'reload' },
    { role: 'toggleDevTools' },
    { type: 'separator' },
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  ];
}

export function buildApplicationMenu(callbacks: MenuCallbacks): Menu {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              {
                label: 'Check for Updates…',
                click: callbacks.onCheckForUpdates,
              },
              { type: 'separator' },
              {
                label: 'Settings…',
                accelerator: 'CmdOrCtrl+,',
                click: callbacks.onOpenPreferences,
              },
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
        ...(isMac
          ? []
          : ([
              {
                label: 'Settings…',
                accelerator: 'CmdOrCtrl+,',
                click: callbacks.onOpenPreferences,
              },
              {
                label: 'Check for Updates…',
                click: callbacks.onCheckForUpdates,
              },
              { type: 'separator' },
            ] satisfies MenuItemConstructorOptions[])),
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    { label: 'View', submenu: viewItems(callbacks) },
    {
      label: 'Window',
      submenu: isMac
        ? [
            { role: 'minimize' },
            { role: 'zoom' },
            { type: 'separator' },
            { role: 'front' },
          ]
        : [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Repository',
          click: () => {
            void shell.openExternal(REPO_URL);
          },
        },
        ...(callbacks.onShowCrashReports
          ? ([
              {
                label: 'Show Crash Reports',
                click: callbacks.onShowCrashReports,
              },
            ] satisfies MenuItemConstructorOptions[])
          : []),
        ...(isMac
          ? []
          : ([{ role: 'about' }] satisfies MenuItemConstructorOptions[])),
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

export function installApplicationMenu(callbacks: MenuCallbacks): void {
  Menu.setApplicationMenu(buildApplicationMenu(callbacks));
}

/** Focus or restore the main window. Shared by the tray and `second-instance`. */
export function focusWindow(window: BrowserWindow | undefined): void {
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  if (!window.isVisible()) window.show();
  // A quiet run must not take the keyboard out of whatever the developer is
  // doing. Playwright dispatches input through the debugger, so nothing under
  // test needs this window to be key.
  if (isE2EQuiet()) return;
  window.focus();
}

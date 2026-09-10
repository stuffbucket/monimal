import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { BrowserWindow } from 'electron';
import { app, dialog } from 'electron';

import { RUN_MAIN_OPTIONS_VERSION, runMain } from '../host/run-main.js';
import { registerIpcHandlers, sendEvent } from './ipc.js';
import { focusWindow, installApplicationMenu } from './native/menu.js';
import { applyDockIcon } from './native/app-icon.js';
import { clearBadge } from './native/notifications.js';
import {
  getPreferences,
  isDemo,
  isE2E,
  isE2EQuiet,
  onPreferencesChanged,
  quietBounds,
} from './native/preferences.js';
import { configurePty, killAllPtys } from './native/pty.js';
import { showCrashReports, startCrashReports } from './native/crash-reports.js';
import { selfCheckRequested } from './native/self-check.js';
import { runSelfCheck } from './self-check.js';
import { destroyTray, setTrayEnabled } from './native/tray.js';
import { checkForUpdates } from './native/updates.js';
import { mainWindowOptions } from './windows/main-window.js';
import { closeSplashWindow, createSplashWindow } from './windows/splash.js';

/*
 * Pick the profile before anything else touches it.
 *
 * It is applied before the single instance lock, because the lock is derived
 * from the profile directory. Two builds pointing at the same directory are
 * the same application as far as Chromium is concerned, and the second one to
 * start will not get a window.
 *
 * - Under test: a throwaway directory, so a run never clobbers a developer's
 *   real preferences.
 * - In demo mode: a sibling directory that persists. The demo shell is a
 *   different application with different data, and giving it its own profile
 *   means `npm start` and `STUFFBUCKET_DEMO=1 npm start` can run side by side.
 *   They could not before, and the failure was silent: the second process took
 *   no lock, quit, and asked the first to come forward, so a developer saw a
 *   clean build and a window that was not the one they had just asked for.
 */
function profileDirectory(): string | undefined {
  if (isE2E()) return mkdtempSync(path.join(tmpdir(), 'stuffbucket-e2e-'));
  if (isDemo()) return `${app.getPath('userData')}-demo`;
  return undefined;
}

let mainWindow: BrowserWindow | undefined;
let activate: () => void = () => undefined;

/* ------------------------------------------------------------ dock state */

/**
 * Show or hide the dock icon (macOS only).
 *
 * The rule the product wants:
 *
 * - A window is open, so the application is a normal foreground app. Dock icon
 *   visible.
 * - The menu bar icon is enabled and the last window closed. The application
 *   keeps running as a menu bar accessory. Pull the dock icon out, so it stops
 *   occupying a dock slot for a window that is not there.
 *
 * `app.dock.hide()` also removes the application from the Command-Tab switcher,
 * which is the correct behaviour for an accessory. Reopening a window calls
 * `show()` again.
 *
 * Windows and Linux have no equivalent, and `app.dock` is undefined there, so
 * every call is guarded.
 */
function setDockVisible(visible: boolean): void {
  if (process.platform !== 'darwin' || !app.dock) return;
  // A quiet run must not put an icon in the developer's dock, once per
  // scenario. Nothing under test asserts dock visibility.
  if (visible && isE2EQuiet()) return;
  if (visible) void app.dock.show();
  else app.dock.hide();
}

/* ---------------------------------------------------------------- windows */

/**
 * Bring the application forward, with the surviving window when there is one.
 *
 * `runMain` opens a replacement when there is none, and `onWindowCreated` runs
 * for it. Focus is deferred to that path because `app.dock.show()` resolves
 * asynchronously, so focusing before the window paints can bring the
 * application forward without taking key status.
 */
let focusNextWindow = false;

function onActivate(window: BrowserWindow | undefined): void {
  setDockVisible(true);
  if (window) {
    focusWindow(window);
    return;
  }
  focusNextWindow = true;
}

function wireWindow(window: BrowserWindow): void {
  mainWindow = window;

  window.once('ready-to-show', () => {
    closeSplashWindow();
    // A quiet test run parks the window off screen rather than hiding it, so
    // layout, visibility, and the renderer behave exactly as in production.
    if (isE2EQuiet()) window.setBounds(quietBounds(window.getBounds()));
    window.show();
    if (focusNextWindow) {
      focusNextWindow = false;
      focusWindow(window);
    }
  });

  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined;
  });
}

/* --------------------------------------------------------------- updates */

async function runUpdateCheck(): Promise<void> {
  sendEvent(mainWindow, 'update:status', { state: 'checking' });
  sendEvent(mainWindow, 'update:status', await checkForUpdates());
}

/* ------------------------------------------------------------- bootstrap */

function bootstrap(): void {
  const prefs = getPreferences();

  // An unpackaged run shows Electron's own dock icon until this call. A
  // packaged build already carries the bundle icon; this keeps the two the
  // same when `STUFFBUCKET_ICON_DIR` overrides it.
  applyDockIcon(process.platform);

  registerIpcHandlers();

  // Terminal output is pushed, not polled, so the pty layer needs a way to
  // reach a window. It has no Electron import of its own, and it addresses the
  // window that owns the session rather than whichever one is current.
  configurePty({
    emit: (owner, id, data, sequence) => sendEvent(owner, 'pty:data', { id, data, sequence }),
    onExit: (owner, id, exitCode) => sendEvent(owner, 'pty:exit', { id, exitCode }),
    onStatus: (owner, status) => sendEvent(owner, 'pty:status', status),
  });

  installApplicationMenu({
    onNavigate: (view) => {
      activate();
      sendEvent(mainWindow, 'menu:navigate', { view });
    },
    onTogglePanel: (panel) => {
      activate();
      sendEvent(mainWindow, 'menu:toggle-panel', { panel });
    },
    onCheckForUpdates: () => void runUpdateCheck(),
    onOpenPreferences: () => activate(),
    onShowCrashReports: showCrashReports,
  });

  // The tray is a plain click target: it activates the application.
  setTrayEnabled(prefs.menuBarIcon, process.platform, activate);

  // Preferences are the single source of truth, so react to a change from any
  // origin rather than only from the settings panel.
  onPreferencesChanged((next) => {
    setTrayEnabled(next.menuBarIcon, process.platform, activate);
    sendEvent(mainWindow, 'prefs:changed', next);
  });
}

async function shouldQuitAfterLastWindow(): Promise<boolean> {
  const prefs = getPreferences();
  if (prefs.menuBarIcon) return false;
  if (prefs.quitOnLastWindowClosed) return true;

  const result = await dialog.showMessageBox({
    type: 'question',
    title: 'Stop Maximal?',
    message: 'Stop Maximal?',
    detail:
      'Maximal and all of its processes will stop. Keep running leaves the application open without a window.',
    buttons: ['Keep Running', 'Stop Maximal'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  return result.response === 1;
}

function shutdown(): void {
  killAllPtys();
  clearBadge();
  destroyTray();
  closeSplashWindow();
}

/* ------------------------------------------------------------- lifecycle */

/*
 * Crash artifacts, before the branch below rather than inside it.
 *
 * Crashpad derives its database from the profile directory at the moment it
 * starts, so the profile is chosen here and `runMain` is handed the same one.
 * It sits above the branch because the self-check paths never reach `runMain`,
 * and those are the runs that crash on purpose. Issue #134.
 */
const userDataDirectory = profileDirectory();
if (userDataDirectory !== undefined) app.setPath('userData', userDataDirectory);
startCrashReports();

if (selfCheckRequested(process.argv)) {
  /*
   * The packaged smoke test, ahead of `runMain` because `runMain` takes the
   * single instance lock. An instance the developer already has open would
   * otherwise turn a mistyped flag into an activation and an exit code of 0,
   * which is a green run of a check that launched nothing. Issue #89.
   */
  runSelfCheck(process.argv);
} else {
  void runMain(
    { app },
    {
      version: RUN_MAIN_OPTIONS_VERSION,
      userDataDirectory,
      shouldQuitAfterLastWindow,
      window: mainWindowOptions,
      onReady: (context) => {
        activate = context.activate;
        if (getPreferences().splash) createSplashWindow();
        bootstrap();
      },
      onActivate,
      onWindowCreated: wireWindow,
      // With the menu bar icon on, closing the last window is not a quit. The
      // application keeps running, and the dock icon comes out of the dock.
      onWindowAllClosed: () => {
        if (getPreferences().menuBarIcon) setDockVisible(false);
      },
      beforeShutdown: shutdown,
    },
  );
}

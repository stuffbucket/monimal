import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { BrowserWindow, app, globalShortcut } from 'electron';

import { RUN_MAIN_OPTIONS_VERSION, runMain } from '../host/run-main.js';
import { registerIpcHandlers, sendEvent } from './ipc.js';
import { focusWindow, installApplicationMenu } from './native/menu.js';
import { applyDockIcon } from './native/app-icon.js';
import { clearBadge } from './native/notifications.js';
import { isAgentBusy, shutdownAgent } from './native/agent.js';
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
import { llamaCheckRequested } from './native/llama-protocol.js';
import { selfCheckRequested } from './native/self-check.js';
import { runLlamaCheck } from './llama-check.js';
import { runSelfCheck } from './self-check.js';
import { destroyTray, setTrayEnabled } from './native/tray.js';
import { checkForUpdates } from './native/updates.js';
import { mainWindowOptions } from './windows/main-window.js';
import { destroyOverlay, toggleOverlay } from './windows/overlay.js';
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

function hasOpenWindow(): boolean {
  return BrowserWindow.getAllWindows().some((window) => !window.isDestroyed());
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

/* --------------------------------------------------------------- overlay */

let boundHotkey: string | undefined;

/**
 * Bind the summon accelerator.
 *
 * `globalShortcut.register` returns false when another application already
 * owns the combination. Report that rather than leaving the user with a key
 * that silently does nothing.
 */
function bindOverlayHotkey(accelerator: string): void {
  if (boundHotkey === accelerator) return;

  if (boundHotkey) globalShortcut.unregister(boundHotkey);
  boundHotkey = undefined;

  if (!accelerator) return;

  try {
    if (globalShortcut.register(accelerator, toggleOverlay)) {
      boundHotkey = accelerator;
    } else {
      console.error(
        `Overlay hotkey "${accelerator}" is already taken by another application.`,
      );
    }
  } catch (error) {
    // An malformed accelerator throws rather than returning false.
    console.error(`Overlay hotkey "${accelerator}" is not valid:`, error);
  }
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
    emit: (owner, id, data) => sendEvent(owner, 'pty:data', { id, data }),
    onExit: (owner, id, exitCode) => sendEvent(owner, 'pty:exit', { id, exitCode }),
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

  bindOverlayHotkey(prefs.overlayHotkey);

  // Preferences are the single source of truth, so react to a change from any
  // origin rather than only from the settings panel.
  onPreferencesChanged((next) => {
    setTrayEnabled(next.menuBarIcon, process.platform, activate);
    bindOverlayHotkey(next.overlayHotkey);
    // Turning the menu bar icon off while no window is open would otherwise
    // strand the application with no way to reach it.
    if (!next.menuBarIcon && !hasOpenWindow()) activate();
    sendEvent(mainWindow, 'prefs:changed', next);
  });
}

/**
 * Release everything the application owns.
 *
 * The embedded model runs native work on a worker thread. If the Node
 * environment is torn down while any of it is outstanding, the addon completes
 * into an environment that no longer exists, calls `ThrowAsJavaScriptException`
 * against it, and the process aborts inside ggml's terminate handler.
 *
 * Returning the promise is what defers the quit rather than firing cleanup and
 * hoping. The crash lands after the last assertion of a test, so the suite
 * stayed green through four consecutive runs of it.
 */
function shutdown(): Promise<void> | undefined {
  // Kill every shell first. A surviving child would outlive the application.
  killAllPtys();
  globalShortcut.unregisterAll();
  destroyOverlay();
  clearBadge();
  destroyTray();
  closeSplashWindow();

  if (!isAgentBusy()) return undefined;
  return shutdownAgent();
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
} else if (llamaCheckRequested(process.argv)) {
  // The other half of the same idea: load the packaged llama.cpp out of
  // process and survive it aborting. Issue #133.
  runLlamaCheck();
} else {
  void runMain(
    { app },
    {
      version: RUN_MAIN_OPTIONS_VERSION,
      userDataDirectory,
      keepRunningWithoutWindows: () => getPreferences().menuBarIcon,
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

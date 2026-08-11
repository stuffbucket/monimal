import { existsSync } from 'node:fs';
import path from 'node:path';

import type { BrowserWindow } from 'electron';

import type { HostWindowOptions } from '../../host/host-window.js';
import { windowIcon } from '../native/app-icon.js';
import { isDemo } from '../native/preferences.js';

/**
 * The main application window, as options for the shell's own host window.
 *
 * The title bar is hidden on macOS (`hiddenInset`) and overlaid on Windows, so
 * the React shell can draw its own toolbar into that strip. The system draws
 * the window controls: native traffic lights on macOS, `titleBarOverlay`
 * elsewhere. Nothing in the renderer draws or drives them.
 *
 * `index.ts` hands these to `runMain`, which opens the window. The reveal stays
 * here: a quiet test run parks the window off screen first, and bounds have to
 * be set before it shows.
 */
export function mainWindowOptions(): HostWindowOptions {
  return {
    preloadPath: path.join(__dirname, 'preload.js'),
    // `checkForUpdate` is deliberately absent. This build has no update
    // channel, so `update:check` only ever answers `unsupported`, and a
    // capability that is present and useless is what feature detection is for.
    bridge: { capabilities: ['openExternal', 'versions'] },
    title: 'Stuffbucket',
    width: 1280,
    height: 820,
    minWidth: 880,
    minHeight: 560,
    backgroundColor: '#16181d',
    // Windows and Linux draw the taskbar and window icon from the window.
    // macOS uses the bundle, so `windowIcon` returns nothing there.
    icon: windowIcon(process.platform),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    // Windows and Linux draw the system controls over our toolbar.
    ...(process.platform === 'darwin'
      ? {}
      : {
          titleBarOverlay: {
            color: '#16181d',
            symbolColor: '#e6e8ec',
            height: 40,
          },
        }),
    trafficLightPosition: { x: 14, y: 13 },
    showWhenReady: false,
    loadRenderer,
  };
}

function loadRenderer(window: BrowserWindow): void {
  if (isDemo()) {
    loadDemoShell(window);
    return;
  }

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    // Development only. The upstream Forge template opens DevTools in packaged
    // builds too, which ships a debugger to users.
    window.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  void window.loadFile(
    path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
  );
}

/**
 * Load the capture fixture instead of the product.
 *
 * `STUFFBUCKET_DEMO=1` selects it. It is a separate renderer bundle, and
 * `forge.config.ts` keeps that bundle out of the package, so this is reachable
 * from a checkout and not from an installed application. Failing loudly here
 * beats `loadFile` rejecting into a discarded promise, which leaves a blank
 * window that looks like a hang.
 */
function loadDemoShell(window: BrowserWindow): void {
  if (DEMO_WINDOW_VITE_DEV_SERVER_URL) {
    void window.loadURL(DEMO_WINDOW_VITE_DEV_SERVER_URL);
    window.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  const page = path.join(
    __dirname,
    `../renderer/${DEMO_WINDOW_VITE_NAME}/index.html`,
  );
  if (!existsSync(page)) {
    throw new Error(
      `STUFFBUCKET_DEMO is set, but the capture fixture is not in this build. ` +
        `It is excluded from the package on purpose. Run it from a checkout: ` +
        `npm run package && STUFFBUCKET_DEMO=1 npm start`,
    );
  }
  void window.loadFile(page);
}

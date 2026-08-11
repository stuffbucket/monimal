import path from 'node:path';

import { BrowserWindow } from 'electron';

/**
 * Pre-boot splash, modeled on `stuffbucket/maximal`'s `shell/splash.html`.
 *
 * The window is frameless, transparent, and always on top, so it reads as a
 * floating card rather than a window. It is fully self-contained HTML with
 * inline CSS: at first paint there is no guarantee a stylesheet or font has
 * loaded.
 *
 * Lifecycle: `create` opens it, the main window's `ready-to-show` calls
 * `close`. `close` is safe to call twice, and a timeout closes it regardless,
 * so a missed signal never strands the splash on screen.
 */

const MAX_LIFETIME_MS = 10_000;

let splash: BrowserWindow | undefined;
let killTimer: NodeJS.Timeout | undefined;

export function createSplashWindow(): BrowserWindow {
  splash = new BrowserWindow({
    width: 360,
    height: 220,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    center: true,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    // The splash renders static markup and needs no bridge at all.
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  // The splash is a second entry point of the renderer build. In development
  // it comes from the Vite dev server; when packaged it sits next to the
  // shell's index.html.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void splash.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}/splash.html`);
  } else {
    void splash.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/splash.html`),
    );
  }

  splash.once('ready-to-show', () => splash?.show());

  // Belt and braces: never let the splash outlive the boot.
  killTimer = setTimeout(closeSplashWindow, MAX_LIFETIME_MS);

  splash.on('closed', () => {
    splash = undefined;
  });

  return splash;
}

export function closeSplashWindow(): void {
  if (killTimer) {
    clearTimeout(killTimer);
    killTimer = undefined;
  }
  if (splash && !splash.isDestroyed()) splash.close();
  splash = undefined;
}

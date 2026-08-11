import path from 'node:path';

import { app, nativeImage, type NativeImage } from 'electron';

import { dockIconName, iconDirectory, windowIconName } from './icons.js';

/**
 * The application icon: the macOS dock, and the Windows and Linux taskbar.
 *
 * A packaged application takes it from the bundle — `Info.plist` on macOS, an
 * embedded resource in the exe on Windows — which `forge.config.ts` sets from
 * the same directory this module reads. So this covers what packaging cannot:
 *
 * - An unpackaged `npm start` on macOS shows **Electron's** dock icon. Nothing
 *   about packaging changes that, and `app.dock.setIcon` is the only way to see
 *   a different one before a build. A stock icon during development is not a
 *   defect.
 * - Windows and Linux draw the window and taskbar icon from the window itself,
 *   so `BrowserWindow` needs an image as well as the exe.
 *
 * There is no channel for this. The renderer cannot name an icon: a path from
 * the renderer loaded as an image is an arbitrary file read, and the icon is a
 * host decision rather than a document one. See `docs/architecture.md`.
 */

function iconFile(name: string): string {
  const directory = iconDirectory({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    // `__dirname` is `.vite/build` in a checkout.
    sourceDir: path.join(__dirname, '../../build/icons'),
    override: process.env['STUFFBUCKET_ICON_DIR'],
  });
  return path.join(directory, name);
}

/**
 * Load one icon, or nothing.
 *
 * `nativeImage.createFromPath` returns an empty image for a missing or
 * unreadable file rather than throwing. Handing that to `setIcon` clears the
 * icon, so an empty image is treated as no icon at all and the platform default
 * stands. Naming the path it looked at is what turns a wrong
 * `STUFFBUCKET_ICON_DIR` from a mystery into a typo.
 */
function loadIcon(name: string): NativeImage | undefined {
  const file = iconFile(name);
  const image = nativeImage.createFromPath(file);
  if (!image.isEmpty()) return image;
  console.error(`No icon at ${file}. Falling back to the platform default.`);
  return undefined;
}

/** The tray or menu bar image. `undefined` when the file is missing. */
export function trayIcon(name: string): NativeImage | undefined {
  return loadIcon(name);
}

/** Image for `BrowserWindow.icon`. macOS ignores it and uses the bundle. */
export function windowIcon(platform: NodeJS.Platform): NativeImage | undefined {
  const name = windowIconName(platform);
  return name === undefined ? undefined : loadIcon(name);
}

/** Put the icon in the macOS dock. Windows and Linux have no equivalent. */
export function applyDockIcon(platform: NodeJS.Platform): void {
  const name = dockIconName(platform);
  if (name === undefined || !app.dock) return;
  const image = loadIcon(name);
  if (image) app.dock.setIcon(image);
}

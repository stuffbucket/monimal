/**
 * Where the icon files live, what they are called, and which one a platform
 * takes.
 *
 * A consumer swaps the whole set by pointing `STUFFBUCKET_ICON_DIR` at a
 * directory of their own. `forge.config.ts` reads the same variable, so one
 * value brands both the packaged bundle and the running process.
 *
 * Free of `electron`, so the resolution is unit and mutation tested rather than
 * trusted. The caller supplies the facts; this decides.
 */

/** Full colour, used for the dock, the taskbar, and the window. */
export const APP_ICON = 'icon.png';

/** The coloured Tauri menu-bar icon, used without system tinting. */
export const TRAY_ICON = 'tray.png';

export interface IconSource {
  /** `app.isPackaged`. */
  packaged: boolean;
  /** `process.resourcesPath`. */
  resourcesPath: string;
  /** The checked-in icons, for a run from a checkout. */
  sourceDir: string;
  /** `STUFFBUCKET_ICON_DIR`, when the host process sets it. */
  override?: string | undefined;
}

/**
 * The directory to load run-time icons from.
 *
 * The override wins in both modes. That is what makes `npm start` on macOS show
 * a consumer's icon in the dock, which packaging alone cannot do: an unpackaged
 * run has no bundle, so the dock shows Electron's own icon until something
 * calls `app.dock.setIcon`.
 *
 * The environment belongs to whoever launched the process, which is the same
 * trust level as the binary itself. Nothing in the renderer reaches this.
 */
export function iconDirectory(source: IconSource): string {
  if (source.override) return source.override;
  return source.packaged ? source.resourcesPath : source.sourceDir;
}

/**
 * The image for `BrowserWindow.icon`, or nothing.
 *
 * macOS ignores that option and reads the application bundle, so an image there
 * is loaded and discarded. Windows and Linux draw the window and taskbar icon
 * from the window itself.
 */
export function windowIconName(platform: NodeJS.Platform): string | undefined {
  return platform === 'darwin' ? undefined : APP_ICON;
}

/** The dock image, or nothing. Only macOS has a dock. */
export function dockIconName(platform: NodeJS.Platform): string | undefined {
  return platform === 'darwin' ? APP_ICON : undefined;
}

/**
 * The tray image, and whether the system recolours it.
 *
 * The retired Tauri shell used the same coloured icon on every platform.
 * `nativeImage` picks up the `@2x` variant beside it on retina displays.
 */
export function trayIconChoice(_platform: NodeJS.Platform): {
  name: string;
  template: boolean;
} {
  return { name: TRAY_ICON, template: false };
}

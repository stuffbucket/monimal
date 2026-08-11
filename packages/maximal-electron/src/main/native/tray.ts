import { Tray } from 'electron';

import { trayIcon } from './app-icon.js';
import { trayIconChoice } from './icons.js';

/**
 * The menu bar (macOS) or tray (Windows and Linux) icon.
 *
 * It is a **plain click target**, not a menu. One click brings the application
 * to the foreground. There is no context menu, because everything the menu
 * would offer already lives in the application menu and the window itself.
 *
 * This follows `stuffbucket/wiggle`, which runs menu-bar-first with no dock
 * icon at all. The difference here: the icon is optional, and the application
 * is a document window rather than an overlay, so it keeps a dock presence
 * while a window is open.
 *
 * macOS needs a `*Template` image, so the system recolours it for light and
 * dark menu bars. Windows and Linux need a full-colour image.
 */

let tray: Tray | undefined;

export function setTrayEnabled(
  enabled: boolean,
  platform: NodeJS.Platform,
  onActivate: () => void,
): void {
  if (!enabled) {
    destroyTray();
    return;
  }
  if (tray) return;

  const choice = trayIconChoice(platform);
  const image = trayIcon(choice.name);
  // An icon directory without a tray image gets no tray. An empty click target
  // carrying only a tooltip is worse than none. `trayIcon` says which file.
  if (!image) return;
  if (choice.template) image.setTemplateImage(true);

  tray = new Tray(image);
  tray.setToolTip('Stuffbucket');

  // No `setContextMenu`. A context menu would swallow the left click on
  // Windows and Linux, and the whole point of this icon is the click.
  tray.on('click', onActivate);

  // Right click is the platform habit for a tray menu. With no menu to show,
  // treat it the same as a left click rather than doing nothing.
  tray.on('right-click', onActivate);
}

export function destroyTray(): void {
  tray?.destroy();
  tray = undefined;
}

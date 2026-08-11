import { Notification, app } from 'electron';

import type { NotifyRequest } from '../../shared/ipc.js';

import { getPreferences } from './preferences.js';

/**
 * Native notifications, plus the dock and taskbar cues that go with them.
 *
 * macOS refuses to show a notification from an unsigned development build in
 * some configurations. `Notification.isSupported()` still returns true there,
 * so a missing banner during `npm start` is expected rather than a defect.
 */
export function showNotification(request: NotifyRequest): void {
  if (Notification.isSupported()) {
    new Notification({ title: request.title, body: request.body }).show();
  }

  if (!request.urgent) return;

  if (process.platform === 'darwin') {
    // `critical` keeps bouncing until the application is focused.
    app.dock?.bounce('informational');
  }
}

/**
 * Reflect a count on the macOS dock badge, and on the Linux launcher where the
 * desktop environment supports it. Windows uses an overlay icon, which needs a
 * rendered image; that is left as an extension point.
 */
export function setBadgeCount(count: number): void {
  if (!getPreferences().dockBadge) {
    app.setBadgeCount(0);
    return;
  }
  app.setBadgeCount(Math.max(0, Math.trunc(count)));
}

/** Clear dock and taskbar state. Call on quit so nothing is left behind. */
export function clearBadge(): void {
  app.setBadgeCount(0);
}

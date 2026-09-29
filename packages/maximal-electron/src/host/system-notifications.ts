import {
  Notification,
  shell,
  type NotificationConstructorOptions,
} from 'electron';

export interface SystemNotificationStatus {
  supported: boolean;
  canOpenSettings: boolean;
}

const MACOS_NOTIFICATION_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.Notifications-Settings.extension';

/** Report notification availability without prompting or displaying anything. */
export function getSystemNotificationStatus(
  platform: NodeJS.Platform = process.platform,
): SystemNotificationStatus {
  return {
    supported: Notification.isSupported(),
    canOpenSettings: platform === 'darwin',
  };
}

/** Display a native notification from Electron's main process. */
export function showSystemNotification(
  options: NotificationConstructorOptions,
): Notification {
  if (!Notification.isSupported()) {
    throw new Error('System notifications are not supported on this platform.');
  }
  const notification = new Notification(options);
  notification.show();
  return notification;
}

/** Open the operating system's notification permission settings on macOS. */
export async function openSystemNotificationSettings(
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  if (platform !== 'darwin') {
    throw new Error(
      'Opening system notification settings is only supported on macOS.',
    );
  }
  await shell.openExternal(MACOS_NOTIFICATION_SETTINGS_URL);
}

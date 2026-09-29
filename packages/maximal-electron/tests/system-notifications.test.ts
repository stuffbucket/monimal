import { beforeEach, describe, expect, it, vi } from 'vitest';

const { isSupported, openExternal, show } = vi.hoisted(() => ({
  isSupported: vi.fn(),
  openExternal: vi.fn(() => Promise.resolve()),
  show: vi.fn(),
}));

vi.mock('electron', () => ({
  Notification: class {
    static isSupported = isSupported;

    constructor(readonly options: Electron.NotificationConstructorOptions) {}

    show(): void {
      show(this.options);
    }
  },
  shell: { openExternal },
}));

import {
  getSystemNotificationStatus,
  openSystemNotificationSettings,
  showSystemNotification,
} from '../src/host/system-notifications.js';

beforeEach(() => {
  isSupported.mockReset();
  isSupported.mockReturnValue(true);
  openExternal.mockClear();
  show.mockClear();
});

describe('system notifications', () => {
  it('uses Electron support and reports the macOS settings capability separately', () => {
    expect(getSystemNotificationStatus('darwin')).toEqual({
      supported: true,
      canOpenSettings: true,
    });

    isSupported.mockReturnValue(false);
    expect(getSystemNotificationStatus('win32')).toEqual({
      supported: false,
      canOpenSettings: false,
    });
  });

  it('shows and returns an Electron notification', () => {
    const notification = showSystemNotification({
      title: 'Finished',
      body: 'Task complete',
    });

    expect(notification).toBeDefined();
    expect(show).toHaveBeenCalledWith({
      title: 'Finished',
      body: 'Task complete',
    });
  });

  it('rejects display when Electron does not support notifications', () => {
    isSupported.mockReturnValue(false);

    expect(() => showSystemNotification({ title: 'Finished' })).toThrow(
      'System notifications are not supported on this platform.',
    );
    expect(show).not.toHaveBeenCalled();
  });

  it('uses Electron shell to open the macOS notification settings pane', async () => {
    await openSystemNotificationSettings('darwin');

    expect(openExternal).toHaveBeenCalledWith(
      'x-apple.systempreferences:com.apple.Notifications-Settings.extension',
    );
  });

  it('rejects the settings action on other platforms', async () => {
    await expect(openSystemNotificationSettings('win32')).rejects.toThrow(
      'Opening system notification settings is only supported on macOS.',
    );
    expect(openExternal).not.toHaveBeenCalled();
  });
});

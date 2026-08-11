import { describe, expect, it, vi } from 'vitest';

import type { MenuItemConstructorOptions } from 'electron';

/**
 * The application menu, read as the template it builds.
 *
 * `Menu.buildFromTemplate` needs a real Electron runtime, so the mock hands
 * the template back and the assertions read that. The template is the part
 * this repository decides; what Electron makes of it is Electron's.
 */

vi.mock('electron', () => ({
  app: { name: 'Stuffbucket' },
  shell: { openExternal: vi.fn() },
  Menu: {
    buildFromTemplate: (template: MenuItemConstructorOptions[]) => template,
    setApplicationMenu: vi.fn(),
  },
}));

vi.mock('../src/main/native/preferences.js', () => ({ isE2EQuiet: () => false }));

const { buildApplicationMenu } = await import('../src/main/native/menu.js');

const callbacks = {
  onNavigate: vi.fn(),
  onTogglePanel: vi.fn(),
  onCheckForUpdates: vi.fn(),
  onOpenPreferences: vi.fn(),
};

function helpItems(
  extra: { onShowCrashReports?: () => void } = {},
): MenuItemConstructorOptions[] {
  const template = buildApplicationMenu({
    ...callbacks,
    ...extra,
  }) as unknown as MenuItemConstructorOptions[];
  const help = template.find((item) => item.role === 'help');
  return (help?.submenu ?? []) as MenuItemConstructorOptions[];
}

describe('the help menu', () => {
  it('finds a help submenu at all, so the assertions below run over something', () => {
    expect(helpItems().length).toBeGreaterThan(0);
  });

  it('offers the crash reports when something writes them', () => {
    // The only route a local minidump has while nothing is uploaded: a user
    // opens the directory and attaches the file. Issue #134.
    const onShowCrashReports = vi.fn();
    const item = helpItems({ onShowCrashReports }).find(
      (entry) => entry.label === 'Show Crash Reports',
    );
    expect(item).toBeDefined();

    (item?.click as () => void)();
    expect(onShowCrashReports).toHaveBeenCalledOnce();
  });

  it('omits it when nothing does', () => {
    // A consumer embedding this shell without `collectCrashDumps` would
    // otherwise get an item that opens a directory Crashpad never made.
    expect(helpItems().map((entry) => entry.label)).not.toContain('Show Crash Reports');
  });
});

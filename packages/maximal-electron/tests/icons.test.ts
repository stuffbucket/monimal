import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { RUNTIME_ICONS, bundleIcon } from '../scripts/package-contract.mjs';
import {
  APP_ICON,
  TRAY_ICON,
  dockIconName,
  iconDirectory,
  trayIconChoice,
  windowIconName,
} from '../src/main/native/icons.js';

const source = {
  packaged: false,
  resourcesPath: '/Applications/Stuffbucket.app/Contents/Resources',
  sourceDir: '/checkout/build/icons',
};

/**
 * Every platform this repository builds for.
 *
 * The point of the table is that a run on any one host answers for all three.
 * The three functions below read a parameter, so darwin, win32 and linux are
 * all decided on whatever machine runs the suite. Before #49 they read
 * `process.platform`, and a macOS run therefore exercised one branch of each.
 */
const PLATFORMS: NodeJS.Platform[] = ['darwin', 'win32', 'linux'];

describe('iconDirectory', () => {
  it('reads a checkout from the source directory', () => {
    expect(iconDirectory(source)).toBe('/checkout/build/icons');
  });

  it('reads a packaged application from beside the asar', () => {
    expect(iconDirectory({ ...source, packaged: true })).toBe(
      '/Applications/Stuffbucket.app/Contents/Resources',
    );
  });

  it('prefers the override in a checkout', () => {
    expect(iconDirectory({ ...source, override: '/brand/icons' })).toBe(
      '/brand/icons',
    );
  });

  it('prefers the override in a packaged application', () => {
    expect(
      iconDirectory({ ...source, packaged: true, override: '/brand/icons' }),
    ).toBe('/brand/icons');
  });

  it('ignores an override set to an empty string', () => {
    // An unset environment variable reads as undefined, but a shell that
    // exports it empty must not send the lookup to the process working
    // directory.
    expect(iconDirectory({ ...source, override: '' })).toBe('/checkout/build/icons');
  });
});

describe('icon names', () => {
  it('names the files the generator writes', () => {
    expect([APP_ICON, TRAY_ICON]).toEqual(['icon.png', 'tray.png']);
  });

  it('ships the exact Maximal application and menu-bar icons', () => {
    const icons = path.resolve(__dirname, '../build/icons');
    const hashes = ['icon.png', 'icon.icns', 'icon.ico', 'tray.png', 'tray@2x.png'].map((name) =>
      createHash('sha256')
        .update(readFileSync(path.join(icons, name)))
        .digest('hex'),
    );

    expect(hashes).toEqual([
      '94eaf9c82d35b6a52a4040c9140731434a3e8e407106600a5760005b7fc7e11c',
      'fa5bab40895459e33d49d39ae809d222d7a7cbd12ee6b8e5d59705803cf662b9',
      'de5afc08a32087c506279a28b98238defcafc3c78b44ae07f063a3734c688da1',
      '5a2776c21de25c32bc3778e55a7a95eb43f831ca965c6066cb3a23b40038366c',
      '1c48ddd8931bf20c3ae5294555a41deb2d684158d5c149d2f38c12ec5075923e',
    ]);
    expect(RUNTIME_ICONS).toEqual(['icon.png', 'tray.png', 'tray@2x.png']);
  });
});

describe('the platform table', () => {
  it('holds every platform the decisions below are asserted over', () => {
    // A table that shrank to one entry would leave every `it.each` under it
    // passing over a single branch, which is the state #49 was filed about.
    expect(PLATFORMS).toEqual(['darwin', 'win32', 'linux']);
  });
});

describe('windowIconName', () => {
  it('gives macOS nothing, because the bundle carries it', () => {
    expect(windowIconName('darwin')).toBeUndefined();
  });

  it.each(['win32', 'linux'] as const)(
    'gives %s the full colour icon for its taskbar',
    (platform) => {
      expect(windowIconName(platform)).toBe(APP_ICON);
    },
  );
});

describe('dockIconName', () => {
  it('gives macOS the full colour icon', () => {
    expect(dockIconName('darwin')).toBe(APP_ICON);
  });

  it.each(['win32', 'linux'] as const)('gives %s nothing, having no dock', (platform) => {
    expect(dockIconName(platform)).toBeUndefined();
  });
});

describe('trayIconChoice', () => {
  it('gives macOS the coloured Tauri image without system tinting', () => {
    expect(trayIconChoice('darwin')).toEqual({
      name: TRAY_ICON,
      template: false,
    });
  });

  it.each(['win32', 'linux'] as const)(
    'gives %s the full colour image, unrecoloured',
    (platform) => {
      expect(trayIconChoice(platform)).toEqual({ name: TRAY_ICON, template: false });
    },
  );

  it('never names a file outside the shipped set', () => {
    const names = PLATFORMS.map((platform) => trayIconChoice(platform).name);
    expect(names).toHaveLength(PLATFORMS.length);
    for (const name of names) expect(name).toBe(TRAY_ICON);
  });
});

describe('bundleIcon', () => {
  // `forge.config.ts` reads this and then checks the file exists, so the
  // `win32` answer has run in `package (windows-latest)` since it was written.
  // What has never been checked anywhere is which name each platform gets.
  it.each([
    ['darwin', 'icon.icns'],
    ['win32', 'icon.ico'],
    ['linux', 'icon.png'],
  ])('gives a %s build %s', (platform, file) => {
    expect(bundleIcon(platform)).toBe(file);
  });

  it('falls back to the png for a platform it has no format for', () => {
    expect(bundleIcon('freebsd')).toBe('icon.png');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_ICON, TRAY_ICON, TRAY_TEMPLATE_ICON } from '../src/main/native/icons.js';

/**
 * What the icon layer asks Electron for, on each platform.
 *
 * `icons.ts` decides the file name and is mutation tested. This is the other
 * half: that the decision reaches `nativeImage`, `app.dock` and `Tray` at all,
 * and reaches them for a platform the host is not running. Issue #49 — the work
 * in #46 was verified on darwin-arm64, so the taskbar icon and the full-colour
 * tray image had never been loaded anywhere.
 *
 * Electron is mocked because `nativeImage` and `Tray` need a real Electron
 * runtime. What is asserted is the request, which is the part this repository
 * decides; what Electron draws is Electron's.
 */

const ICON_DIR = '/brand/icons';

const electron = vi.hoisted(() => ({
  /** Paths `nativeImage.createFromPath` answers with a non-empty image. */
  present: new Set<string>(),
  /** Every path asked for, in order. */
  requested: [] as string[],
  setIcon: vi.fn(),
  /** `app.dock` is absent on Windows and Linux, and Electron types it so. */
  hasDock: true,
  trays: [] as { path: string; template: boolean }[],
  destroy: vi.fn(),
}));

interface FakeImage {
  path: string;
  template: boolean;
  isEmpty: () => boolean;
  setTemplateImage: (value: boolean) => void;
}

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    get dock() {
      return electron.hasDock ? { setIcon: electron.setIcon } : undefined;
    },
  },
  nativeImage: {
    createFromPath: (file: string): FakeImage => {
      electron.requested.push(file);
      const image: FakeImage = {
        path: file,
        template: false,
        isEmpty: () => !electron.present.has(file),
        setTemplateImage: (value: boolean) => {
          image.template = value;
        },
      };
      return image;
    },
  },
  Tray: class Tray {
    constructor(image: FakeImage) {
      electron.trays.push({ path: image.path, template: image.template });
    }
    setToolTip() {}
    on() {}
    destroy() {
      electron.destroy();
    }
  },
}));

const { applyDockIcon, windowIcon } = await import('../src/main/native/app-icon.js');
const { destroyTray, setTrayEnabled } = await import('../src/main/native/tray.js');

const at = (name: string) => `${ICON_DIR}/${name}`;

/** Every platform the branches answer for. */
const PLATFORMS: NodeJS.Platform[] = ['darwin', 'win32', 'linux'];

let errors: string[] = [];

beforeEach(() => {
  vi.stubEnv('STUFFBUCKET_ICON_DIR', ICON_DIR);
  // A complete icon directory. A test that wants a missing file deletes one.
  electron.present = new Set([APP_ICON, TRAY_ICON, TRAY_TEMPLATE_ICON].map(at));
  electron.requested = [];
  electron.trays = [];
  electron.hasDock = true;
  electron.setIcon.mockClear();
  electron.destroy.mockClear();
  errors = [];
  vi.spyOn(console, 'error').mockImplementation((message: string) => {
    errors.push(message);
  });
  // `tray.ts` holds the tray in module state, and the suite runs in a random
  // order. Without this a later test inherits an earlier test's tray and
  // returns before it decides anything. See docs/testing.md.
  destroyTray();
});

afterEach(() => {
  destroyTray();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('the platform table', () => {
  it('holds every platform the assertions below run over', () => {
    expect(PLATFORMS).toEqual(['darwin', 'win32', 'linux']);
  });
});

describe('windowIcon', () => {
  it('loads nothing at all on macOS, which reads the bundle', () => {
    expect(windowIcon('darwin')).toBeUndefined();
    // Not merely "returns undefined": a load that happened and was discarded
    // would read the disk on every window open for nothing.
    expect(electron.requested).toEqual([]);
  });

  it.each(['win32', 'linux'] as const)('loads the taskbar icon on %s', (platform) => {
    const image = windowIcon(platform);
    expect(image).toBeDefined();
    expect(electron.requested).toEqual([at(APP_ICON)]);
  });

  it('gives up rather than clearing the icon when the file is missing', () => {
    // `createFromPath` answers a missing file with an empty image, and handing
    // that to Electron clears the icon instead of leaving the default.
    electron.present.delete(at(APP_ICON));
    expect(windowIcon('win32')).toBeUndefined();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(at(APP_ICON));
  });
});

describe('applyDockIcon', () => {
  it('sets the dock icon on macOS', () => {
    applyDockIcon('darwin');
    expect(electron.requested).toEqual([at(APP_ICON)]);
    expect(electron.setIcon).toHaveBeenCalledOnce();
    expect(electron.setIcon.mock.calls[0]?.[0]).toMatchObject({ path: at(APP_ICON) });
  });

  it.each(['win32', 'linux'] as const)('does nothing on %s, which has no dock', (platform) => {
    applyDockIcon(platform);
    expect(electron.requested).toEqual([]);
    expect(electron.setIcon).not.toHaveBeenCalled();
  });

  it('leaves the platform default when the file is missing', () => {
    electron.present.delete(at(APP_ICON));
    applyDockIcon('darwin');
    expect(electron.setIcon).not.toHaveBeenCalled();
    expect(errors[0]).toContain(at(APP_ICON));
  });

  it('survives a darwin build with no dock object', () => {
    // `app.dock` is optional in Electron's own types.
    electron.hasDock = false;
    expect(() => applyDockIcon('darwin')).not.toThrow();
    expect(electron.requested).toEqual([]);
  });
});

describe('setTrayEnabled', () => {
  it('takes the alpha-only image on macOS, and marks it a template', () => {
    setTrayEnabled(true, 'darwin', vi.fn());
    expect(electron.requested).toEqual([at(TRAY_TEMPLATE_ICON)]);
    expect(electron.trays).toEqual([{ path: at(TRAY_TEMPLATE_ICON), template: true }]);
  });

  it.each(['win32', 'linux'] as const)(
    'takes the full colour image on %s, unrecoloured',
    (platform) => {
      setTrayEnabled(true, platform, vi.fn());
      expect(electron.requested).toEqual([at(TRAY_ICON)]);
      expect(electron.trays).toEqual([{ path: at(TRAY_ICON), template: false }]);
    },
  );

  it.each(PLATFORMS)('builds no tray at all on %s when the image is missing', (platform) => {
    electron.present.clear();
    setTrayEnabled(true, platform, vi.fn());
    expect(electron.trays).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  it.each(PLATFORMS)('destroys the tray on %s when the preference goes off', (platform) => {
    setTrayEnabled(true, platform, vi.fn());
    expect(electron.trays).toHaveLength(1);
    setTrayEnabled(false, platform, vi.fn());
    expect(electron.destroy).toHaveBeenCalledOnce();
  });
});

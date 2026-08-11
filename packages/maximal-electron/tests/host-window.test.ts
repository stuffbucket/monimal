import { beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
  constructorOptions: [] as unknown[],
  openExternal: vi.fn(),
  openHandler: undefined as ((details: { url: string }) => { action: string }) | undefined,
  navigateHandler: undefined as
    | ((event: { preventDefault: () => void }, url: string) => void)
    | undefined,
  onceHandler: undefined as (() => void) | undefined,
  show: vi.fn(),
}));

vi.mock('electron', () => ({
  BrowserWindow: class BrowserWindow {
    webContents = {
      getURL: () => 'https://shell.example/workspace',
      setWindowOpenHandler: (
        handler: (details: { url: string }) => { action: string },
      ) => {
        electron.openHandler = handler;
      },
      on: (
        event: string,
        handler: (event: { preventDefault: () => void }, url: string) => void,
      ) => {
        if (event === 'will-navigate') electron.navigateHandler = handler;
      },
    };

    constructor(options: unknown) {
      electron.constructorOptions.push(options);
    }

    once(event: string, handler: () => void) {
      if (event === 'ready-to-show') electron.onceHandler = handler;
    }

    show() {
      electron.show();
    }
  },
  shell: { openExternal: electron.openExternal },
}));

import { createHostWindow } from '../src/host/host-window.js';

describe('createHostWindow', () => {
  beforeEach(() => {
    electron.constructorOptions.length = 0;
    electron.openExternal.mockReset();
    electron.show.mockReset();
    electron.openHandler = undefined;
    electron.navigateHandler = undefined;
    electron.onceHandler = undefined;
  });

  it('passes optional window chrome and size constraints to BrowserWindow', () => {
    const loadRenderer = vi.fn();
    const titleBarOverlay = { color: '#112233', symbolColor: '#ffffff', height: 42 };
    const trafficLightPosition = { x: 12, y: 10 };

    createHostWindow({
      preloadPath: '/absolute/preload.js',
      title: 'Consumer',
      width: 1200,
      height: 800,
      minWidth: 720,
      minHeight: 480,
      backgroundColor: '#112233',
      icon: '/brand/icon.png',
      titleBarStyle: 'hiddenInset',
      titleBarOverlay,
      trafficLightPosition,
      loadRenderer,
    });

    expect(electron.constructorOptions).toEqual([
      expect.objectContaining({
        width: 1200,
        height: 800,
        minWidth: 720,
        minHeight: 480,
        backgroundColor: '#112233',
        icon: '/brand/icon.png',
        titleBarStyle: 'hiddenInset',
        titleBarOverlay,
        trafficLightPosition,
      }),
    ]);
    expect(loadRenderer).toHaveBeenCalledOnce();
  });

  it('keeps the secure defaults and existing background for old callers', () => {
    createHostWindow({
      preloadPath: '/absolute/preload.js',
      title: 'Consumer',
      width: 900,
      height: 600,
      loadRenderer: vi.fn(),
    });

    expect(electron.constructorOptions[0]).toEqual(
      expect.objectContaining({
        backgroundColor: '#16181d',
        webPreferences: {
          preload: '/absolute/preload.js',
          additionalArguments: [],
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          backgroundThrottling: false,
        },
      }),
    );
  });

  /**
   * The bridge declaration. Issue #17.
   *
   * `additionalArguments` is what a sandboxed preload can read, so it is how
   * the host says which capabilities it registered handlers for. The preload
   * defines those methods and no others, and the renderer feature-tests by
   * asking whether a method exists.
   */
  it('declares the bridge capabilities to the preload as arguments', () => {
    createHostWindow({
      preloadPath: '/absolute/preload.js',
      bridge: {
        capabilities: ['openExternal', 'versions'],
        serviceOrigin: 'http://127.0.0.1:9731/',
      },
      title: 'Consumer',
      width: 900,
      height: 600,
      loadRenderer: vi.fn(),
    });

    const options = electron.constructorOptions[0] as {
      webPreferences: { additionalArguments: string[]; sandbox: boolean };
    };
    expect(options.webPreferences.additionalArguments).toEqual([
      '--bridge-capability=openExternal',
      '--bridge-capability=versions',
      '--bridge-origin=http://127.0.0.1:9731',
    ]);
    // The declaration is worth nothing if the window that carries it drops the
    // constraint the bridge is written for.
    expect(options.webPreferences.sandbox).toBe(true);
  });

  it('refuses to open a window declaring a capability the bridge does not carry', () => {
    expect(() =>
      createHostWindow({
        preloadPath: '/absolute/preload.js',
        bridge: { capabilities: ['readFile' as never] },
        title: 'Consumer',
        width: 900,
        height: 600,
        loadRenderer: vi.fn(),
      }),
    ).toThrow(/readFile is not a bridge capability/);
  });

  it('reveals the window on ready unless the consumer takes that over', () => {
    createHostWindow({
      preloadPath: '/absolute/preload.js',
      title: 'Consumer',
      width: 900,
      height: 600,
      loadRenderer: vi.fn(),
    });

    expect(electron.onceHandler).toBeDefined();
    electron.onceHandler?.();
    expect(electron.show).toHaveBeenCalledOnce();

    electron.onceHandler = undefined;
    createHostWindow({
      preloadPath: '/absolute/preload.js',
      title: 'Consumer',
      width: 900,
      height: 600,
      showWhenReady: false,
      loadRenderer: vi.fn(),
    });

    expect(electron.onceHandler).toBeUndefined();
  });

  it('still denies new windows and cross-origin navigation', () => {
    createHostWindow({
      preloadPath: '/absolute/preload.js',
      title: 'Consumer',
      width: 900,
      height: 600,
      loadRenderer: vi.fn(),
    });

    expect(electron.openHandler?.({ url: 'https://outside.example' })).toEqual({
      action: 'deny',
    });

    const preventDefault = vi.fn();
    electron.navigateHandler?.({ preventDefault }, 'https://outside.example/path');
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(electron.openExternal).toHaveBeenCalledWith('https://outside.example');
    expect(electron.openExternal).toHaveBeenCalledWith('https://outside.example/path');
  });

  /*
   * `shell.openExternal` hands a URL to the operating system, so both seams
   * here are the same command surface `shell:open-external` is. `src/main/ipc.ts`
   * guards that channel with `isSafeExternalUrl`; these two shipped unguarded.
   */
  it('refuses to hand an unsafe scheme to the operating system', () => {
    createHostWindow({
      preloadPath: '/absolute/preload.js',
      title: 'Consumer',
      width: 900,
      height: 600,
      loadRenderer: vi.fn(),
    });

    // Still denied as a window, which was never the question.
    expect(electron.openHandler?.({ url: 'file:///etc/passwd' })).toEqual({
      action: 'deny',
    });

    const preventDefault = vi.fn();
    electron.navigateHandler?.({ preventDefault }, 'custom-app:run?cmd=rm');

    // Navigation away is still stopped.
    expect(preventDefault).toHaveBeenCalledOnce();

    // Neither reaches the operating system.
    expect(electron.openExternal).not.toHaveBeenCalled();
  });
});

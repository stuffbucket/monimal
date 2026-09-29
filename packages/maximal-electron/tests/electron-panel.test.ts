import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => {
  class FakeWindow {
    destroyed = false;
    visible = false;
    closed: (() => void) | undefined;
    calls: string[] = [];
    bounds: unknown[] = [];
    currentBounds = { x: 0, y: 0, width: 0, height: 0 };
    moved: (() => void) | undefined;
    setAlwaysOnTop = vi.fn();
    setVisibleOnAllWorkspaces = vi.fn();

    on(event: string, handler: () => void) {
      if (event === 'closed') this.closed = handler;
      if (event === 'moved') this.moved = handler;
      return this;
    }

    isDestroyed() {
      return this.destroyed;
    }

    isVisible() {
      return this.visible;
    }

    setBounds(bounds: unknown) {
      this.bounds.push(bounds);
      this.currentBounds = bounds as typeof this.currentBounds;
    }

    getBounds() {
      return this.currentBounds;
    }

    showInactive() {
      this.calls.push('showInactive');
      this.visible = true;
    }

    focus() {
      this.calls.push('focus');
    }

    hide() {
      this.calls.push('hide');
      this.visible = false;
    }

    destroy() {
      this.calls.push('destroy');
      this.destroyed = true;
      this.closed?.();
    }
  }

  return {
    FakeWindow,
    constructorOptions: [] as unknown[],
    created: [] as FakeWindow[],
    cursor: { x: 1400, y: 320 },
    displayBounds: { x: 1280, y: 0, width: 1280, height: 720 },
    displayWorkArea: { x: 1280, y: 24, width: 1280, height: 656 },
    getCursorScreenPoint: vi.fn(),
    getDisplayNearestPoint: vi.fn(),
  };
});

vi.mock('electron', () => ({
  BrowserWindow: class {
    constructor(options: unknown) {
      const window = new electron.FakeWindow();
      electron.constructorOptions.push(options);
      electron.created.push(window);
      return window;
    }
  },
  screen: {
    getCursorScreenPoint: electron.getCursorScreenPoint,
    getDisplayNearestPoint: electron.getDisplayNearestPoint,
  },
}));

import { createElectronPanel } from '../src/host/electron-panel.js';

function createdWindow(): InstanceType<typeof electron.FakeWindow> {
  const window = electron.created.at(-1);
  if (!window) throw new Error('Expected a BrowserWindow to be created.');
  return window;
}

describe('createElectronPanel', () => {
  beforeEach(() => {
    electron.constructorOptions.length = 0;
    electron.created.length = 0;
    electron.getCursorScreenPoint.mockReset().mockReturnValue(electron.cursor);
    electron.getDisplayNearestPoint
      .mockReset()
      .mockReturnValue({
        bounds: electron.displayBounds,
        workArea: electron.displayWorkArea,
      });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a hardened panel on the display under the cursor', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
    const loadRenderer = vi.fn();
    const bounds = vi.fn(() => ({ x: 1600, y: 80, width: 640, height: 560 }));
    const panel = createElectronPanel({
      preloadPath: '/absolute/preload.js',
      loadRenderer,
      bounds,
    });

    const window = panel.show();

    expect(electron.getDisplayNearestPoint).toHaveBeenCalledWith(electron.cursor);
    expect(bounds).toHaveBeenCalledWith(electron.displayWorkArea);
    expect(electron.constructorOptions).toEqual([
      expect.objectContaining({
        x: 1600,
        y: 80,
        width: 640,
        height: 560,
        show: false,
        frame: false,
        transparent: true,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        hasShadow: false,
        type: 'panel',
        webPreferences: {
          preload: '/absolute/preload.js',
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          backgroundThrottling: false,
        },
      }),
    ]);
    expect(loadRenderer).toHaveBeenCalledWith(window);
    expect(createdWindow().setAlwaysOnTop).toHaveBeenCalledWith(true, 'floating');
    expect(createdWindow().setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    });
    expect(createdWindow().bounds).toEqual([{ x: 1600, y: 80, width: 640, height: 560 }]);
    expect(createdWindow().calls).toEqual(['showInactive', 'focus']);
  });

  it('repositions and reuses a hidden panel', () => {
    const firstBounds = { x: 1280, y: 24, width: 1280, height: 656 };
    const secondBounds = { x: 0, y: 48, width: 1024, height: 720 };
    electron.getDisplayNearestPoint
      .mockReturnValueOnce({ workArea: firstBounds })
      .mockReturnValueOnce({ workArea: secondBounds });
    const loadRenderer = vi.fn();
    const panel = createElectronPanel({
      preloadPath: '/absolute/preload.js',
      loadRenderer,
    });

    panel.show();
    const window = createdWindow();
    panel.toggle();
    panel.toggle();

    expect(electron.created).toHaveLength(1);
    expect(loadRenderer).toHaveBeenCalledOnce();
    expect(window.bounds).toEqual([firstBounds, secondBounds, secondBounds]);
    expect(window.calls).toEqual([
      'showInactive',
      'focus',
      'hide',
      'showInactive',
      'focus',
    ]);
  });

  it('supports quiet stacking and focus, and clears destroyed windows', () => {
    const panel = createElectronPanel({
      preloadPath: '/absolute/preload.js',
      loadRenderer: vi.fn(),
      stackAboveFullscreen: false,
      focusWhenShown: false,
    });

    panel.show();
    const first = createdWindow();

    expect(first.setAlwaysOnTop).not.toHaveBeenCalled();
    expect(first.setVisibleOnAllWorkspaces).not.toHaveBeenCalled();
    expect(first.calls).toEqual(['showInactive']);

    panel.destroy();
    expect(first.calls).toEqual(['showInactive', 'destroy']);
    expect(panel.window()).toBeUndefined();

    panel.show();
    expect(electron.created).toHaveLength(2);
    const second = createdWindow();
    second.closed?.();
    expect(panel.window()).toBeUndefined();
  });

  it('reports completed user moves but ignores programmatic placement', () => {
    const onMoved = vi.fn();
    const panel = createElectronPanel({
      preloadPath: '/absolute/preload.js',
      loadRenderer: vi.fn(),
      movable: true,
      onMoved,
    });

    panel.show();
    const window = createdWindow();
    window.moved?.();
    expect(onMoved).not.toHaveBeenCalled();
    expect(electron.constructorOptions[0]).toEqual(
      expect.objectContaining({ movable: true }),
    );

    window.currentBounds = { x: 40, y: 50, width: 640, height: 480 };
    window.moved?.();
    expect(onMoved).toHaveBeenCalledWith(window.currentBounds);
  });
});

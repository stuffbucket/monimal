import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({
  close: vi.fn(),
  constructorOptions: [] as unknown[],
  destroyed: false,
  loadURL: vi.fn<(url: string) => Promise<void>>(() => Promise.resolve()),
  onClosed: undefined as (() => void) | undefined,
  readyToShow: undefined as (() => void) | undefined,
  show: vi.fn(),
  center: vi.fn(),
}));

vi.mock('electron', () => ({
  BrowserWindow: class BrowserWindow {
    constructor(options: unknown) {
      electron.constructorOptions.push(options);
    }

    close() {
      electron.close();
    }

    isDestroyed() {
      return electron.destroyed;
    }

    loadURL(url: string) {
      return electron.loadURL(url);
    }

    on(event: string, handler: () => void) {
      if (event === 'closed') electron.onClosed = handler;
    }

    once(event: string, handler: () => void) {
      if (event === 'ready-to-show') electron.readyToShow = handler;
    }

    show() {
      electron.show();
    }

    center() {
      electron.center();
    }
  },
}));

import { closeSplashWindow, createSplashWindow } from './splash-window.js'

describe('splash window', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    closeSplashWindow();
    electron.close.mockReset();
    electron.constructorOptions.length = 0;
    electron.destroyed = false;
    electron.loadURL.mockClear();
    electron.onClosed = undefined;
    electron.readyToShow = undefined;
    electron.show.mockReset();
    electron.center.mockReset();
  });

  afterEach(() => {
    closeSplashWindow();
    vi.useRealTimers();
  });

  it('loads escaped branding with secure BrowserWindow defaults', () => {
    createSplashWindow({ name: 'Maximal <preview>', version: '0.4.44' });

    expect(electron.constructorOptions).toEqual([
      expect.objectContaining({
        width: 880,
        height: 480,
        backgroundColor: '#00000000',
        hasShadow: false,
        movable: true,
        frame: false,
        transparent: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      }),
    ]);
    const url = vi.mocked(electron.loadURL).mock.calls[0]?.[0];
    expect(url).toBeDefined();
    const html = decodeURIComponent(url?.split(',')[1] ?? '');
    expect(html).toContain('Maximal &lt;preview&gt;');
    expect(html).not.toContain('Maximal <preview>');
    expect(html).toContain('v0.4.44');
    expect(html).toContain('class="wordmark"');
    expect(html).toContain('@font-face');
    expect(html).toContain("font-variation-settings:'SOFT' 30,'WONK' 1,'opsz' 144");
    expect(html).toContain('<div class="wordmark">Maximal &lt;preview&gt;</div>');
    expect(html).toContain('background:linear-gradient(180deg,#fcf5e6 0%,#f1e5cb 55%,#d6c4a0 100%)');
    expect(html).toContain('outline:.25px solid');
    expect(html).toContain('0 8px 16px');
  });

  it('shows when ready and closes after the fail-safe timeout', () => {
    createSplashWindow();
    electron.readyToShow?.();

    expect(electron.show).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(10_000);
    expect(electron.close).toHaveBeenCalledOnce();
  });

  it('defers an early ready-to-show dismissal until the five-second minimum', () => {
    createSplashWindow();
    electron.readyToShow?.();

    closeSplashWindow();
    vi.advanceTimersByTime(2_999);
    expect(electron.close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(electron.close).toHaveBeenCalledOnce();
    expect(electron.center).toHaveBeenCalledOnce();
  });

  it('can hold the splash open for an explicit preview', () => {
    createSplashWindow({ dismissAfterMs: false });

    vi.advanceTimersByTime(60_000);

    expect(electron.close).not.toHaveBeenCalled();
  });
});
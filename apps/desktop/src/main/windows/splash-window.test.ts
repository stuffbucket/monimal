import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({
  close: vi.fn(),
  constructorOptions: [] as unknown[],
  destroyed: false,
  executeJavaScript: vi.fn<(script: string, userGesture?: boolean) => Promise<unknown>>(
    () => Promise.resolve(),
  ),
  loadURL: vi.fn<(url: string) => Promise<void>>(() => Promise.resolve()),
  onClosed: undefined as (() => void) | undefined,
  readyToShow: undefined as (() => void) | undefined,
  show: vi.fn(),
  workArea: { x: -1600, y: 80, width: 1600, height: 900 },
}));

vi.mock('electron', () => ({
  screen: { getPrimaryDisplay: () => ({ workArea: electron.workArea }) },
  BrowserWindow: class BrowserWindow {
    webContents = {
      executeJavaScript: electron.executeJavaScript,
    }

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

  },
}));

import {
  closeSplashWindow,
  createSplashWindow,
  updateSplashStatus,
} from './splash-window.js'

describe('splash window', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    closeSplashWindow();
    electron.close.mockReset();
    electron.constructorOptions.length = 0;
    electron.destroyed = false;
    electron.executeJavaScript.mockClear();
    electron.loadURL.mockClear();
    electron.onClosed = undefined;
    electron.readyToShow = undefined;
    electron.show.mockReset();
    electron.workArea = { x: -1600, y: 80, width: 1600, height: 900 };
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
        x: -1240,
        y: 290,
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
    expect(html).toContain('Preparing desktop services…');
    expect(html).toContain('right:24px;bottom:20px');
    expect(html).toContain('text-align:right');
    expect(html).toContain('class="wordmark"');
    expect(html).toContain('@font-face');
    expect(html).toContain("font-variation-settings:'SOFT' 30,'WONK' 1,'opsz' 144");
    expect(html).toContain('<div class="wordmark">Maximal &lt;preview&gt;</div>');
    expect(html).toContain('background:linear-gradient(180deg,#fcf5e6 0%,#f1e5cb 55%,#d6c4a0 100%)');
    expect(html).toContain('outline:.25px solid');
    expect(html).toContain('0 8px 16px');
  });

  it('escapes the version and updates startup status text', async () => {
    createSplashWindow({ version: '1.0.<preview>' });

    const html = decodeURIComponent(
      electron.loadURL.mock.calls[0]?.[0]?.split(',')[1] ?? '',
    );
    expect(html).toContain('v1.0.&lt;preview&gt;');
    expect(html).not.toContain('v1.0.<preview>');

    await updateSplashStatus('Opening the secure local model gateway…');
    expect(electron.executeJavaScript).toHaveBeenCalledWith(
      'document.querySelector(\'.status\').textContent="Opening the secure local model gateway…"',
      true,
    );
  });

  it('reports when the splash has actually closed', () => {
    const onClosed = vi.fn();
    createSplashWindow({ onClosed });

    closeSplashWindow();
    vi.advanceTimersByTime(3_000);
    expect(onClosed).not.toHaveBeenCalled();

    electron.onClosed?.();
    expect(onClosed).toHaveBeenCalledOnce();
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
  });

  it('keeps the splash origin on the primary display when its work area is smaller', () => {
    electron.workArea = { x: 1920, y: -300, width: 640, height: 400 };

    createSplashWindow();

    expect(electron.constructorOptions).toEqual([
      expect.objectContaining({ x: 1920, y: -300 }),
    ]);
  });

  it('can hold the splash open for an explicit preview', () => {
    createSplashWindow({ dismissAfterMs: false });

    vi.advanceTimersByTime(60_000);

    expect(electron.close).not.toHaveBeenCalled();
  });
});
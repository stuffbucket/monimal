import type { App } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { HostWindowOptions } from '../src/host/host-window.js';

const electron = vi.hoisted(() => {
  class FakeWindow {
    destroyed = false;
    closed: (() => void) | undefined;
    webContents = {
      getURL: () => 'https://shell.example/',
      setWindowOpenHandler: () => undefined,
      on: () => undefined,
    };

    isDestroyed() {
      return this.destroyed;
    }
    once() {
      return this;
    }
    show() {
      return this;
    }
    on(event: string, handler: () => void) {
      if (event === 'closed') this.closed = handler;
      return this;
    }
    close() {
      this.destroyed = true;
      this.closed?.();
    }
  }

  return { FakeWindow, created: [] as { options: unknown; window: FakeWindow }[] };
});

type FakeWindow = InstanceType<typeof electron.FakeWindow>;

vi.mock('electron', () => ({
  BrowserWindow: class {
    constructor(options: unknown) {
      const window = new electron.FakeWindow();
      electron.created.push({ options, window });
      return window as unknown as this;
    }
  },
  shell: { openExternal: vi.fn() },
}));

import { RUN_MAIN_OPTIONS_VERSION, runMain } from '../src/host/run-main.js';

type Handler = (...args: never[]) => void;

function fakeApp() {
  const handlers = new Map<string, Handler[]>();
  const app = {
    handlers,
    ready: vi.fn(() => Promise.resolve()),
    lock: vi.fn(() => true),
    quit: vi.fn(),
    setPath: vi.fn(),
    emit(event: string, ...args: unknown[]) {
      for (const handler of handlers.get(event) ?? []) {
        (handler as (...rest: unknown[]) => void)(...args);
      }
    },
  };
  const electronApp = {
    whenReady: () => app.ready(),
    requestSingleInstanceLock: () => app.lock(),
    getPath: () => '/profiles/shell',
    setPath: (name: string, value: string) => {
      app.setPath(name, value);
    },
    quit: () => {
      app.quit();
    },
    on: (event: string, handler: Handler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
  };
  return { app, runtime: { app: electronApp as unknown as App } };
}

const windowOptions: HostWindowOptions = {
  preloadPath: '/preload.js',
  title: 'Consumer',
  width: 900,
  height: 600,
  loadRenderer: () => undefined,
};

describe('runMain', () => {
  beforeEach(() => {
    electron.created.length = 0;
  });

  it('refuses a call site written against another options version', async () => {
    const { runtime } = fakeApp();

    await expect(
      runMain(runtime, {
        version: 2 as typeof RUN_MAIN_OPTIONS_VERSION,
        window: () => windowOptions,
      }),
    ).rejects.toThrow('runMain options are version 1, and this call passed 2.');
    expect(electron.created).toHaveLength(0);
  });

  it('sets the profile, takes the lock, and opens the window the consumer describes', async () => {
    const { app, runtime } = fakeApp();
    const order: string[] = [];

    const context = await runMain(runtime, {
      version: RUN_MAIN_OPTIONS_VERSION,
      userDataDirectory: '/profiles/e2e',
      window: () => {
        order.push('window');
        return windowOptions;
      },
      onReady: () => {
        order.push('ready');
      },
      onWindowCreated: () => {
        order.push('created');
      },
    });

    expect(app.setPath).toHaveBeenCalledWith('userData', '/profiles/e2e');
    expect(app.lock).toHaveBeenCalledOnce();
    expect(order).toEqual(['ready', 'window', 'created']);
    expect(electron.created).toHaveLength(1);
    expect(electron.created[0]?.options).toMatchObject({
      width: 900,
      height: 600,
      webPreferences: expect.objectContaining({ sandbox: true }),
    });
    expect(context.currentWindow()).toBe(electron.created[0]?.window);
    expect(context.daemonUrl).toBeUndefined();
  });

  it('leaves the profile alone when the consumer names none', async () => {
    const { app, runtime } = fakeApp();

    await runMain(runtime, {
      version: RUN_MAIN_OPTIONS_VERSION,
      window: () => windowOptions,
    });

    expect(app.setPath).not.toHaveBeenCalled();
  });

  it('normalizes the discovered origin and settles it before the window is described', async () => {
    const { runtime } = fakeApp();
    const seen: (string | undefined)[] = [];

    const context = await runMain(runtime, {
      version: RUN_MAIN_OPTIONS_VERSION,
      discoverDaemonUrl: () => Promise.resolve('http://127.0.0.1:53211/'),
      onReady: (ready) => {
        seen.push(ready.daemonUrl);
      },
      window: (inner) => {
        seen.push(inner.daemonUrl);
        return windowOptions;
      },
    });

    expect(context.daemonUrl).toBe('http://127.0.0.1:53211');
    expect(seen).toEqual(['http://127.0.0.1:53211', 'http://127.0.0.1:53211']);
  });

  it('quits without a window when another instance holds the profile', async () => {
    const { app, runtime } = fakeApp();
    app.lock.mockReturnValue(false);

    const context = await runMain(runtime, {
      version: RUN_MAIN_OPTIONS_VERSION,
      window: () => windowOptions,
    });

    expect(app.quit).toHaveBeenCalledOnce();
    expect(electron.created).toHaveLength(0);
    expect(context.currentWindow()).toBeUndefined();
    expect([...app.handlers.keys()]).toEqual([]);
  });

  it('never asks for the lock when the consumer turns it off', async () => {
    const { app, runtime } = fakeApp();

    await runMain(runtime, {
      version: RUN_MAIN_OPTIONS_VERSION,
      singleInstance: false,
      window: () => windowOptions,
    });

    expect(app.lock).not.toHaveBeenCalled();
    expect(electron.created).toHaveLength(1);
  });

  it('focuses the surviving window on activation and reopens once it is gone', async () => {
    const { app, runtime } = fakeApp();
    const activated: (FakeWindow | undefined)[] = [];

    await runMain(runtime, {
      version: RUN_MAIN_OPTIONS_VERSION,
      window: () => windowOptions,
      onActivate: (window) => activated.push(window as unknown as FakeWindow),
    });

    const first = electron.created[0]?.window;
    app.emit('activate');
    expect(activated).toEqual([first]);
    expect(electron.created).toHaveLength(1);

    first?.close();
    app.emit('second-instance');
    expect(activated).toEqual([first, undefined]);
    expect(electron.created).toHaveLength(2);
  });

  it('hands the quit decision to the consumer before acting on it', async () => {
    const { app, runtime } = fakeApp();
    const order: string[] = [];
    let keepRunning = true;
    app.quit.mockImplementation(() => order.push('quit'));

    await runMain(
      { ...runtime, platform: 'win32' },
      {
        version: RUN_MAIN_OPTIONS_VERSION,
        window: () => windowOptions,
        keepRunningWithoutWindows: () => keepRunning,
        onWindowAllClosed: (quitting) => order.push(`closed:${String(quitting)}`),
      },
    );

    app.emit('window-all-closed');
    keepRunning = false;
    app.emit('window-all-closed');

    expect(order).toEqual(['closed:false', 'closed:true', 'quit']);
  });

  it('quits with the last window unless the consumer keeps the process alive', async () => {
    const { app, runtime } = fakeApp();
    let keepRunning = true;

    await runMain(
      { ...runtime, platform: 'win32' },
      {
        version: RUN_MAIN_OPTIONS_VERSION,
        window: () => windowOptions,
        keepRunningWithoutWindows: () => keepRunning,
      },
    );

    app.emit('window-all-closed');
    expect(app.quit).not.toHaveBeenCalled();

    keepRunning = false;
    app.emit('window-all-closed');
    expect(app.quit).toHaveBeenCalledOnce();
  });

  it('quits with the last window when no policy is supplied', async () => {
    const { app, runtime } = fakeApp();

    await runMain(
      { ...runtime, platform: 'linux' },
      { version: RUN_MAIN_OPTIONS_VERSION, window: () => windowOptions },
    );

    app.emit('window-all-closed');
    expect(app.quit).toHaveBeenCalledOnce();
  });

  it('defers the quit until pending shutdown work settles, then lets it through', async () => {
    const { app, runtime } = fakeApp();
    let release = () => undefined as void;
    const pending = new Promise<void>((resolve) => {
      release = () => {
        resolve();
      };
    });
    const beforeShutdown = vi.fn(() => pending);
    const event = { preventDefault: vi.fn() };

    await runMain(runtime, {
      version: RUN_MAIN_OPTIONS_VERSION,
      window: () => windowOptions,
      beforeShutdown,
    });

    app.emit('before-quit', event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(app.quit).not.toHaveBeenCalled();

    release();
    await pending;
    await Promise.resolve();
    expect(app.quit).toHaveBeenCalledOnce();

    // The quit that follows must not run the shutdown again, or preventDefault
    // on the second pass would leave the application unable to quit at all.
    app.emit('before-quit', event);
    expect(beforeShutdown).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('lets the quit through when shutdown work finishes synchronously', async () => {
    const { app, runtime } = fakeApp();
    const beforeShutdown = vi.fn(() => undefined);
    const event = { preventDefault: vi.fn() };

    await runMain(runtime, {
      version: RUN_MAIN_OPTIONS_VERSION,
      window: () => windowOptions,
      beforeShutdown,
    });

    app.emit('before-quit', event);
    expect(beforeShutdown).toHaveBeenCalledOnce();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

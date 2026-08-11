import type { App, BrowserWindow, CrashReporter } from 'electron';

import { startCrashArtifacts } from './crash-artifacts.js';
import { createHostWindow } from './host-window.js';
import {
  RUN_MAIN_OPTIONS_VERSION,
  assertOptionsVersion,
  normalizeDaemonUrl,
  quitsWithLastWindow,
  type MainContext,
  type RunMainOptions,
} from './main-options.js';

export { RUN_MAIN_OPTIONS_VERSION };
export type { MainContext, RunMainOptions };

/**
 * The runtime `runMain` drives.
 *
 * `app` is injected rather than imported so the seam can be driven without an
 * Electron process, which is what the unit suite does.
 */
export interface MainRuntime {
  app: App;
  /** Needed only by `collectCrashDumps`, and injected for the same reason. */
  crashReporter?: CrashReporter;
  /** Defaults to `process.platform`. */
  platform?: string;
}

/**
 * Run a main process on this shell's lifecycle.
 *
 * The shell owns the profile directory, the single instance lock, window
 * creation and reopening, the quit policy, and the deferred shutdown. The
 * consumer owns everything named in `options`. See `docs/embedding.md`.
 *
 * Resolves once the first window exists. When another instance already holds
 * the profile, it quits this process and resolves with no window.
 */
export async function runMain(
  runtime: MainRuntime,
  options: RunMainOptions,
): Promise<MainContext> {
  assertOptionsVersion(options.version);

  const app = runtime.app;
  const platform = runtime.platform ?? process.platform;

  if (options.userDataDirectory !== undefined) {
    app.setPath('userData', options.userDataDirectory);
  }

  // After the profile, never before it. Crashpad reads `userData` once, when
  // it starts, so a reporter started first files its dumps under the directory
  // this application is about to stop using. Issue #134.
  if (options.collectCrashDumps === true) {
    const reporter = runtime.crashReporter;
    if (!reporter) {
      throw new Error('collectCrashDumps needs runtime.crashReporter.');
    }
    startCrashArtifacts({ app, crashReporter: reporter });
  }

  let window: BrowserWindow | undefined;

  const context: MainContext = {
    daemonUrl: undefined,
    currentWindow: () => (window?.isDestroyed() === false ? window : undefined),
    activate,
  };

  function openWindow(): void {
    const created = createHostWindow(options.window(context));
    window = created;
    created.on('closed', () => {
      if (window === created) window = undefined;
    });
    options.onWindowCreated?.(created);
  }

  function activate(): void {
    const existing = context.currentWindow();
    options.onActivate?.(existing);
    if (!existing) openWindow();
  }

  // A second instance activates the first. Say so, because the alternative is
  // a developer watching a clean build produce no window at all.
  if ((options.singleInstance ?? true) && !app.requestSingleInstanceLock()) {
    console.error(
      `Another instance already holds ${app.getPath('userData')}. ` +
        'Bringing it forward instead of opening a second window.',
    );
    app.quit();
    return context;
  }

  app.on('window-all-closed', () => {
    const keepRunning = options.keepRunningWithoutWindows?.() ?? false;
    const quitting = quitsWithLastWindow(platform, keepRunning);
    options.onWindowAllClosed?.(quitting);
    if (quitting) app.quit();
  });

  let shuttingDown = false;
  app.on('before-quit', (event) => {
    // The second pass, after the deferred work finished. Let it through.
    if (shuttingDown) return;
    const pending = options.beforeShutdown?.();
    if (!pending) return;

    shuttingDown = true;
    event.preventDefault();
    void Promise.resolve(pending).then(() => {
      app.quit();
    });
  });

  await app.whenReady();

  // After ready, because both handlers open a window when none is left, and a
  // window before ready throws.
  app.on('second-instance', activate);
  app.on('activate', activate);

  if (options.discoverDaemonUrl) {
    context.daemonUrl = normalizeDaemonUrl(await options.discoverDaemonUrl());
  }
  await options.onReady?.(context);
  openWindow();

  return context;
}

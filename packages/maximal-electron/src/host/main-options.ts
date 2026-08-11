import type { BrowserWindow } from 'electron';

import type { HostWindowOptions } from './host-window.js';

/**
 * The version of the shape `runMain` accepts.
 *
 * The consumer passes it back in `options.version`, so a shell built against a
 * later contract refuses an older call site instead of reading a field that
 * moved. See `docs/embedding.md`.
 */
export const RUN_MAIN_OPTIONS_VERSION = 1;

/** What every callback receives, and what `runMain` resolves to. */
export interface MainContext {
  /** The normalized result of `discoverDaemonUrl`, or undefined without one. */
  daemonUrl: string | undefined;
  /** The live window, or undefined between a close and the next activation. */
  currentWindow: () => BrowserWindow | undefined;
  /** Bring the application forward, opening a window if none is left. */
  activate: () => void;
}

/**
 * Everything application-specific `runMain` needs.
 *
 * Every field is a value or a callback in this shell's own vocabulary. The
 * shell decides when each one runs and nothing else about it.
 */
export interface RunMainOptions {
  /** `RUN_MAIN_OPTIONS_VERSION`. Anything else throws. */
  version: typeof RUN_MAIN_OPTIONS_VERSION;
  /**
   * Options for each window the shell opens, including the one it reopens on
   * activation. Called after discovery, so `context.daemonUrl` is settled.
   */
  window: (context: MainContext) => HostWindowOptions;
  /** Profile directory, applied before the single instance lock is taken. */
  userDataDirectory?: string;
  /** Take the single instance lock. Default true. */
  singleInstance?: boolean;
  /**
   * Write a local crash minidump for every process this shell owns. Default
   * false, and `MainRuntime.crashReporter` must be supplied with it.
   *
   * Off by default because a crash reporter is process-wide. Starting one
   * inside somebody else's application is their decision, and a consumer that
   * already runs one would get a second. Nothing is uploaded either way: there
   * is no `submitURL`, no endpoint, and no credential. Issue #134.
   */
  collectCrashDumps?: boolean;
  /**
   * Keep the process alive after the last window closes, on every platform.
   * Consulted at the moment the last window closes, not once at startup, so a
   * preference the user changes takes effect. Default false.
   */
  keepRunningWithoutWindows?: () => boolean;
  /**
   * The origin of a service this application talks to, resolved once before
   * the first window opens. The shell normalizes it and hands it back through
   * `context.daemonUrl`; how it reaches the renderer is the consumer's choice.
   */
  discoverDaemonUrl?: () => string | Promise<string>;
  /** After the runtime is ready and discovery is done, before the first window. */
  onReady?: (context: MainContext) => void | Promise<void>;
  /** Every activation, with the surviving window when there is one. */
  onActivate?: (window: BrowserWindow | undefined) => void;
  onWindowCreated?: (window: BrowserWindow) => void;
  /**
   * The last window closed. `quitting` is the decision the shell is about to
   * act on, so an application that reacts to it never recomputes the policy or
   * depends on where its own listener sits in the order.
   */
  onWindowAllClosed?: (quitting: boolean) => void;
  /**
   * Release whatever the application owns. Returning a promise defers the quit
   * until it settles; returning nothing lets the quit through untouched.
   */
  beforeShutdown?: () => void | Promise<void>;
}

/** Reject a call site written against a different `options` shape. */
export function assertOptionsVersion(version: number): void {
  if (version === RUN_MAIN_OPTIONS_VERSION) return;
  throw new Error(
    `runMain options are version ${String(RUN_MAIN_OPTIONS_VERSION)}, and this call passed ${String(version)}.`,
  );
}

/**
 * One spelling of a discovered origin.
 *
 * A caller that joins a path onto this should get the same string whether the
 * discovery returned a trailing slash or not, and a relative value has to fail
 * here rather than as a blank window.
 */
export function normalizeDaemonUrl(value: string): string {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`discoverDaemonUrl must return an absolute URL, and returned "${value}".`);
  }
  const href = parsed.href;
  return href.endsWith('/') ? href.slice(0, -1) : href;
}

/**
 * Whether closing the last window ends the process.
 *
 * macOS keeps an application running without windows, and an application that
 * holds a menu bar item is reachable with no window on any platform.
 */
export function quitsWithLastWindow(platform: string, keepRunning: boolean): boolean {
  if (keepRunning) return false;
  return platform !== 'darwin';
}

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  _electron as electron,
  type ElectronApplication,
  type Locator,
  type Page,
} from '@playwright/test';
import type { Preferences } from '../src/shared/ipc.js';

import { inspectCapture } from './screenshot.js';

const ROOT = path.resolve(__dirname, '..');


/**
 * Write a reference screenshot.
 *
 * `page.screenshot` captures the operating system surface. macOS stops giving
 * a window frames once another application fully occludes it, so that call
 * hangs until its timeout rather than returning a stale image. It reproduced
 * when another window occludes the test run.
 *
 * Capturing through the debugger instead reads the renderer's own compositor,
 * which does not care what is in front. The fallback keeps a working capture
 * on any platform where the debugger route is unavailable.
 *
 * A capture that fails outright warns rather than failing the run, because
 * these are documentation artifacts and behaviour is asserted separately. A
 * capture that succeeds and is blank does fail, because that looks like
 * success and is not.
 */
export async function capture(page: Page, file: string): Promise<boolean> {
  await mkdir(path.dirname(file), { recursive: true });

  let image: Buffer | undefined;

  try {
    const session = await page.context().newCDPSession(page);
    try {
      const shot = await session.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: false,
      });
      image = Buffer.from(shot.data, 'base64');
    } finally {
      await session.detach().catch(() => undefined);
    }
  } catch {
    // Fall through to the ordinary path.
  }

  if (image === undefined) {
    try {
      image = await page.screenshot({ timeout: 10_000 });
    } catch {
      console.warn(`screenshot skipped, window not composited: ${file}`);
      return false;
    }
  }

  await writeFile(file, image);

  const verdict = inspectCapture(image);
  if (!verdict.ok) throw new Error(`${file}: ${verdict.reason}`);

  return true;
}

/**
 * Launch the application under Playwright.
 *
 * ## Why this drives the unpackaged build
 *
 * Playwright's Electron driver attaches through the Node inspector. This
 * application fuses `EnableNodeCliInspectArguments` off in `forge.config.ts`,
 * which is correct for a shipped binary and also makes the packaged app
 * impossible for Playwright to attach to. Launching the packaged `.app` here
 * fails with a launch timeout, not a useful error.
 *
 * So the split is deliberate:
 *
 * - These tests run against `.vite/`, the same main, preload, and renderer
 *   bundles the package contains. They cover behaviour and layout.
 * - Packaging concerns that this cannot reach — asar packing and the fuse
 *   values — are verified separately by `npm run verify:package`.
 *
 * Run `npm run package` first: it produces the `.vite` bundles this needs.
 */

export interface Harness {
  app: ElectronApplication;
  window: Page;
}

/**
 * Find the shell window.
 *
 * `firstWindow()` is not enough on its own: the splash is a real window, and if
 * it opens first the handle dies the moment the splash closes. `STUFFBUCKET_E2E`
 * disables the splash, and this scan is the second guard.
 */
async function shellWindow(app: ElectronApplication): Promise<Page> {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    for (const candidate of app.windows()) {
      if (candidate.isClosed()) continue;
      if (candidate.url().includes('splash')) continue;
      return candidate;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error('No shell window appeared within 30 seconds.');
}

export async function launchApp(env: Record<string, string> = {}): Promise<Harness> {
  const app = await electron.launch({
    // Resolve Electron from the project, and point it at the built bundles.
    args: [ROOT],
    cwd: ROOT,
    env: {
      ...process.env,
      // Keep the profile out of the real user data directory, so a test run
      // never clobbers a developer's preferences.
      STUFFBUCKET_E2E: '1',
      ...env,
    },
  });

  const window = await shellWindow(app);
  await window.waitForSelector('[data-testid="titlebar"]', { timeout: 30_000 });

  // Determinism, per maximal's ui-layout-verification skill: no motion, so a
  // screenshot or a measured width never races an animation.
  await window.emulateMedia({ reducedMotion: 'reduce' });
  await window.addStyleTag({
    content: '*,*::before,*::after{animation:none!important;transition:none!important}',
  });

  return { app, window };
}

/**
 * Close the application, and insist that it exited cleanly.
 *
 * `app.close()` on its own hides a whole class of fault. The application can
 * abort during teardown and Playwright still reports every test as passed,
 * because the assertions already ran.
 *
 * A signal means the process died rather than exited. That is a defect even
 * when everything before it passed.
 */
export async function closeApp(
  harness: { app: ElectronApplication } | undefined,
): Promise<void> {
  if (!harness) return;

  const child = harness.app.process();
  await harness.app.close();

  if (child.signalCode) {
    throw new Error(
      `The application died on ${child.signalCode} instead of exiting. ` +
        'Native work outstanding at quit is the usual cause.',
    );
  }
  if (child.exitCode !== null && child.exitCode !== 0) {
    throw new Error(`The application exited with code ${String(child.exitCode)}.`);
  }
}

/**
 * Return the shell to a known state.
 *
 * These specs share one Electron application, because launching a fresh one
 * per test is slow. Sharing means state leaks between tests, and the suite
 * runs in a random order, so no test may assume what ran before it.
 *
 * Call this from `beforeEach`. It is deliberately tolerant: a control that is
 * already in the wanted state, or missing entirely, is not an error.
 */
export async function resetShell({ window }: Harness): Promise<void> {
  // `bringToFront` activates the real window, which pulls the user's keyboard
  // out of whatever they are doing, once per scenario. Playwright dispatches
  // clicks and keys through the debugger, so it is only needed when someone is
  // actually watching the run.
  if (process.env['STUFFBUCKET_E2E_VISIBLE'] === '1') {
    await window.bringToFront();
  }

  // Close every tab except the first. `.tab__close` only renders while more
  // than one tab is open, which is the natural stop condition.
  for (let guard = 0; guard < 20; guard += 1) {
    const closers = window.locator('.tab__close');
    if ((await closers.count()) === 0) break;
    await closers.last().click();
  }

  await window.locator('.tab').first().click();

  // Expand both side panels. The toggle reports its own state, so only click
  // when it is actually collapsed.
  for (const testId of ['toggle-left', 'toggle-right']) {
    const button = window.locator(`[data-testid="${testId}"]`);
    if ((await button.getAttribute('data-active')) !== 'true') {
      await button.click();
    }
  }

  // A known view and view mode, with nothing selected.
  await window.click('[data-testid="nav-library"]');
  await window.click('[data-testid="mode-grid"]');
}

/**
 * Everything a terminal has drawn, read from the emulator's own buffer.
 *
 * `ghostty-web` renders to a canvas, so there is no DOM text to assert on and a
 * pixel comparison would prove nothing about what the terminal parsed. The
 * instance is exposed on the host element for exactly this.
 */
export function terminalScreen(terminal: Locator): Promise<string> {
  return terminal.evaluate((node) => {
    const term = (node as HTMLElement & { __terminal?: unknown }).__terminal as
      | {
          buffer: {
            active: {
              length: number;
              getLine: (
                y: number,
              ) => { translateToString: (trim?: boolean) => string } | undefined;
            };
          };
        }
      | undefined;
    if (!term) return '';

    const active = term.buffer.active;
    const lines: string[] = [];
    for (let y = 0; y < active.length; y += 1) {
      lines.push(active.getLine(y)?.translateToString(true) ?? '');
    }
    return lines.join('\n');
  });
}

/**
 * Set the theme through the preference bridge, the way the shell does.
 *
 * It is a persisted preference, so a scenario that changes it has to put it
 * back. `resetShell` does not, because preferences are not view state.
 */
export async function setTheme(
  page: Page,
  theme: 'system' | 'light' | 'dark',
): Promise<void> {
  await page.evaluate((value) => {
    // `window` is the Playwright page in this file, so the preload bridge has
    // to be reached through `globalThis`.
    const api = (
      globalThis as unknown as {
        stuffbucket?: {
          invoke: (channel: string, payload: unknown) => Promise<unknown>;
        };
      }
    ).stuffbucket;
    return api?.invoke('prefs:set', { theme: value });
  }, theme);
}

/**
 * Set preferences through the bridge, the way the shell does.
 *
 * Scenarios set persisted preferences explicitly rather than relying on order.
 */
export async function setPrefs(page: Page, patch: Partial<Preferences>): Promise<Preferences> {
  const next = await page.evaluate((value) => {
    const api = (
      globalThis as unknown as {
        stuffbucket?: {
          invoke: (channel: string, payload: unknown) => Promise<unknown>;
        };
      }
    ).stuffbucket;
    return api?.invoke('prefs:set', value);
  }, patch);

  return next as Preferences;
}

/** Current preferences, so a scenario can put back what it changed. */
export async function getPrefs(page: Page): Promise<Preferences> {
  const prefs = await page.evaluate(() => {
    const api = (
      globalThis as unknown as {
        stuffbucket?: { invoke: (channel: string) => Promise<unknown> };
      }
    ).stuffbucket;
    return api?.invoke('prefs:get');
  });

  return prefs as Preferences;
}

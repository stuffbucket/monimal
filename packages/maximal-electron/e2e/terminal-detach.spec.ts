import {
  expect,
  test,
  type ElectronApplication,
  type Locator,
  type Page,
} from '@playwright/test';

import {
  closeApp,
  launchApp,
  resetShell,
  terminalScreen,
  type Harness,
} from './harness.js';

/**
 * Closing a terminal tab, with detach off and on.
 *
 * The claim is about a process, not about a component: with `terminalDetach`
 * off the shell dies when its view unmounts, and with it on the same shell is
 * still running afterwards, still listed, and still answers when a view
 * attaches to it again. Asserting the same pid answers is what separates a
 * reattach from a second shell opened under the same id.
 *
 * Commands go over `pty:write` rather than through the keyboard. Typing races
 * the shell coming up, and a mangled command still matches a loose pattern: the
 * first run of this scenario read a pid out of a line the shell had garbled,
 * which is a number greater than zero and not a process. `e2e/shell.spec.ts`
 * covers the keystroke path.
 *
 * Its own application, because the preference persists and the shared suite
 * runs in a random order.
 *
 * POSIX only: the pid comes from the shell itself through `$$`, and `cmd.exe`
 * has no equivalent. Windows is unverified.
 */

/** `newTerminal` in `App.tsx` numbers from the terminals open, so this is it. */
const SESSION = 'term-1';
const TAB = 'Terminal 1';

let harness: Harness;

test.beforeAll(async () => {
  harness = await launchApp();
});

test.afterAll(async () => {
  await closeApp(harness);
});

/** Reach the preload bridge. `window` is the Playwright page in this file. */
function invoke(page: Page, channel: string, payload?: unknown): Promise<unknown> {
  return page.evaluate(
    ([name, body]) => {
      const api = (
        globalThis as unknown as {
          stuffbucket?: {
            invoke: (channel: string, payload?: unknown) => Promise<unknown>;
          };
        }
      ).stuffbucket;
      return api?.invoke(name as string, body);
    },
    [channel, payload] as const,
  );
}

/** Signal 0 asks whether a process exists without delivering anything. */
function isAlive(app: ElectronApplication, pid: number): Promise<boolean> {
  return app.evaluate((_electron, value) => {
    try {
      process.kill(value, 0);
      return true;
    } catch {
      return false;
    }
  }, pid);
}

/**
 * Ask the shell for its own pid.
 *
 * The brackets are the point. A partial line cannot match, so a command that
 * did not arrive intact leaves the poll to time out with its own message rather
 * than yielding a number that is not a pid.
 */
async function pidOf(page: Page, terminal: Locator, marker: string): Promise<number> {
  await invoke(page, 'pty:write', { id: SESSION, data: `echo "[${marker}=$$]"\n` });

  const pattern = new RegExp(`\\[${marker}=(\\d+)]`);
  await expect
    .poll(() => terminalScreen(terminal), {
      timeout: 20_000,
      message: `the shell never answered ${marker}`,
    })
    .toMatch(pattern);

  return Number(pattern.exec(await terminalScreen(terminal))?.[1]);
}

/** The terminal a view is showing. There is only ever one in this scenario. */
function terminalOf(page: Page): Locator {
  return page.locator('[data-testid="terminal"]');
}

/** Open a terminal tab and wait for its shell to print something. */
async function openTerminal(page: Page): Promise<Locator> {
  await page.click('[data-testid="tab-new"]');
  const terminal = terminalOf(page);
  await expect(terminal.locator('canvas').first()).toBeVisible({ timeout: 20_000 });

  // A shell that has printed nothing has not necessarily started, and writing
  // to a session the host does not hold yet is dropped.
  await expect
    .poll(() => terminalScreen(terminal), {
      timeout: 20_000,
      message: 'the shell printed nothing at all',
    })
    .not.toBe('');

  return terminal;
}

/**
 * Close the tab, and insist the view left the document.
 *
 * Without this a later assertion could read the closed view's own buffer and
 * report it as replayed output.
 */
async function closeTerminalTab(page: Page): Promise<void> {
  await page.locator('.tab').filter({ hasText: TAB }).locator('.tab__close').click();
  await expect(terminalOf(page)).toHaveCount(0);
}

test('a tab close ends its shell, unless the shell is detached', async () => {
  test.skip(
    process.platform === 'win32',
    'No portable way to read a shell process id from cmd.exe.',
  );

  const { app, window } = harness;
  await resetShell(harness);
  await invoke(window, 'prefs:set', { terminalDetach: false });

  /* --------------------------------------------------- the default: terminate */

  const reaped = await pidOf(window, await openTerminal(window), 'REAPED');

  // The floor. Without a real pid every check below asks about nothing, and a
  // test that found no process would report both behaviours as correct.
  expect(reaped).toBeGreaterThan(0);
  expect(await isAlive(app, reaped)).toBe(true);

  await closeTerminalTab(window);
  await expect
    .poll(() => isAlive(app, reaped), {
      timeout: 15_000,
      message: 'the shell outlived the tab that opened it',
    })
    .toBe(false);

  /* ------------------------------------------------------ opted in: detach */

  await invoke(window, 'prefs:set', { terminalDetach: true });
  const kept = await pidOf(window, await openTerminal(window), 'KEPT');

  expect(kept).toBeGreaterThan(0);
  expect(kept).not.toBe(reaped);
  expect(await isAlive(app, kept)).toBe(true);

  await closeTerminalTab(window);

  // The reaped shell above was gone 42 milliseconds after its tab closed, so
  // five seconds of staying alive is a result rather than a race won.
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    expect(await isAlive(app, kept)).toBe(true);
    await window.waitForTimeout(1_000);
  }

  /* ------------------------------------------- enumerated, and attached to */

  // A session nothing can find again is a leak rather than a feature, so the
  // shell lists what is running with no tab.
  const reattach = window.locator(`[data-testid="reattach-${SESSION}"]`);
  await expect(reattach).toBeVisible({ timeout: 10_000 });
  await reattach.click();

  const terminal = terminalOf(window);
  await expect(terminal.locator('canvas').first()).toBeVisible({ timeout: 20_000 });

  // What the host retained crosses the unmount. This is a new view over an old
  // session, so every character on it was replayed.
  await expect
    .poll(() => terminalScreen(terminal), {
      timeout: 20_000,
      message: 'the attached view was never sent what the session had printed',
    })
    .toContain(`[KEPT=${String(kept)}]`);

  // The same process, not a second one spawned under the same id.
  expect(await pidOf(window, terminal, 'AGAIN')).toBe(kept);

  /* ------------------------------------------------------- and back to off */

  await invoke(window, 'prefs:set', { terminalDetach: false });
  await closeTerminalTab(window);
  await expect
    .poll(() => isAlive(app, kept), {
      timeout: 15_000,
      message: 'turning detach off did not restore reaping',
    })
    .toBe(false);
});

import { expect, test } from '@playwright/test';

import {
  closeApp,
  launchApp,
  resetShell,
  terminalScreen,
  type Harness,
} from './harness.js';

/**
 * A window closing reaps its own shells.
 *
 * `killAllPtys` on quit already stops a shell outliving the application. The
 * case this covers is the middle one from `#37`: a window is destroyed while
 * the application keeps running. Before sessions were owned by a window, that
 * shell kept running with nothing left to show it and nothing left to stop it.
 *
 * A second window is opened first, so the close under test is a window
 * closing rather than the application quitting. Without it `window-all-closed`
 * decides the outcome and quit-time cleanup is what reaps the shell, which is
 * the case this test is not about.
 *
 * POSIX only: the pid comes from the shell itself through `$$`, and `cmd.exe`
 * has no equivalent. Windows is unverified.
 */

let harness: Harness;

test.beforeAll(async () => {
  harness = await launchApp();
});

test.afterAll(async () => {
  await closeApp(harness);
});

test('closing a window reaps its shells and leaves the application running', async () => {
  test.skip(
    process.platform === 'win32',
    'No portable way to read a shell process id from cmd.exe.',
  );

  await resetShell(harness);
  const { app, window } = harness;

  await window.click('[data-testid="tab-new"]');
  const terminal = window.locator('[data-testid="terminal"]').last();
  await expect(terminal.locator('canvas').first()).toBeVisible({ timeout: 20_000 });
  await terminal.click();

  await window.keyboard.type('echo SHELL_PID:$$');
  await window.keyboard.press('Enter');

  const screen = () => terminalScreen(terminal);

  await expect
    .poll(screen, { timeout: 20_000, message: 'the shell never reported its pid' })
    .toMatch(/SHELL_PID:\d+/);

  const pid = Number(/SHELL_PID:(\d+)/.exec(await screen())?.[1]);

  // The floor. Without a real pid every check below asks about nothing, and a
  // test that found no process would report the reaping as correct.
  expect(pid).toBeGreaterThan(0);

  const isAlive = (target: number) =>
    app.evaluate(
      (_electron, value) => {
        try {
          process.kill(value, 0);
          return true;
        } catch {
          return false;
        }
      },
      target,
    );

  expect(await isAlive(pid)).toBe(true);

  // Keeps the application alive across the close, and is the second window
  // this shell does not otherwise have.
  await app.evaluate(({ BrowserWindow }) => {
    new BrowserWindow({ show: false });
  });

  const handle = await app.browserWindow(window);
  await handle.evaluate((target) => {
    target.close();
  });

  await expect
    .poll(() => isAlive(pid), {
      timeout: 15_000,
      message: 'the shell outlived the window that opened it',
    })
    .toBe(false);

  // The application is still up, so quit-time cleanup is not what killed it.
  expect(harness.app.process().exitCode).toBeNull();
});

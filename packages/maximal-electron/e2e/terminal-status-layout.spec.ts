import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { closeApp, launchApp, terminalScreen, type Harness } from './harness.js';

let harness: Harness;

test.beforeEach(async () => {
  harness = await launchApp({}, {
    args: ['--terminal-lab'],
    readySelector: '.terminal-lab',
  });
});

test.afterEach(async () => {
  await closeApp(harness);
});

async function statusbarOverlap(window: Page): Promise<number> {
  return window.evaluate(() => {
    const statusbar = document.querySelector('.statusbar');
    const host = document.querySelector('.terminal-host');
    const wterm = document.querySelector('.wterm');
    if (!statusbar || !host || !wterm) return NaN;
    const statusbarTop = statusbar.getBoundingClientRect().top;
    const contentBottom = Math.max(
      host.getBoundingClientRect().bottom,
      wterm.getBoundingClientRect().bottom,
    );
    return contentBottom - statusbarTop;
  });
}

for (const emulator of ['xterm.js', 'Ghostty'] as const) {
  test(`${emulator}: the terminal never renders under the status bar, at default or shrunk window size`, async () => {
    const window = harness.window;
    const terminal = window.locator('[data-testid="terminal"]:visible');
    await expect.poll(() => terminalScreen(terminal)).toContain('Maximal Terminal Lab');
    await window.getByRole('button', { name: emulator }).click();

    expect(await statusbarOverlap(window)).toBeLessThanOrEqual(0);

    await terminal.click();
    await window.keyboard.type('flood 150 3');
    await window.keyboard.press('Enter');
    await expect.poll(() => terminalScreen(terminal), { timeout: 20_000 }).toContain('line 0150 of 0150');
    expect(await statusbarOverlap(window)).toBeLessThanOrEqual(0);

    await harness.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(500, 320);
    });
    await expect.poll(() => statusbarOverlap(window)).toBeLessThanOrEqual(0);
  });
}

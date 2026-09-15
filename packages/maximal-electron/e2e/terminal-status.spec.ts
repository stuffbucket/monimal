import { expect, test } from '@playwright/test';

import { closeApp, launchApp, terminalScreen, type Harness } from './harness.js';

let harness: Harness;

test.beforeAll(async () => {
  harness = await launchApp({}, {
    args: ['--terminal-lab'],
    readySelector: '.terminal-lab',
  });
});

test.afterAll(async () => {
  await closeApp(harness);
});

test('status reports OS, PTY, and emulator-reported sizes for cross-checking', async () => {
  const window = harness.window;
  await window.getByRole('button', { name: 'xterm.js' }).click();
  const terminal = window.locator('[data-testid="terminal"]:visible');
  await expect.poll(() => terminalScreen(terminal)).toContain('Maximal Terminal Lab');

  await terminal.click();
  await window.keyboard.type('status');
  await window.keyboard.press('Enter');

  await expect
    .poll(() => terminalScreen(terminal), { timeout: 5_000 })
    .toMatch(/os=\d+x\d+\s+pty=\d+x\d+\s+wterm=\d+x\d+/u);
});

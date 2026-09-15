import { expect, test, type Locator, type Page } from '@playwright/test';

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

function screen(terminal: Locator): Promise<string> {
  return terminalScreen(terminal);
}

/**
 * Splits the active tab, floods the second pane with continuous output while
 * focus stays on the first, and returns the unfocused pane's locator once the
 * flood has finished printing.
 */
async function floodUnfocusedSplit(window: Page): Promise<Locator> {
  const terminal = window.locator('[data-testid="terminal"]:visible');
  await expect.poll(() => screen(terminal)).toContain('Maximal Terminal Lab');

  await terminal.first().click();
  await window.keyboard.press('Meta+d');
  await expect(window.locator('.terminal-split')).toBeVisible();
  await expect(terminal).toHaveCount(2);

  // Focus stays on the first pane; the second pane floods without ever
  // taking focus, matching a background split a user isn't looking at.
  const unfocused = terminal.last();
  await unfocused.click();
  await window.keyboard.type('flood 200 5');
  await window.keyboard.press('Enter');
  // Move focus back to the first pane immediately, before the flood starts
  // printing, so the flooding pane runs the whole time unfocused.
  await window.keyboard.press('Meta+[');
  await expect(window.locator('.terminal:visible[data-focused="true"]')).toHaveCount(1);

  await expect.poll(() => screen(unfocused), { timeout: 20_000 }).toContain('line 0200 of 0200');
  return unfocused;
}

test('xterm.js: an unfocused split pane keeps its scroll pinned to the tail of continuous output', async () => {
  const window = harness.window;
  // The emulator toggle is a persisted preference; pin it so this test is
  // deterministic regardless of what an earlier run left behind.
  await window.getByRole('button', { name: 'xterm.js' }).click();

  const unfocused = await floodUnfocusedSplit(window);

  // Pinned to bottom, not lagging behind by a few lines: xterm's viewport
  // offset should equal the base of the bottom page once output settles.
  await expect.poll(() => unfocused.evaluate((node) => {
    const term = (node as HTMLElement & {
      __terminal?: { buffer: { active: { viewportY: number; baseY: number } } };
    }).__terminal!;
    return term.buffer.active.viewportY - term.buffer.active.baseY;
  })).toBe(0);
});

test('ghostty: an unfocused split pane keeps its scroll pinned to the tail of continuous output', async () => {
  const window = harness.window;
  await window.getByRole('button', { name: 'Ghostty' }).click();

  const unfocused = await floodUnfocusedSplit(window);

  // Ghostty renders its rows as real DOM nodes and scrolls the host element
  // directly (see `scrollToBottom` in terminal-emulator.ts), so the host's
  // own scrollTop is the source of truth for whether it is pinned to the
  // tail rather than lagging behind by a few lines.
  await expect.poll(() => unfocused.evaluate((node) => {
    const scrollGap = node.scrollHeight - node.clientHeight - node.scrollTop;
    return scrollGap;
  })).toBeLessThanOrEqual(1);
});

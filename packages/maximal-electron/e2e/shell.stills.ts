import { expect, test } from '@playwright/test';

import { capture, closeApp, launchApp, resetShell, type Harness } from './harness.js';

/**
 * Reference images of the production shell.
 *
 * A developer tool. `npm run stills` produces these; nothing in CI does, and
 * nothing fails because one of them is wrong. They exist for the README and
 * for looking at a change, which is a different job from proving one.
 *
 * Each still still asserts that the right thing is on screen before it writes,
 * because an image of the wrong view is worse than no image. What changed is
 * where that failure lands: in a run somebody asked for, rather than in the
 * gate on somebody else's pull request.
 */

let harness: Harness;

test.beforeAll(async () => {
  harness = await launchApp();
});

test.beforeEach(async () => {
  await resetShell(harness);
});

test.afterAll(async () => {
  await closeApp(harness);
});

test('the shell', async () => {
  const { window } = harness;
  // `resetShell` already put the shell in the library grid view.
  await expect(window.locator('[data-testid="canvas"]')).toBeVisible();
  await capture(window, 'test-results/shell.png');
});

test('a terminal', async () => {
  const { window } = harness;

  await window.click('[data-testid="tab-new"]');
  const terminal = window.locator('[data-testid="terminal"]').last();
  await expect(terminal.locator('canvas').first()).toBeVisible({
    timeout: 20_000,
  });

  await capture(window, 'test-results/terminal.png');
});

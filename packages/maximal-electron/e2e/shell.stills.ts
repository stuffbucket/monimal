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

test('the overlay', async () => {
  const { app, window } = harness;

  // The overlay is a non-activating panel, parked off the side of the display
  // under `STUFFBUCKET_E2E`. A desktop session composites it; a headless
  // runner does not, which is one of the reasons this is not a CI job.
  await window.click('[data-testid="toggle-overlay"]');
  const overlay =
    app.windows().find((page) => page.url().includes('overlay')) ??
    (await app.waitForEvent('window', { timeout: 15_000 }));
  await overlay.waitForSelector('[data-testid="overlay-card"]', {
    timeout: 15_000,
  });

  await capture(overlay, 'test-results/overlay.png');

  await overlay.keyboard.press('Escape');
});

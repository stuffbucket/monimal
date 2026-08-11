import { expect, test } from '@playwright/test';

import { closeApp, launchApp, resetShell, type Harness } from './harness.js';

/**
 * The first-run model download.
 *
 * Exercises the real path: the card offers the download, `model:ensure` runs
 * it, progress arrives as events, and the provider becomes ready without the
 * user dismissing and summoning again.
 *
 * Skipped unless the run pins the embedded provider and names a target the
 * weights may be written to:
 *
 *     STUFFBUCKET_PROVIDER=embedded \
 *     STUFFBUCKET_MODEL_PATH=~/.cache/stuffbucket-models/Qwen3-0.6B-Q8_0.gguf \
 *     npx playwright test download
 *
 * Not in the default suite. It pulls several hundred megabytes.
 */
const PINNED =
  process.env['STUFFBUCKET_PROVIDER'] === 'embedded' &&
  Boolean(process.env['STUFFBUCKET_MODEL_PATH']);

let harness: Harness;

test.beforeAll(async () => {
  test.skip(!PINNED, 'Set STUFFBUCKET_PROVIDER and STUFFBUCKET_MODEL_PATH to run this.');
  harness = await launchApp();
});

test.afterAll(async () => {
  await closeApp(harness);
});

test('the card offers the model, downloads it, and becomes ready', async () => {
  await resetShell(harness);
  const { app, window } = harness;

  await window.click('[data-testid="toggle-overlay"]');
  const overlay =
    app.windows().find((page) => page.url().includes('overlay')) ??
    (await app.waitForEvent('window', { timeout: 15_000 }));
  await overlay.waitForSelector('[data-testid="overlay-card"]', { timeout: 15_000 });

  const setup = overlay.locator('[data-testid="overlay-setup"]');
  const ready = overlay
    .locator('[data-testid="overlay-status"]')
    .filter({ hasText: 'embedded' });

  // Already downloaded from an earlier run is a pass, not a skip: the point is
  // that the card ends up ready.
  if (await setup.isVisible()) {
    // The size is stated before anything is fetched.
    await expect(setup).toContainText('MB');
    await overlay.click('[data-testid="overlay-download-start"]');

    // Progress is reported rather than the card simply hanging.
    await expect(overlay.locator('[data-testid="overlay-download"]')).toBeVisible({
      timeout: 30_000,
    });

    await expect(overlay.locator('[data-testid="overlay-download-error"]')).toHaveCount(
      0,
    );
  }

  // Re-probed on its own once the download finished.
  await expect(ready).toBeVisible({ timeout: 600_000 });
  await expect(setup).toBeHidden();

  await overlay.keyboard.press('Escape');
});

import { expect, test } from '@playwright/test';

import { closeApp, launchApp, resetShell, type Harness } from './harness.js';

/**
 * The embedded provider, end to end.
 *
 * This runs the model inside the application rather than talking to a proxy,
 * which is the path that makes the app work with nothing installed. It is the
 * only path that cannot be reached by discovery on a development machine,
 * because a running proxy always outranks it.
 *
 * Skipped unless the run pins it:
 *
 *     STUFFBUCKET_PROVIDER=embedded \
 *     STUFFBUCKET_MODEL_PATH=/path/to/Qwen3-0.6B-Q8_0.gguf \
 *     npx playwright test embedded
 *
 * Not in the default suite on purpose. It loads several hundred megabytes of
 * weights, which is not a cost every run should pay.
 */
const PINNED = process.env['STUFFBUCKET_PROVIDER'] === 'embedded';

let harness: Harness;

test.beforeAll(async () => {
  test.skip(!PINNED, 'Set STUFFBUCKET_PROVIDER=embedded to run this.');
  harness = await launchApp();
});

test.afterAll(async () => {
  await closeApp(harness);
});

test('the embedded model answers and uses a tool', async () => {
  // Loading several hundred megabytes of weights and generating on them is far
  // slower than any other scenario here, so the suite default does not fit.
  test.setTimeout(300_000);

  await resetShell(harness);
  const { app, window } = harness;

  await window.click('[data-testid="toggle-overlay"]');
  const overlay =
    app.windows().find((page) => page.url().includes('overlay')) ??
    (await app.waitForEvent('window', { timeout: 15_000 }));
  await overlay.waitForSelector('[data-testid="overlay-card"]', { timeout: 15_000 });

  // Discovery must have chosen the embedded provider, not a proxy.
  await expect(overlay.locator('[data-testid="overlay-status"]')).toContainText(
    'embedded',
    { timeout: 20_000 },
  );

  const theme = () =>
    window.evaluate(() => document.documentElement.getAttribute('data-theme'));

  await overlay.fill(
    '[data-testid="overlay-input"]',
    'Switch this application to the light theme.',
  );
  await overlay.keyboard.press('Enter');

  // Loading the weights happens on the first call, so this is the slow one.
  // Surface whatever the card says if the prompt never reaches the gate: an
  // engine failure lands in the answer box, and a bare "not visible" hides it.
  const approval = overlay.locator('[data-testid="overlay-approval"]');
  try {
    await expect(approval).toBeVisible({ timeout: 240_000 });
  } catch (error) {
    const said = await overlay
      .locator('[data-testid="overlay-answer"]')
      .textContent()
      .catch(() => null);
    const status = await overlay
      .locator('[data-testid="overlay-status"]')
      .textContent()
      .catch(() => null);
    throw new Error(
      `No approval prompt. status=${String(status)} answer=${String(said)}`,
      { cause: error },
    );
  }
  await overlay.click('[data-testid="overlay-allow"]');

  await expect.poll(theme, { timeout: 60_000 }).toBe('light');

  await overlay.keyboard.press('Escape');
});

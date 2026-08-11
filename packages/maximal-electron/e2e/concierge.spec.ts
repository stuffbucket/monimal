import { expect, test } from '@playwright/test';

import {
  closeApp,
  getPrefs,
  launchApp,
  providerStatus,
  resetShell,
  setPrefs,
  type Harness,
} from './harness.js';
import { SCRIPTED_MODEL, startScriptedModel, type ScriptedModel } from './model-server.js';

/**
 * The concierge loop, end to end.
 *
 * This is the scenario the whole `app` toolset exists for: a request, the agent
 * calling a named tool, the gate classifying it, and the running application
 * changing as a result.
 *
 * The property worth protecting is that `set_theme` needs **no renderer
 * wiring**. The tool runs in the main process, `setPreferences` broadcasts
 * `prefs:changed`, and the shell already tracks that event, so the window
 * repaints on its own. A future refactor that routes this through a new IPC
 * channel has made the design worse, and this test should fail.
 *
 * The model comes from `e2e/model-server.ts`, so this needs no backend and runs
 * on a machine that has none. What a scripted reply costs is stated there: the
 * script picks `set_theme` because a regular expression matched the prompt, so
 * this covers the gate, the tool, and the repaint, and not whether a real model
 * would have chosen the same tool.
 */
let harness: Harness;
let model: ScriptedModel;

test.beforeAll(async () => {
  model = await startScriptedModel();
  harness = await launchApp({
    STUFFBUCKET_PROVIDER: 'ollama',
    STUFFBUCKET_PROVIDER_URL: model.baseUrl,
  });
});

test.afterAll(async () => {
  await closeApp(harness);
  await model.stop();
});

test('the overlay agent flips the shell theme', async () => {
  await resetShell(harness);
  const { app, window } = harness;

  const theme = () =>
    window.evaluate(() => document.documentElement.getAttribute('data-theme'));

  // The gate keys off the preference, and preferences persist across a run.
  // Stating it here rather than trusting the default is what makes this
  // independent of whatever ran before it.
  const before = await getPrefs(window);
  await setPrefs(window, { agentApproval: 'writes', agentToolsets: ['app'] });

  try {
    await window.click('[data-testid="toggle-overlay"]');
    const overlay =
      app.windows().find((page) => page.url().includes('overlay')) ??
      (await app.waitForEvent('window', { timeout: 15_000 }));
    await overlay.waitForSelector('[data-testid="overlay-card"]', { timeout: 15_000 });

    // The floor. Every assertion below is about a run against the scripted
    // backend, so a run that found something else proves nothing.
    await expect
      .poll(() => providerStatus(overlay), { timeout: 15_000 })
      .toEqual({ state: 'ready', provider: 'ollama', model: SCRIPTED_MODEL });

    await overlay.fill(
      '[data-testid="overlay-input"]',
      'Switch this application to the light theme.',
    );
    await overlay.keyboard.press('Enter');

    // set_theme is `mutating`, so the gate must ask first.
    const approval = overlay.locator('[data-testid="overlay-approval"]');
    await expect(approval).toBeVisible({ timeout: 30_000 });
    await expect(
      overlay.locator('[data-testid="overlay-approval-summary"]'),
    ).toContainText('light');

    await overlay.click('[data-testid="overlay-allow"]');

    // The shell repaints with no renderer change and no new IPC channel.
    await expect.poll(theme, { timeout: 30_000 }).toBe('light');

    // The backend was asked, twice: once for the tool call and once with the
    // tool's result. A theme that changed for any other reason fails here.
    expect(model.calls.length, 'the scripted backend answered').toBeGreaterThan(1);

    await overlay.keyboard.press('Escape');
  } finally {
    // The theme persists, and the shell suite has a scenario that reads the
    // terminal's colours out of whatever it is now.
    await setPrefs(window, before);
  }
});

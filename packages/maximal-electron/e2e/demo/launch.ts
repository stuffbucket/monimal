import path from 'node:path';

import { _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

import { setTheme } from '../harness.js';

/**
 * Launch the demo shell.
 *
 * `e2e/harness.ts` deliberately launches the production shell, and it is not
 * this file's to change. The demo needs one extra environment variable, so
 * this mirrors the harness rather than editing it. The same split already
 * exists in `e2e/demo-stills.stills.ts`, for the same reason.
 *
 * `STUFFBUCKET_DEMO=1` makes the main process load the fixture's own renderer
 * bundle, built from `e2e/fixtures/demo-shell/`, instead of the product's.
 * Nothing else in the application behaves differently.
 *
 * `STUFFBUCKET_E2E=1` keeps the profile out of the developer's real user data
 * directory, and parks the windows out of their way.
 */

const ROOT = path.resolve(__dirname, '../..');

export interface DemoHarness {
  app: ElectronApplication;
  window: Page;
}

/**
 * Find the shell window.
 *
 * The splash is a real window, and a handle to it dies the moment it closes.
 * `STUFFBUCKET_E2E` disables the splash, and this scan is the second guard.
 */
async function shellWindow(app: ElectronApplication): Promise<Page> {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    for (const candidate of app.windows()) {
      if (candidate.isClosed()) continue;
      if (candidate.url().includes('splash')) continue;
      return candidate;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error('No shell window appeared within 30 seconds.');
}

export async function launchDemoApp(): Promise<DemoHarness> {
  const app = await electron.launch({
    args: [ROOT],
    cwd: ROOT,
    env: {
      ...process.env,
      STUFFBUCKET_E2E: '1',
      STUFFBUCKET_DEMO: '1',
    },
  });

  const window = await shellWindow(app);
  await window.waitForSelector('[data-testid="titlebar"]', { timeout: 30_000 });

  // No motion, so a captured frame never lands halfway through a transition.
  await window.emulateMedia({ reducedMotion: 'reduce' });
  await window.addStyleTag({
    content: '*,*::before,*::after{animation:none!important;transition:none!important}',
  });

  // The theme is a persisted preference, and the last recording ended by
  // changing it. Start every run from the same picture.
  await setTheme(window, 'dark');

  return { app, window };
}

/**
 * Set the theme through the preference bridge.
 *
 * Re-exported so a demo timeline has one import for everything it needs to
 * drive the shell. The implementation is shared with the production suite.
 */
export { setTheme };

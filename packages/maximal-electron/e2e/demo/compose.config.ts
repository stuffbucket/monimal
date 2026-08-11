import { defineConfig } from '@playwright/test';

/**
 * Configuration for composing alone.
 *
 * Playwright is a runner here, not a test framework. It transpiles the
 * TypeScript and resolves the `.js` import specifiers this repository uses,
 * which plain Node does not, and it is already a dependency. Nothing in a
 * compose run launches a browser or an application.
 *
 * Files ending in `.compose.ts` keep this separate from the timelines in
 * `.demo.ts` and the suite in `.spec.ts`, so no runner ever picks up another's
 * files.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.compose.ts',
  // Proves ffmpeg is installed, and pins the paths it verified.
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 5 * 60_000,
  expect: { timeout: 30_000 },
  use: { trace: 'off', screenshot: 'off', video: 'off' },
});

import { defineConfig } from '@playwright/test';

/**
 * End-to-end configuration.
 *
 * Determinism rules come from `stuffbucket/maximal`'s `ui-layout-verification`
 * skill: motion off, reduced-motion forced, fixed viewport. Without those a
 * screenshot baselined on one machine fails on the next for no real reason.
 */
export default defineConfig({
  testDir: './e2e',
  // Picks the shuffle seed once, before workers spawn. See the file for why
  // that cannot live in the spec.
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  // Electron holds a single-instance lock, so tests must not race each other.
  workers: 1,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'list' : [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});

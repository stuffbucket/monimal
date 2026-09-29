import { defineConfig } from '@playwright/test';

/**
 * Reference image capture.
 *
 * A developer tool, deliberately outside `playwright.config.ts` and outside
 * CI. These runs drive the shell to produce PNGs for the README and the screen
 * recording; they assert that the right thing is on screen first, but their
 * product is an image, not a verdict.
 *
 * They stayed in the blocking suite for a while, and it went badly in both
 * directions. A runner that cannot composite an off-screen panel failed a
 * behaviour test over a blank artifact, and a window that happened not to be
 * key rewrote two rows of every still. Neither says anything about whether the
 * application works.
 *
 * The `.stills.ts` suffix is what keeps them out. Playwright's default match
 * is `*.spec.ts`, so the blocking config never sees this file.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.stills.ts',
  // Refuses to photograph a build older than the source it came from.
  globalSetup: './stills-setup.ts',
  fullyParallel: false,
  // Electron holds a single-instance lock, so these must not race each other.
  workers: 1,
  reporter: [['list']],
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: { trace: 'retain-on-failure' },
});

import { defineConfig } from '@playwright/test';

/**
 * Configuration for the screen recorder.
 *
 * Separate from `playwright.config.ts` on purpose. A recording is not a test:
 * it takes minutes, it drives one long uninterrupted timeline, and a retry
 * would leave half an mp4 behind. Keeping it out of the ordinary suite also
 * keeps `npm run test:e2e` fast.
 *
 * The two never collide. This one matches `*.demo.ts`, and the suite matches
 * the Playwright default of `*.spec.ts`, so neither file set is visible to the
 * other runner.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.demo.ts',
  // Proves `ffmpeg` and `ffprobe` are installed before a timeline launches
  // anything, and pins the paths it verified.
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  // Electron holds a single-instance lock. One recording at a time.
  workers: 1,
  retries: 0,
  reporter: [['list']],
  // A timeline runs for a minute, and the encode follows it.
  timeout: 10 * 60_000,
  expect: { timeout: 30_000 },
  use: { trace: 'off', screenshot: 'off', video: 'off' },
});

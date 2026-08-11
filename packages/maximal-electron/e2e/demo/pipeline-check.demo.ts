import { expect, test } from '@playwright/test';

import { closeApp, launchApp, resetShell, type Harness } from '../harness.js';
import { record, sequence } from './recorder.js';

/**
 * The self-contained proof that the recorder works.
 *
 * Every scene here drives the shell as it stands today, with no fixture data
 * and no dependency on anything else in the suite. The point is to exercise
 * the pipeline end to end: pacing rules, capture, dips between scenes, and the
 * encode. It doubles as a short tour of the application.
 *
 * Run it with `npm run record`, not with `npm run test:e2e`. The file name
 * ends in `.demo.ts` so the ordinary end-to-end run never picks it up.
 */


/** Long enough for the whole timeline, the encode, and a slow terminal. */
test.setTimeout(10 * 60_000);

test('records a demonstration of the shell', async () => {
  let harness: Harness | undefined;

  try {
    harness = await launchApp();
    // A known starting frame, so the video does not open on leftover state.
    await resetShell(harness);

    const { app, window } = harness;

    const result = await record({
      app,
      shell: window,
      name: 'pipeline-check',
      sequences: [
        sequence({
          id: 'shell',
          name: 'Stuffbucket',
          note: 'A three panel shell: navigation, canvas, inspector',
          async drive({ shell }) {
            await shell.locator('.card').nth(2).click();
            await shell.waitForTimeout(1_200);
            await shell.locator('.card').nth(5).click();
          },
        }),

        sequence({
          id: 'navigation',
          name: 'One navigation, many views',
          note: 'The left rail swaps what the canvas holds',
          async drive({ shell }) {
            for (const view of ['recents', 'drafts', 'shared', 'trash']) {
              await shell.click(`[data-testid="nav-${view}"]`);
              await shell.waitForTimeout(900);
            }
            await shell.click('[data-testid="nav-library"]');
          },
        }),

        sequence({
          id: 'layout',
          name: 'Grid or list',
          note: 'The same items, laid out two ways',
          async drive({ shell }) {
            await shell.click('[data-testid="mode-list"]');
            await expect(shell.locator('[data-testid="view-list"]')).toBeVisible();
            await shell.waitForTimeout(1_000);
            await shell.locator('.row, .card').first().click();
            await shell.waitForTimeout(1_200);
            await shell.click('[data-testid="mode-grid"]');
          },
        }),

        sequence({
          id: 'panels',
          name: 'Fold the panels away',
          note: 'Both sides collapse, and the canvas takes the room',
          async drive({ shell }) {
            await shell.click('[data-testid="toggle-right"]');
            await shell.waitForTimeout(1_000);
            await shell.click('[data-testid="toggle-left"]');
            await shell.waitForTimeout(1_400);
            await shell.click('[data-testid="toggle-left"]');
            await shell.waitForTimeout(700);
            await shell.click('[data-testid="toggle-right"]');
          },
        }),

        sequence({
          id: 'terminal',
          name: 'A real terminal in a tab',
          note: 'Ghostty over a native pseudo terminal',
          async drive({ shell }) {
            await shell.click('[data-testid="tab-new"]');
            const terminal = shell.locator('[data-testid="terminal"]').last();
            await expect(terminal.locator('canvas').first()).toBeVisible({
              timeout: 30_000,
            });
            await terminal.click();
            await shell.waitForTimeout(600);
            await shell.keyboard.type('echo hello from the stuffbucket shell', {
              delay: 55,
            });
            await shell.waitForTimeout(500);
            await shell.keyboard.press('Enter');
            await shell.waitForTimeout(900);
            await shell.keyboard.type('uname -sm', { delay: 70 });
            await shell.keyboard.press('Enter');
          },
        }),

        sequence({
          id: 'overlay',
          name: 'Ask, without leaving the app',
          note: 'A floating overlay, summoned over anything',
          caption: 'top',
          async target({ app: application, shell }) {
            await shell.click('[data-testid="toggle-overlay"]');
            const overlay =
              application.windows().find((page) => page.url().includes('overlay')) ??
              (await application.waitForEvent('window', { timeout: 20_000 }));
            await overlay.waitForSelector('[data-testid="overlay-card"]', {
              timeout: 20_000,
            });

            // Match the shell's shape, and inherit its position, which a quiet
            // run has already moved out of the user's way.
            const shellHandle = await application.browserWindow(shell);
            const bounds = await shellHandle.evaluate((win) => win.getBounds());
            const overlayHandle = await application.browserWindow(overlay);
            await overlayHandle
              .evaluate((win, box) => {
                win.setBounds(box);
              }, bounds)
              .catch(() => undefined);

            await overlay.waitForTimeout(500);
            return overlay;
          },
          async drive({ app: application }) {
            const overlay = application
              .windows()
              .find((page) => page.url().includes('overlay'));
            if (!overlay) throw new Error('The overlay window went away.');

            await overlay.click('[data-testid="overlay-input"]');
            await overlay.keyboard.type(
              'In one sentence, what does an Electron main process do?',
              { delay: 45 },
            );

            // Send only when something is actually listening. A contributor
            // with no local model still gets a video, ending on the typed
            // question and the status line that explains why.
            const status =
              (await overlay
                .locator('[data-testid="overlay-status"]')
                .textContent()) ?? '';
            if (status.includes('Waiting') || status.includes('No local model')) {
              return;
            }

            await overlay.keyboard.press('Enter');
            // A fixed watch rather than an assertion. The recording must not
            // fail because a local model was slow.
            await overlay.waitForTimeout(7_000);
          },
        }),
      ],
    });

    process.stdout.write(
      `\n  ${result.output}\n` +
        `  capture: ${result.method}, ${String(result.frames)} frames\n` +
        `  ${result.probe.seconds.toFixed(2)}s, ${result.probe.codec}, ` +
        `${String(result.probe.width)}x${String(result.probe.height)}, ` +
        `${String(result.probe.frameRate)} fps, ` +
        `${(result.probe.bytes / 1e6).toFixed(2)} MB\n\n`,
    );

    expect(result.probe.seconds).toBeGreaterThanOrEqual(30);
    expect(result.probe.codec).toBe('h264');
  } finally {
    await closeApp(harness);
  }
});

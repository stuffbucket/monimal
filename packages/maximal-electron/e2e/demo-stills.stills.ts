import path from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

import { capture, closeApp } from './harness.js';

/**
 * Still images of the demo shell, for the README and the screen recording.
 *
 * These are documentation artifacts rather than assertions. Each test drives
 * the shell into one scenario, proves on screen that the scenario really is
 * showing, and then writes a PNG to `demo/stills/`. `test-results/` is ignored
 * by git; `demo/` is not, so these images are committable.
 *
 * The demo shell is opt in. `STUFFBUCKET_DEMO=1` makes the main process load
 * the fixture's own renderer bundle, built from `e2e/fixtures/demo-shell/`,
 * instead of the product's. That bundle is not in the package, so an installed
 * application cannot reach it however the variable is set.
 *
 * Why this launches its own application rather than reusing `launchApp`: the
 * harness deliberately launches the production shell, and the demo needs one
 * extra environment variable. Everything else, including `capture`, is shared.
 */

const ROOT = path.resolve(__dirname, '..');
const STILLS = path.join(ROOT, 'demo', 'stills');

let app: ElectronApplication;
let window: Page;

/** Determinism: no motion, so a capture never races a transition. */
async function settle(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addStyleTag({
    content: '*,*::before,*::after{animation:none!important;transition:none!important}',
  });
}

test.beforeAll(async () => {
  app = await electron.launch({
    args: [ROOT],
    cwd: ROOT,
    env: {
      ...process.env,
      // A throwaway profile, and windows parked off the developer's screen.
      STUFFBUCKET_E2E: '1',
      STUFFBUCKET_DEMO: '1',
    },
  });

  window = await app.firstWindow();
  // The splash is a real window. `STUFFBUCKET_E2E` disables it, and this is the
  // second guard.
  if (window.url().includes('splash')) {
    window = await app.waitForEvent('window', { timeout: 30_000 });
  }

  await window.waitForSelector('[data-testid="titlebar"]', { timeout: 30_000 });
  await settle(window);
});

test.afterAll(async () => {
  await closeApp(app ? { app } : undefined);
});

/**
 * Return to the state a fresh launch produces.
 *
 * A reload is the reset, rather than a sequence of clicks: the demo tree holds
 * every bit of its state in React, so remounting it is both exact and short.
 * No test may depend on the one before it.
 */
test.beforeEach(async () => {
  await window.reload();
  await window.waitForSelector('[data-testid="titlebar"]', { timeout: 30_000 });
  await settle(window);
});

/* ------------------------------------------------------------ the stills */

test('01 projects and agents, grid mode', async () => {
  // Nothing selected, so the inspector shows the fleet rather than one run.
  await expect(window.locator('[data-testid="left-nav"]')).toContainText(
    'maximal-core',
  );
  // The fleet opens as a list, so this asks for the grid rather than assuming
  // it. A still that depends on a default breaks when the default is the thing
  // being changed.
  await window.click('[data-testid="mode-grid"]');
  await expect(window.locator('[data-testid="view-grid"]')).toBeVisible();
  await expect(window.locator('.run-card')).toHaveCount(17);
  await expect(window.locator('[data-testid="inspector"]')).toContainText('Fleet');

  await capture(window, path.join(STILLS, '01-projects.png'));
});

test('02 an agent run selected, inspector populated', async () => {
  // A blocked run, because it is the one that also shows the approval gate.
  await window.click('[data-testid="run-run-102"]');

  const inspector = window.locator('[data-testid="inspector"]');
  await expect(inspector).toContainText('Agent run');
  await expect(inspector).toContainText('claude-sonnet-4-6');
  await expect(inspector).toContainText('Tool calls');
  await expect(window.locator('[data-testid="approval"]')).toBeVisible();

  await capture(window, path.join(STILLS, '02-agent-detail.png'));
});

test('03 several agent sessions and a terminal open', async () => {
  // The three session tabs ship with the demo; the `+` adds the terminal.
  await expect(window.locator('.tab')).toHaveCount(3);
  await window.click('[data-testid="tab-new"]');
  await expect(window.locator('.tab')).toHaveCount(4);

  // Back to a session tab, so the canvas shows the fleet behind the strip.
  await window.locator('.tab').first().click();
  await window.click('[data-testid="mode-grid"]');
  await expect(window.locator('[data-testid="view-grid"]')).toBeVisible();
  await expect(window.locator('[data-testid="inspector"]')).toContainText(
    'Refactor auth middleware',
  );

  await capture(window, path.join(STILLS, '03-multi-agent-tabs.png'));
});

test('04 list mode as a run queue', async () => {
  await window.click('[data-testid="mode-list"]');
  await expect(window.locator('[data-testid="view-list"]')).toBeVisible();
  await expect(window.locator('.run-row')).toHaveCount(17);

  await window.click('[data-testid="run-run-301"]');
  await expect(window.locator('[data-testid="inspector"]')).toContainText(
    'macos-builder',
  );

  await capture(window, path.join(STILLS, '04-list-mode.png'));
});

test('05 a terminal tab with plausible output', async () => {
  // The canned session below is POSIX shell. The demo spawns `/bin/sh` for a
  // prompt that carries no developer's name; Windows gets its own shell, and
  // none of this would run there.
  test.skip(process.platform === 'win32', 'The canned session is POSIX shell.');

  await window.click('[data-testid="tab-new"]');

  const terminal = window.locator('[data-testid="terminal"]').last();
  await expect(terminal.locator('canvas').first()).toBeVisible({
    timeout: 20_000,
  });
  await terminal.click();

  // Define the command, then clear. What stays on screen is one plausible
  // invocation and its output; the setup scrolls away with the clear.
  const rows = [
    'ID       PROJECT        TASK                          STATUS          ELAPSED  TOKENS',
    'run-101  maximal-core   refactor auth middleware      running         12m 04s  184.2k',
    'run-102  maximal-core   flaky provider retry triage   needs approval   4m 41s   61.8k',
    'run-103  maximal-core   bump pi-agent-core            running          2m 18s   22.4k',
    'run-201  shell          inspector density pass        running          9m 33s   96.5k',
    'run-202  shell          scroll the tab strip          needs approval   1m 56s   17.9k',
    'run-301  macos-builder  retry notarisation on 5xx     running         16m 21s   73.4k',
    'run-401  wiggle         double tap of Ctrl            running          5m 12s   81.7k',
    '',
    '17 runs, 5 running, 2 waiting on approval, 1 failed',
  ];

  const quoted = rows.map((row) => `'${row}'`).join(' ');

  for (const line of [
    "PS1='~/src/maximal-core $ '",
    `stuffbucket() { printf '%s\\n' ${quoted}; }`,
    'clear',
    'stuffbucket agents ls',
  ]) {
    await window.keyboard.type(line);
    await window.keyboard.press('Enter');
    // Let the shell echo and repaint before the next line goes in. Typing over
    // the top of `clear` leaves a stray character on the first row.
    await window.waitForTimeout(500);
  }

  // Read the emulator's own buffer. The terminal draws to a canvas, so there is
  // no DOM text, and a capture of an empty screen would look like success.
  await expect
    .poll(
      () =>
        terminal.evaluate((node) => {
          const term = (node as HTMLElement & { __terminal?: unknown })
            .__terminal as
            | {
                buffer: {
                  active: {
                    length: number;
                    getLine: (
                      y: number,
                    ) => { translateToString: (trim?: boolean) => string } | undefined;
                  };
                };
              }
            | undefined;
          if (!term) return '';

          const active = term.buffer.active;
          const lines: string[] = [];
          for (let y = 0; y < active.length; y += 1) {
            lines.push(active.getLine(y)?.translateToString(true) ?? '');
          }
          return lines.join('\n');
        }),
      { timeout: 30_000, message: 'the terminal never printed the run table' },
    )
    .toContain('run-301');

  await capture(window, path.join(STILLS, '05-terminal.png'));
});

import path from 'node:path';

import { expect, test } from '@playwright/test';
import type { ElectronApplication, Locator, Page } from '@playwright/test';

import { closeApp } from '../harness.js';
import { launchDemoApp, setTheme, type DemoHarness } from './launch.js';
import { record, sequence, type SequenceDef } from './recorder.js';

/**
 * The product video: a shell that orchestrates coding agents.
 *
 * Everything here is real. The fleet is fixture data, and says so in
 * `e2e/fixtures/demo-shell/runs.ts`, but the terminal runs a real `claude`, and
 * the overlay talks to a real local model through the real approval gate. The
 * closing shot changes the theme of the running application because the agent
 * called `set_theme`, not because the timeline clicked a toggle.
 *
 * Run it with `npm run record -- --grep workflow`.
 *
 * Pacing note, which matters more than it sounds: each scene makes its visible
 * change **early** and spends its hold on the result. A scene that flips the
 * theme on its last line holds on the picture before the change.
 */

const ROOT = path.resolve(__dirname, '../..');

/**
 * The overlay window is sized for the shot rather than for the desktop.
 *
 * In production it covers the display and dims whatever is behind it. A
 * capture reads the renderer, so there is nothing behind it to dim, and a full
 * screen window spends most of the frame on empty scrim. The card is 680
 * pixels wide and sits 18vh from the bottom, so a small window both enlarges
 * it in the finished frame and leaves enough room above for a streamed answer
 * or an approval prompt. This shape is close to the output aspect ratio, so
 * the encoder adds almost no padding.
 */
const OVERLAY_WIDTH = 900;
const OVERLAY_HEIGHT = 600;

test.setTimeout(15 * 60_000);

/** Things worth reporting that must not fail a recording. */
const notes: string[] = [];

/* ------------------------------------------------------------- helpers */

function findOverlay(app: ElectronApplication): Page {
  const page = app.windows().find((window) => window.url().includes('overlay'));
  if (!page) throw new Error('The overlay window is not open.');
  return page;
}

/** Summon the overlay and frame it for the camera. */
async function summonOverlay(app: ElectronApplication, shell: Page): Promise<Page> {
  await shell.click('[data-testid="toggle-overlay"]');
  const overlay =
    app.windows().find((page) => page.url().includes('overlay')) ??
    (await app.waitForEvent('window', { timeout: 20_000 }));
  await overlay.waitForSelector('[data-testid="overlay-card"]', { timeout: 20_000 });

  // Inherit the shell's position, which a quiet run has already moved out of
  // the developer's way, and take a size that frames the card.
  const shellHandle = await app.browserWindow(shell);
  const bounds = await shellHandle.evaluate((win) => win.getBounds());
  const overlayHandle = await app.browserWindow(overlay);
  await overlayHandle
    .evaluate(
      (win, box) => {
        win.setBounds(box);
      },
      { x: bounds.x, y: bounds.y, width: OVERLAY_WIDTH, height: OVERLAY_HEIGHT },
    )
    .catch(() => undefined);

  await overlay.waitForTimeout(400);
  return overlay;
}

/** True when a local model is answering. */
async function hasBackend(overlay: Page): Promise<boolean> {
  const status =
    (await overlay.locator('[data-testid="overlay-status"]').textContent()) ?? '';
  return !(status.includes('Waiting') || status.includes('No local model'));
}

/** Type a question the way a person would, and send it. */
async function ask(overlay: Page, question: string): Promise<void> {
  await overlay.fill('[data-testid="overlay-input"]', '');
  await overlay.keyboard.type(question, { delay: 38 });
  await overlay.waitForTimeout(350);
  await overlay.keyboard.press('Enter');
}

/** Read the emulator's own buffer. The terminal draws to a canvas. */
function terminalText(terminal: Locator): Promise<string> {
  return terminal.evaluate((node) => {
    const term = (node as HTMLElement & { __terminal?: unknown }).__terminal as
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
  });
}

/* ---------------------------------------------------------- the timeline */

/** The four scenes that need nothing but the application itself. */
function shellSequences(): SequenceDef[] {
  return [
    sequence({
      id: 'fleet',
      name: 'A fleet of coding agents',
      note: 'Seventeen runs across four projects, in one window',
      // Nothing to drive. The fade in is the reveal, and the hold is the shot.
      drive: async () => undefined,
    }),

    sequence({
      id: 'inspector',
      name: 'One run, waiting on a human',
      note: 'The inspector shows what the agent wants to do next',
      async drive({ shell, mark }) {
        await shell.click('[data-testid="run-run-102"]');
        await expect(shell.locator('[data-testid="approval"]')).toBeVisible();
        mark('approval-shown');
      },
    }),

    sequence({
      id: 'tabs',
      name: 'Concurrent sessions, in tabs',
      note: 'Each tab follows one agent, and the panels follow the tab',
      async drive({ shell }) {
        const tabs = shell.locator('.tab');
        for (const index of [2, 1, 0, 1]) {
          await tabs.nth(index).click();
          await shell.waitForTimeout(1_400);
        }
      },
    }),

    sequence({
      id: 'terminal',
      name: 'A real coding agent, in a tab',
      note: 'Claude Code, running on a native pseudo terminal',
      async drive({ shell, mark }) {
        await shell.click('[data-testid="tab-new"]');
        const terminal = shell.locator('[data-testid="terminal"]').last();
        await expect(terminal.locator('canvas').first()).toBeVisible({
          timeout: 30_000,
        });
        await terminal.click();

        // Set the scene, then clear it away. What stays on screen is one
        // command. `CLAUDE_CODE_CHILD_SESSION` is inherited from the process
        // that started this recording, and only produces a warning banner.
        await shell.keyboard.type(
          `cd '${ROOT}'; ` +
            "PS1='~/github/stuffbucket/electron $ '; " +
            'unset CLAUDE_CODE_CHILD_SESSION; ' +
            'export PATH="$HOME/.local/bin:$PATH"; clear',
        );
        await shell.keyboard.press('Enter');
        await shell.waitForTimeout(900);

        await shell.keyboard.type('claude', { delay: 110 });
        await shell.keyboard.press('Enter');

        // Wait for the banner rather than a fixed pause, so the hold lands on
        // a started agent and not on a blank screen.
        try {
          await expect
            .poll(() => terminalText(terminal), { timeout: 60_000, intervals: [500] })
            .toContain('Claude Code');
        } catch {
          notes.push('the claude CLI never printed its banner in the terminal');
        }
        mark('claude-ready');
        await shell.waitForTimeout(1_500);
      },
    }),
  ];
}

/** The scenes that need a local model. Empty when none is running. */
function overlaySequences(harness: DemoHarness): SequenceDef[] {
  return [
    sequence({
      id: 'ask-version',
      name: 'Ask the app about itself',
      note: 'The agent calls a read-only tool, so nothing asks permission',
      caption: 'top',
      target: ({ app, shell }) => summonOverlay(app, shell),
      async drive({ app }) {
        const overlay = findOverlay(app);
        await ask(overlay, 'What version of Electron is this running?');
        await expect(overlay.locator('[data-testid="overlay-answer"]')).toContainText(
          /\d+\.\d+/,
          { timeout: 90_000 },
        );
      },
    }),

    sequence({
      id: 'ask-theme',
      name: 'And about how it is set up',
      note: 'Same tool, reading the live preferences',
      caption: 'top',
      target: ({ app }) => Promise.resolve(findOverlay(app)),
      async drive({ app }) {
        const overlay = findOverlay(app);
        await ask(overlay, 'What theme am I using right now?');
        await expect(overlay.locator('[data-testid="overlay-answer"]')).toContainText(
          /dark/i,
          { timeout: 90_000 },
        );
      },
    }),

    sequence({
      id: 'gate-asks',
      name: 'Now change something',
      note: 'set_theme is mutating, so the gate asks before it runs',
      caption: 'top',
      target: ({ app }) => Promise.resolve(findOverlay(app)),
      async drive({ app, mark }) {
        const overlay = findOverlay(app);
        await ask(overlay, 'Switch this application to the light theme.');
        await expect(overlay.locator('[data-testid="overlay-approval"]')).toBeVisible({
          timeout: 120_000,
        });
        await expect(
          overlay.locator('[data-testid="overlay-approval-summary"]'),
        ).toContainText('light');
        mark('gate-shown');
      },
    }),

    sequence({
      id: 'repaints',
      name: 'Allowed, and the app repaints',
      note: 'The tool runs in the main process; the window follows on its own',
      // Back to the shell. This is the only scene where the payoff is in the
      // application rather than in the overlay.
      async target({ shell }) {
        // Put the fleet in front, so the change lands on the whole interface
        // rather than on a terminal that is mostly black either way.
        await shell.locator('.tab').first().click();
        // Wait for the canvas, not for one view mode. This scene only needs
        // the fleet in front so the repaint lands on the whole interface;
        // which way it is laid out is the edit's business.
        await expect(shell.locator('[data-testid="canvas"]')).toBeVisible();
        return shell;
      },
      async drive({ app, shell, mark }) {
        const overlay = findOverlay(app);
        await overlay.click('[data-testid="overlay-allow"]');

        await expect
          .poll(
            () =>
              shell.evaluate(() =>
                document.documentElement.getAttribute('data-theme'),
              ),
            { timeout: 60_000 },
          )
          .toBe('light');
        mark('theme-light');

        // Put the overlay away, so the hold is on the application alone.
        await overlay.keyboard.press('Escape');
        await harness.app.browserWindow(overlay).then((handle) =>
          handle.evaluate((win) => {
            win.hide();
          }),
        );
      },
    }),
  ];
}

/* -------------------------------------------------------------- the run */

test('records the agent workflow', async () => {
  let harness: DemoHarness | undefined;

  try {
    harness = await launchDemoApp();
    const { app, window } = harness;

    // Count by the per-run test id rather than by the card class. The fleet
    // opens as a list now, and an assertion pinned to one view mode breaks
    // whenever the default moves rather than when the fixture does.
    await expect(window.locator('[data-testid^="run-run-"]')).toHaveCount(17);

    const sequences = shellSequences();

    // The overlay scenes need a model. Skip them rather than fake them.
    const probe = await summonOverlay(app, window);
    const backend = await hasBackend(probe);
    if (backend) {
      sequences.push(...overlaySequences(harness));
    } else {
      notes.push('no local model was running, so the overlay scenes were skipped');
    }
    // Summoning it here was only a probe. Hide it again, and let the scene
    // that wants it summon it for real.
    await (await app.browserWindow(probe)).evaluate((win) => {
      win.hide();
    });

    const result = await record({ app, shell: window, name: 'workflow', sequences });

    process.stdout.write(
      `\n  ${result.output}\n` +
        `  capture: ${result.method}, ${String(result.frames)} frames\n` +
        `  take: ${result.takeDir}\n` +
        `  ${result.probe.seconds.toFixed(2)}s, ${result.probe.codec}, ` +
        `${String(result.probe.width)}x${String(result.probe.height)}, ` +
        `${result.probe.frameRate} fps, ` +
        `${(result.probe.bytes / 1e6).toFixed(2)} MB\n` +
        result.dropped.map((seq) => `  note: no clip for "${seq}"\n`).join('') +
        notes.map((note) => `  note: ${note}\n`).join('') +
        '\n',
    );

    expect(result.probe.seconds).toBeGreaterThanOrEqual(30);
    expect(result.probe.codec).toBe('h264');

    // The recording ends in light. Leave the profile as the next run expects.
    await setTheme(window, 'dark');
  } finally {
    await closeApp(harness);
  }
});

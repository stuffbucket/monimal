import { expect, test, type Page } from '@playwright/test';
import type { BrowserWindow } from 'electron';

import {
  closeApp,
  launchApp,
  terminalScreen,
  type Harness,
} from './harness.js';

let harness: Harness;

test.beforeAll(async () => {
  harness = await launchApp({}, {
    args: ['--terminal-lab'],
    readySelector: '.terminal-lab',
  });
});

test.afterAll(async () => {
  await closeApp(harness);
});

function terminalOf(page: Page) {
  return page.locator('[data-testid="terminal"]:visible').first();
}

test('moves a renamed live terminal into a focused window', async () => {
  const source = harness.window;
  const terminal = terminalOf(source);
  await expect.poll(() => terminalScreen(terminal)).toContain('Maximal Terminal Lab');

  const terminalTab = source.getByRole('tab').nth(1);
  await expect(terminalTab).toHaveText('Maximal Terminal Lab');
  await expect.poll(async () => (
    await (await harness.app.browserWindow(source)).evaluate((window: BrowserWindow) => window.getTitle())
  )).toBe('Maximal Terminal Lab');
  await terminalTab.click({ button: 'right' });
  await source.getByTestId('menu-rename').click();

  const rename = source.getByTestId('rename-terminal-tab');
  await rename.getByRole('textbox', { name: 'Terminal tab name' }).fill('Renamed live terminal');
  await rename.getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(source.getByRole('tab', { name: 'Renamed live terminal' })).toBeVisible();
  await terminal.click();
  await source.keyboard.press('Meta+d');
  await expect(source.locator('.terminal-split')).toBeVisible();
  await expect(source.locator('[data-testid="terminal"]:visible')).toHaveCount(2);
  await source.keyboard.press('Meta+[');
  const focusedTerminal = source.locator('[data-testid="terminal"][data-focused]');
  await expect(focusedTerminal).toBeVisible();
  await focusedTerminal.click();
  await source.keyboard.type('flood 40 25');
  await source.keyboard.press('Enter');
  await expect.poll(() => terminalScreen(focusedTerminal), {
    timeout: 20_000,
  }).toMatch(/line 0001 of 0040[\s\S]*line 0040 of 0040/);

  const newWindow = source.context().waitForEvent('page');
  await terminalTab.click({ button: 'right' });
  await expect(source.getByTestId('menu-move-to-new-window')).toBeEnabled();
  await source.getByTestId('menu-move-to-new-window').click();
  const detached = await newWindow;
  await detached.waitForSelector('.terminal-lab');

  await expect(source.getByRole('tab')).toHaveCount(1);
  await expect(source.getByRole('tab')).toHaveText('Terminal Lab');
  await expect(detached.getByRole('tab')).toHaveCount(1);
  await expect(detached.getByRole('tab')).toHaveText('Renamed live terminal');
  await expect(detached.getByRole('tab')).toHaveAttribute('data-state', 'active');
  await expect.poll(async () => (
    await (await harness.app.browserWindow(detached)).evaluate((window: BrowserWindow) => window.getTitle())
  )).toBe('Renamed live terminal');

  const detachedTerminal = terminalOf(detached);
  await expect(detached.locator('.terminal-split')).toBeVisible();
  await expect(detached.locator('[data-testid="terminal"]:visible')).toHaveCount(2);
  await expect.poll(() => terminalScreen(detached.locator('[data-testid="terminal"]:visible').first()), {
    timeout: 20_000,
  }).toMatch(/line 0001 of 0040[\s\S]*line 0040 of 0040/);
  await expect.poll(() => terminalScreen(detachedTerminal)).toContain('Maximal Terminal Lab');
  await detachedTerminal.click();
  await detached.keyboard.type('undock-live-check');
  await detached.keyboard.press('Enter');
  await expect.poll(() => terminalScreen(detachedTerminal)).toContain('unknown command: undock-live-check');

  const detachedUrl = new URL(detached.url());
  const sessionId = detachedUrl.searchParams.get('sessionId');
  const paneJson = detachedUrl.searchParams.get('pane');
  const pane: unknown = paneJson ? JSON.parse(paneJson) : null;
  const sessionIds = isPane(pane) ? collectSessionIds(pane) : sessionId ? [sessionId] : [];
  expect(sessionId).toBeTruthy();
  await detached.evaluate((id) => {
    void (globalThis as typeof globalThis & {
      stuffbucket: {
        invoke: (channel: string, request: unknown) => Promise<void>;
      };
    }).stuffbucket.invoke('pty:write', {
      id,
      data: 'i=1; while [ "$i" -le 400 ]; do printf "stream-%03d\\n" "$i"; i=$((i+1)); done; printf "stream-complete\\n"',
    });
  }, new URL(detached.url()).searchParams.get('sessionId'));
  await expect.poll(() => terminalScreen(detachedTerminal), {
    timeout: 20_000,
    message: 'continuous output did not reach the detached terminal',
  }).toContain('stream-complete');

  const detachedWindow = await harness.app.browserWindow(detached);
  const initialSize = await detachedWindow.evaluate((window: BrowserWindow) => window.getBounds());
  const initialGrid = await detachedTerminal.evaluate((node) => {
    const terminal = (node as HTMLElement & {
      __terminal?: { cols: number; rows: number };
    }).__terminal;
    return { cols: terminal?.cols ?? 0, rows: terminal?.rows ?? 0 };
  });
  expect(initialSize.width).toBeGreaterThan(0);
  expect(initialSize.height).toBeGreaterThan(0);
  expect(initialGrid.cols).toBeGreaterThan(0);
  expect(initialGrid.rows).toBeGreaterThan(0);
  await detachedWindow.evaluate((window: BrowserWindow) => window.setSize(1200, 820));
  await expect.poll(() => detachedTerminal.evaluate((node) => {
    const terminal = (node as HTMLElement & {
      __terminal?: { cols: number; rows: number };
    }).__terminal;
    return { cols: terminal?.cols ?? 0, rows: terminal?.rows ?? 0 };
  })).not.toEqual(initialGrid);

  const sourceFrameId = await source.evaluate(() => (
    (globalThis as typeof globalThis & {
      stuffbucket: { invoke: (channel: string) => Promise<string> };
    }).stuffbucket.invoke('terminal:frame-id')
  ));
  const detachedFrameId = await detached.evaluate(() => (
    (globalThis as typeof globalThis & {
      stuffbucket: { invoke: (channel: string) => Promise<string> };
    }).stuffbucket.invoke('terminal:frame-id')
  ));
  const tabId = await detached.getByRole('tab').getAttribute('id');
  expect(tabId).toContain('term-');
  expect(detachedFrameId).not.toBe(sourceFrameId);

  const detachedClosed = detached.waitForEvent('close');
  await detached.evaluate(({ id, sourceFrameId: detachedId, targetFrameId, pane: transferPane, sessionIds: transferIds }) => {
    void (globalThis as typeof globalThis & {
      stuffbucket: {
        invoke: (channel: string, request: unknown) => Promise<boolean>;
      };
    }).stuffbucket.invoke('terminal:redock', {
      id,
      cols: 80,
      rows: 24,
      sourceFrameId: detachedId,
      targetFrameId,
      title: 'Renamed live terminal',
      pane: transferPane,
      sessionIds: transferIds,
    });
  }, {
    id: sessionId,
    sourceFrameId: detachedFrameId,
    targetFrameId: sourceFrameId,
    pane,
    sessionIds,
  });
  await detachedClosed;
  await expect(source.getByRole('tab')).toHaveCount(2);
  await expect(source.getByRole('tab', { name: 'Terminal Lab' })).toBeVisible();
  await expect(source.getByRole('tab', { name: 'Renamed live terminal' })).toBeVisible();
  await expect(source.locator('.terminal-split')).toBeVisible();
  await expect(source.locator('[data-testid="terminal"]:visible')).toHaveCount(2);
});

function collectSessionIds(
  pane: { sessionId?: string; first?: unknown; second?: unknown },
): string[] {
  if (pane.sessionId) return [pane.sessionId];
  return [
    ...collectSessionIds(pane.first as { sessionId?: string; first?: unknown; second?: unknown }),
    ...collectSessionIds(pane.second as { sessionId?: string; first?: unknown; second?: unknown }),
  ];
}

function isPane(value: unknown): value is { sessionId?: string; first?: unknown; second?: unknown } {
  return typeof value === 'object' && value !== null;
}

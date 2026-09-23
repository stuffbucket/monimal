import { expect, test, type Locator, type Page } from '@playwright/test';
import type { BrowserWindow } from 'electron';

import {
  closeApp,
  launchApp,
  terminalScreen,
  terminalOwnsDomFocus,
  transferWindowFocus,
  type Harness,
} from './harness.js';

let harness: Harness;

test.beforeAll(async () => {
  harness = await launchApp({}, {
    args: ['--terminal-lab'],
    readySelector: '.terminal-lab',
  });
  // Shared GUI runners can deliver the user's physical keystrokes to Electron.
  // Keep native focus outside the test app; CDP input and simulated renderer
  // focus still exercise the terminal paths asserted below.
  await harness.app.evaluate(({ app, BrowserWindow }) => {
    const isolateNativeInput = (window: BrowserWindow) => window.setFocusable(false);
    for (const window of BrowserWindow.getAllWindows()) isolateNativeInput(window);
    app.on('browser-window-created', (_event, window) => isolateNativeInput(window));
  });
  harness.app.process().stdout?.on('data', (d) => process.stdout.write(`[app] ${d}`));
  harness.app.process().stderr?.on('data', (d) => process.stdout.write(`[app:err] ${d}`));
});

test.afterAll(async () => {
  await closeApp(harness);
});

function terminalOf(page: Page) {
  return page.locator('[data-testid="terminal"]:visible').first();
}

/** The emulator's own current grid, read the same way `terminalScreen` reads its buffer. */
function terminalGrid(terminal: Locator): Promise<{ cols: number; rows: number }> {
  return terminal.evaluate((node) => {
    const term = (node as HTMLElement & {
      __terminal?: { cols: number; rows: number };
    }).__terminal;
    return { cols: term?.cols ?? 0, rows: term?.rows ?? 0 };
  });
}

test('copies a live terminal into a new window, keeping both live, then recovers on drop-back', async () => {
  const source = harness.window;
  const terminal = terminalOf(source);
  await expect.poll(() => terminalScreen(terminal)).toContain('Maximal Terminal Lab');

  const terminalTab = source.getByRole('tab').nth(1);
  await transferWindowFocus(source, terminal, []);
  await source.keyboard.type('flood 60 25');
  await source.keyboard.press('Enter');
  await expect.poll(() => terminalScreen(terminal), { timeout: 20_000 }).toMatch(
    /line 0001 of 0060[\s\S]*line 0060 of 0060/,
  );

  const newWindow = source.context().waitForEvent('page');
  await terminalTab.click({ button: 'right' });
  const copyItem = source.getByTestId('menu-copy-to-new-window');
  await expect(copyItem).toBeEnabled();
  await copyItem.click();
  const copied = await newWindow;
  await copied.waitForSelector('.terminal-lab');

  // Copy leaves the source tab in place: nothing is redundant to disable.
  await expect(source.getByRole('tab')).toHaveCount(2);
  await expect(source.getByRole('tab', { name: 'Maximal Terminal Lab' })).toBeVisible();

  // Moving the only tab would leave an empty window, but closing it closes
  // that copied window and detaches only its view of the shared PTY.
  await copied.getByRole('tab').first().click({ button: 'right' });
  await expect(copied.getByTestId('menu-close')).toBeEnabled();
  await expect(copied.getByTestId('menu-move-to-new-window')).toBeDisabled();
  await copied.keyboard.press('Escape');
  await expect(copied.getByRole('tab')).toHaveCount(1);

  const copiedTerminal = terminalOf(copied);
  await expect.poll(() => terminalScreen(copiedTerminal), { timeout: 20_000 }).toMatch(
    /line 0001 of 0060[\s\S]*line 0060 of 0060/,
  );

  // Both windows observe the same live PTY: new output reaches both.
  await transferWindowFocus(copied, copiedTerminal, [source]);
  await copied.keyboard.type('echo mirrored-output-check');
  await copied.keyboard.press('Enter');
  await expect.poll(() => terminalScreen(copiedTerminal)).toContain('mirrored-output-check');
  await expect.poll(() => terminalScreen(terminal)).toContain('mirrored-output-check');

  const thirdWindow = source.context().waitForEvent('page');
  await terminalTab.click({ button: 'right' });
  const copyAgainItem = source.getByTestId('menu-copy-to-new-window');
  await expect(copyAgainItem).toBeEnabled();
  await copyAgainItem.click();
  const copiedAgain = await thirdWindow;
  await copiedAgain.waitForSelector('.terminal-lab');
  const copiedAgainTerminal = terminalOf(copiedAgain);
  await expect.poll(() => terminalScreen(copiedAgainTerminal), { timeout: 20_000 }).toContain(
    'mirrored-output-check',
  );
  const sourceWindowHandle = await harness.app.browserWindow(source);
  const copiedWindowHandle = await harness.app.browserWindow(copied);
  const copiedAgainWindowHandle = await harness.app.browserWindow(copiedAgain);

  await transferWindowFocus(copiedAgain, copiedAgainTerminal, [source, copied]);
  await expect.poll(() => terminalOwnsDomFocus(copiedAgainTerminal)).toBe(true);
  await expect.poll(() => terminalOwnsDomFocus(terminal)).toBe(false);
  await expect.poll(() => terminalOwnsDomFocus(copiedTerminal)).toBe(false);

  await transferWindowFocus(source, terminal, [copied, copiedAgain]);
  await expect.poll(() => terminalOwnsDomFocus(terminal)).toBe(true);
  await expect.poll(() => terminalOwnsDomFocus(copiedTerminal)).toBe(false);
  await expect.poll(() => terminalOwnsDomFocus(copiedAgainTerminal)).toBe(false);
  await source.keyboard.type('focus-original-shared-check');
  await source.keyboard.press('Enter');
  for (const view of [terminal, copiedTerminal, copiedAgainTerminal]) {
    await expect.poll(() => terminalScreen(view)).toContain('focus-original-shared-check');
  }

  await transferWindowFocus(copied, copiedTerminal, [source, copiedAgain]);
  await expect.poll(() => terminalOwnsDomFocus(copiedTerminal)).toBe(true);
  await expect.poll(() => terminalOwnsDomFocus(terminal)).toBe(false);
  await expect.poll(() => terminalOwnsDomFocus(copiedAgainTerminal)).toBe(false);
  await copied.keyboard.type('focus-copy-shared-check');
  await copied.keyboard.press('Enter');
  for (const view of [terminal, copiedTerminal, copiedAgainTerminal]) {
    await expect.poll(() => terminalScreen(view)).toContain('focus-copy-shared-check');
  }

  await transferWindowFocus(copiedAgain, copiedAgainTerminal, [source, copied]);
  await expect.poll(() => terminalOwnsDomFocus(copiedAgainTerminal)).toBe(true);
  await expect.poll(() => terminalOwnsDomFocus(terminal)).toBe(false);
  await expect.poll(() => terminalOwnsDomFocus(copiedTerminal)).toBe(false);
  await copiedAgainTerminal.click();
  await copiedAgain.keyboard.type('echo second-copy-output-check');
  await copiedAgain.keyboard.press('Enter');
  await expect.poll(() => terminalScreen(terminal)).toContain('second-copy-output-check');
  await expect.poll(() => terminalScreen(copiedTerminal)).toContain('second-copy-output-check');
  await expect.poll(() => terminalScreen(copiedAgainTerminal)).toContain('second-copy-output-check');

  const fourthWindow = copied.context().waitForEvent('page');
  await copied.getByRole('tab').first().click({ button: 'right' });
  const copyViaSiblingItem = copied.getByTestId('menu-copy-to-new-window');
  await expect(copyViaSiblingItem).toBeEnabled();
  await copyViaSiblingItem.click();
  const copiedViaSibling = await fourthWindow;
  await copiedViaSibling.waitForSelector('.terminal-lab');
  const copiedViaSiblingTerminal = terminalOf(copiedViaSibling);
  const copiedViaSiblingWindowHandle = await harness.app.browserWindow(copiedViaSibling);
  await expect.poll(
    () => terminalScreen(copiedViaSiblingTerminal),
    { timeout: 20_000 },
  ).toContain('second-copy-output-check');
  await transferWindowFocus(
    copiedViaSibling,
    copiedViaSiblingTerminal,
    [source, copied, copiedAgain],
  );
  await copiedViaSibling.keyboard.type('sibling-copy-shared-check');
  await copiedViaSibling.keyboard.press('Enter');
  for (const view of [terminal, copiedTerminal, copiedAgainTerminal, copiedViaSiblingTerminal]) {
    await expect.poll(() => terminalScreen(view)).toContain('sibling-copy-shared-check');
  }

  await copiedViaSibling.keyboard.press('Meta+d');
  for (const page of [source, copied, copiedAgain, copiedViaSibling]) {
    await expect(page.locator('[data-testid="terminal"]:visible')).toHaveCount(2);
  }
  const copiedViaSiblingSplit =
    copiedViaSibling.locator('[data-testid="terminal"][data-focused]');
  await expect(copiedViaSiblingSplit).toBeVisible();
  await copiedViaSiblingSplit.click();
  await copiedViaSibling.keyboard.type('split-shared-output-check');
  await copiedViaSibling.keyboard.press('Enter');
  for (const page of [source, copied, copiedAgain, copiedViaSibling]) {
    await expect.poll(() => terminalScreen(
      page.locator('[data-testid="terminal"]:visible').nth(1),
    )).toContain('split-shared-output-check');
  }

  // There is one real PTY behind both windows, so resizing each to a
  // different size cannot leave each with its own size. A live viewer's own
  // resize (as opposed to a fresh mirror joining) wins outright rather than
  // being clamped to whichever window happens to be smaller, and every other
  // viewer's own OS window is physically resized to match it -- so this
  // should converge on one grid *and* one physical window size, not just an
  // internal grid clamped inside windows still sized differently.
  await sourceWindowHandle.evaluate((window: BrowserWindow) => window.setSize(1100, 760));
  await copiedWindowHandle.evaluate((window: BrowserWindow) => window.setSize(760, 520));
  await copiedAgainWindowHandle.evaluate((window: BrowserWindow) => window.setSize(900, 640));
  await copiedViaSiblingWindowHandle.evaluate(
    (window: BrowserWindow) => window.setSize(820, 580),
  );

  await expect.poll(() => terminalGrid(terminal)).not.toEqual({ cols: 0, rows: 0 });
  await expect.poll(() => terminalGrid(copiedTerminal)).not.toEqual({ cols: 0, rows: 0 });
  await expect.poll(() => terminalGrid(copiedAgainTerminal)).not.toEqual({ cols: 0, rows: 0 });
  await expect.poll(() => terminalGrid(copiedViaSiblingTerminal)).not.toEqual({ cols: 0, rows: 0 });
  await expect.poll(async () => {
    const [sourceGrid, copiedGrid, copiedAgainGrid, copiedViaSiblingGrid] = await Promise.all([
      terminalGrid(terminal),
      terminalGrid(copiedTerminal),
      terminalGrid(copiedAgainTerminal),
      terminalGrid(copiedViaSiblingTerminal),
    ]);
    return sourceGrid.cols === copiedGrid.cols && sourceGrid.rows === copiedGrid.rows
      && sourceGrid.cols === copiedAgainGrid.cols && sourceGrid.rows === copiedAgainGrid.rows
      && sourceGrid.cols === copiedViaSiblingGrid.cols
      && sourceGrid.rows === copiedViaSiblingGrid.rows
      ? sourceGrid
      : undefined;
  }, { timeout: 20_000, message: 'the mirrored windows never converged on one grid size' })
    .not.toBeUndefined();

  // The two windows' own OS-level content sizes converged too: the mismatch
  // was resolved by physically resizing one window to match the other, not
  // merely by clamping a smaller grid inside a window still sized bigger.
  await expect.poll(async () => {
    const [sourceSize, copiedSize, copiedAgainSize, copiedViaSiblingSize] = await Promise.all([
      sourceWindowHandle.evaluate((window: BrowserWindow) => window.getContentSize()),
      copiedWindowHandle.evaluate((window: BrowserWindow) => window.getContentSize()),
      copiedAgainWindowHandle.evaluate((window: BrowserWindow) => window.getContentSize()),
      copiedViaSiblingWindowHandle.evaluate((window: BrowserWindow) => window.getContentSize()),
    ]);
    const [sourceWidth = 0, sourceHeight = 0] = sourceSize;
    const [copiedWidth = 0, copiedHeight = 0] = copiedSize;
    const [copiedAgainWidth = 0, copiedAgainHeight = 0] = copiedAgainSize;
    const [copiedViaSiblingWidth = 0, copiedViaSiblingHeight = 0] = copiedViaSiblingSize;
    return Math.abs(sourceWidth - copiedWidth) <= 2
      && Math.abs(sourceHeight - copiedHeight) <= 2
      && Math.abs(sourceWidth - copiedAgainWidth) <= 2
      && Math.abs(sourceHeight - copiedAgainHeight) <= 2
      && Math.abs(sourceWidth - copiedViaSiblingWidth) <= 2
      && Math.abs(sourceHeight - copiedViaSiblingHeight) <= 2;
  }, { timeout: 20_000, message: 'the windows never converged on one physical size' })
    .toBe(true);

  // The scrollback survived the resize in both windows: nothing was dropped
  // or corrupted by the grid changing out from under it.
  await expect.poll(() => terminalScreen(terminal)).toMatch(
    /line 0001 of 0060[\s\S]*line 0060 of 0060/,
  );
  await expect.poll(() => terminalScreen(copiedTerminal)).toMatch(
    /line 0001 of 0060[\s\S]*line 0060 of 0060/,
  );
  await expect.poll(() => terminalScreen(copiedAgainTerminal)).toMatch(
    /line 0001 of 0060[\s\S]*line 0060 of 0060/,
  );
  await expect.poll(() => terminalScreen(copiedViaSiblingTerminal)).toMatch(
    /line 0001 of 0060[\s\S]*line 0060 of 0060/,
  );

  // Both mirrors are still live after resizing: writing in either still
  // reaches both, with the grid they settled on.
  await transferWindowFocus(source, terminal, [copied, copiedAgain, copiedViaSibling]);
  await source.keyboard.type('echo post-resize-sync-check');
  await source.keyboard.press('Enter');
  await expect.poll(() => terminalScreen(terminal)).toContain('post-resize-sync-check');
  await expect.poll(() => terminalScreen(copiedTerminal)).toContain('post-resize-sync-check');
  await expect.poll(() => terminalScreen(copiedAgainTerminal)).toContain('post-resize-sync-check');
  await expect.poll(() => terminalScreen(copiedViaSiblingTerminal))
    .toContain('post-resize-sync-check');

  const copiedViaSiblingClosed = copiedViaSibling.waitForEvent('close');
  await copiedViaSibling.getByRole('tab').first().click({ button: 'right' });
  const closeCopiedViaSibling = copiedViaSibling.getByTestId('menu-close');
  await expect(closeCopiedViaSibling).toBeEnabled();
  await closeCopiedViaSibling.click();
  await copiedViaSiblingClosed;

  const copiedAgainClosed = copiedAgain.waitForEvent('close');
  await copiedAgain.getByRole('tab').first().click({ button: 'right' });
  const closeCopiedAgain = copiedAgain.getByTestId('menu-close');
  await expect(closeCopiedAgain).toBeEnabled();
  await closeCopiedAgain.click();
  await copiedAgainClosed;

  // Dragging the copy back onto the window it was copied from should recover
  // the existing tab there instead of redocking a duplicate. This dispatches
  // the same synthetic `drop` DOM event the drag gesture produces, so it
  // exercises the renderer's own `receiveTab` duplicate check rather than
  // just the backend redock contract.
  const copiedTab = copied.getByRole('tab').first();
  const copiedFrameId = await copied.evaluate(() => (
    (globalThis as typeof globalThis & {
      stuffbucket: { invoke: (channel: string) => Promise<string> };
    }).stuffbucket.invoke('terminal:frame-id')
  ));
  const copiedUrl = new URL(copied.url());
  const copiedSessionId = copiedUrl.searchParams.get('sessionId');
  const copiedTabId = await copiedTab.getAttribute('id');
  expect(copiedTabId).toContain('term-');

  await source.evaluate(({ tabId, sessionId, sourceFrameId }) => {
    const event = new DragEvent('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', {
      value: {
        types: ['application/x-stuffbucket-shell-tab+json'],
        getData: () => JSON.stringify({
          version: 1,
          sourceFrameId,
          tabId,
          sessionId,
          title: 'Maximal Terminal Lab',
        }),
      },
    });
    window.dispatchEvent(event);
  }, { tabId: copiedTabId, sessionId: copiedSessionId, sourceFrameId: copiedFrameId });

  // No duplicate appears, and the recovered tab is still live.
  await expect(source.getByRole('tab', { name: 'Maximal Terminal Lab' })).toHaveCount(1);
  await expect(source.getByRole('tab')).toHaveCount(2);
  await terminal.click();
  await source.keyboard.type('echo recovered-tab-still-live');
  await source.keyboard.press('Enter');
  await expect.poll(() => terminalScreen(terminal)).toContain('recovered-tab-still-live');
});

test('closes a tab from its context menu', async () => {
  const source = harness.window;
  await expect(source.getByRole('tab')).toHaveCount(2);

  const extraTab = source.getByRole('tab').nth(1);
  await extraTab.click({ button: 'right' });
  const closeItem = source.getByTestId('menu-close');
  await expect(closeItem).toBeEnabled();
  await closeItem.click();
  await expect(source.getByRole('tab')).toHaveCount(1);
  await expect(source.getByRole('tab', { name: 'Terminal Lab' })).toBeVisible();
});

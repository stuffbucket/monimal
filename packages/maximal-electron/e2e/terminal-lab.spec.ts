import { expect, test } from '@playwright/test';

import {
  capture,
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

test('drives production terminal tabs, splits, tooltips, and emulators', async () => {
  const terminal = harness.window.locator('[data-testid="terminal"]:visible');
  await expect.poll(() => terminalScreen(terminal)).toContain('Maximal Terminal Lab');
  await expect(harness.window.getByRole('tab')).toHaveCount(2);
  const initialTab = harness.window.getByRole('tab').nth(1);
  await expect(initialTab).toHaveAttribute('data-state', 'active');
  await expect(initialTab).toHaveText('Maximal Terminal Lab');

  const emulatorButtons = harness.window.getByRole('group', { name: 'Terminal emulator' }).getByRole('button');
  const buttonBoxes = await emulatorButtons.evaluateAll((buttons) =>
    buttons.map((button) => {
      const box = button.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        clientWidth: button.clientWidth,
        scrollWidth: button.scrollWidth,
      };
    }),
  );
  expect(buttonBoxes).toHaveLength(2);
  expect(buttonBoxes[0]!.right).toBeLessThanOrEqual(buttonBoxes[1]!.left);
  expect(buttonBoxes.every(({ clientWidth, scrollWidth }) => scrollWidth <= clientWidth)).toBe(true);

  const restart = harness.window.getByRole('button', { name: 'Restart active terminal' });
  await terminal.hover();
  await restart.hover();
  await expect(harness.window.getByRole('tooltip')).toHaveText('Restart active terminal');

  await terminal.click();
  await harness.window.keyboard.press('Control+u');
  await harness.window.keyboard.type('unicode');
  await harness.window.keyboard.press('Enter');
  await expect.poll(() => terminalScreen(terminal)).toContain('日本語');
  await expect(initialTab).toHaveAttribute('data-state', 'active');

  await harness.window.keyboard.type('link');
  await harness.window.keyboard.press('Enter');
  const oscLink = terminal.locator('a.term-link', { hasText: 'OSC 8 link' });
  await expect(oscLink).toHaveAttribute('href', 'https://example.com/');

  await harness.window.keyboard.type('graphics');
  await harness.window.keyboard.press('Enter');
  const kittyImage = terminal.locator('canvas.term-image');
  await expect(kittyImage).toBeVisible();
  await expect.poll(() => kittyImage.evaluate((canvas: HTMLCanvasElement) => (
    canvas.height > 0 && canvas.width > 0 &&
    canvas.getBoundingClientRect().height > 0 && canvas.getBoundingClientRect().width > 0
  ))).toBe(true);

  await harness.window.getByRole('button', { name: 'xterm.js' }).click();
  await expect(kittyImage).toHaveCount(0);
  await expect.poll(() => terminalScreen(terminal)).toContain('Maximal Terminal Lab');
  await expect(harness.window.getByRole('button', { name: 'xterm.js' })).toHaveAttribute('aria-pressed', 'true');
  await expect(harness.window.getByRole('tab', { selected: true })).toHaveText('Maximal Terminal Lab');

  await terminal.click();
  expect(await terminal.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await harness.window.keyboard.press('Control+u');
  await harness.window.keyboard.type('title Integration Smoke');
  await harness.window.keyboard.press('Enter');
  await expect.poll(() => terminalScreen(terminal)).toContain('title Integration Smoke');
  const integrationTab = harness.window.getByRole('tab', { name: 'Integration Smoke' });
  await expect(integrationTab).toHaveAttribute('data-state', 'active');
  const integrationTabById = harness.window.locator(`#${await integrationTab.getAttribute('id')}`);

  await harness.window.getByRole('button', { name: 'New terminal tab' }).click();
  await expect(harness.window.getByRole('tab')).toHaveCount(3);
  const fixtureTab = harness.window.getByRole('tab', { name: 'Maximal Terminal Lab' });
  await expect(fixtureTab).toHaveAttribute('data-state', 'active');
  const fixtureTabById = harness.window.locator(`#${await fixtureTab.getAttribute('id')}`);
  await expect.poll(() => terminalScreen(terminal)).toContain('Maximal Terminal Lab');
  await expect(fixtureTab).toHaveText('Maximal Terminal Lab');

  await integrationTab.click();
  await expect(integrationTab).toHaveAttribute('data-state', 'active');
  await expect(harness.window.getByRole('alert')).toHaveCount(0);
  await expect.poll(() => terminalScreen(terminal)).toContain('title Integration Smoke');

  await expect(integrationTab).toBeFocused();
  await terminal.click();
  await harness.window.keyboard.type('focus-first');
  await harness.window.keyboard.press('Enter');
  await expect.poll(() => terminalScreen(terminal)).toContain('unknown command: focus-first');

  await fixtureTab.click();
  await expect(fixtureTab).toBeFocused();
  await terminal.click();
  await harness.window.keyboard.type('focus-second');
  await harness.window.keyboard.press('Enter');
  await expect.poll(() => terminalScreen(terminal)).toContain('unknown command: focus-second');

  await integrationTab.click();
  await harness.window.getByRole('button', { name: 'Ghostty' }).click();
  await expect(harness.window.getByRole('alert')).toHaveCount(0);
  await expect.poll(() => terminalScreen(terminal)).toContain('日本語');
  await harness.window.getByRole('button', { name: 'xterm.js' }).click();
  await expect.poll(() => terminalScreen(terminal)).toContain('日本語');

  await fixtureTab.click();
  await expect(harness.window.getByRole('alert')).toHaveCount(0);
  await expect.poll(() => terminalScreen(terminal)).toContain('unknown command: focus-second');
  await terminal.click();
  await harness.window.keyboard.type('after-engine-switch');
  await harness.window.keyboard.press('Enter');
  await expect.poll(() => terminalScreen(terminal)).toContain('unknown command: after-engine-switch');

  await integrationTab.click();
  await expect.poll(() => terminalScreen(terminal)).toContain('unknown command: focus-first');

  await fixtureTab.dragTo(integrationTab);
  await expect(harness.window.getByRole('tab')).toHaveText([
    'Terminal Lab',
    'Maximal Terminal Lab',
    'Integration Smoke',
  ]);

  await integrationTab.click();
  await expect(integrationTab).toHaveAttribute('data-state', 'active');
  await terminal.click();
  await harness.window.keyboard.press('Meta+d');
  await expect(harness.window.locator('.terminal-split')).toBeVisible();
  await expect(terminal).toHaveCount(2);
  await expect(harness.window.locator('.terminal:visible[data-focused="true"]')).toHaveCount(1);
  await expect.poll(() => terminalScreen(terminal.last())).toContain('Maximal Terminal Lab');
  await harness.window.keyboard.press('Meta+[');
  await expect.poll(() => terminal.first().evaluate((element) =>
    element.contains(document.activeElement))).toBe(true);
  await expect(harness.window.locator('.terminal:visible[data-focused="true"]')).toHaveCount(1);
  await harness.window.keyboard.type('split-first-marker');
  await harness.window.keyboard.press('Enter');
  await expect.poll(() => terminalScreen(terminal.first())).toContain('split-first-marker');
  await harness.window.keyboard.press('Meta+]');
  await harness.window.keyboard.type('split-second-marker');
  await harness.window.keyboard.press('Enter');
  await expect.poll(() => terminalScreen(terminal.last())).toContain('split-second-marker');

  await fixtureTabById.click();
  await harness.window.waitForTimeout(2_000);
  await integrationTabById.click();
  await expect(terminal).toHaveCount(2);
  await expect.poll(() => terminalScreen(terminal.first())).toContain('split-first-marker');
  await expect.poll(() => terminalScreen(terminal.last())).toContain('split-second-marker');
  await expect(terminal.first().locator('.xterm-rows')).toContainText('split-first-marker');
  await expect(terminal.last().locator('.xterm-rows')).toContainText('split-second-marker');

  await harness.window.getByRole('button', { name: 'Ghostty' }).click();
  await expect(terminal).toHaveCount(2);
  await terminal.first().click();
  await harness.window.keyboard.type('ghostty-first-marker');
  await harness.window.keyboard.press('Enter');
  await terminal.last().click();
  await harness.window.keyboard.type('ghostty-second-marker');
  await harness.window.keyboard.press('Enter');
  await expect.poll(() => terminalScreen(terminal.first())).toContain('ghostty-first-marker');
  await expect.poll(() => terminalScreen(terminal.last())).toContain('ghostty-second-marker');

  for (let cycle = 0; cycle < 3; cycle += 1) {
    await fixtureTabById.click();
    await harness.window.waitForTimeout(5_000);
    await integrationTabById.click();
    await expect(terminal).toHaveCount(2);
    await expect.poll(() => terminalScreen(terminal.first())).toContain('ghostty-first-marker');
    await expect.poll(() => terminalScreen(terminal.last())).toContain('ghostty-second-marker');
    await expect(terminal.first().locator('.term-grid')).toContainText('ghostty-first-marker');
    await expect(terminal.last().locator('.term-grid')).toContainText('ghostty-second-marker');
  }

  await harness.window.getByRole('button', { name: 'xterm.js' }).click();
  await expect(harness.window.locator('.terminal:visible[data-focused="true"]')).toHaveCount(0);
  const xtermScrollers = await harness.window.locator(
    '.terminal:visible .xterm-scrollable-element',
  ).evaluateAll((elements) => elements.map((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    overflowX: getComputedStyle(element).overflowX,
  })));
  expect(xtermScrollers.every(({ clientWidth, scrollWidth }) => scrollWidth <= clientWidth)).toBe(true);
  const terminalHost = harness.window.locator('.terminal-host:visible');
  const terminalLab = harness.window.locator('.terminal-lab');
  expect((await terminalHost.boundingBox())!.width).toBeLessThanOrEqual(
    (await terminalLab.boundingBox())!.width,
  );
  const canvasOverflow = await harness.window.locator('.panel--canvas').evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(canvasOverflow.scrollWidth).toBe(canvasOverflow.clientWidth);
  await capture(harness.window, 'test-results/terminal-lab.png');

  await restart.click();
  await expect(harness.window.locator('.terminal-split')).toHaveCount(0);
  await expect(terminal).toHaveCount(1);
  await expect.poll(() => terminalScreen(terminal)).toContain('Type help for fixture commands.');

  await harness.window.getByRole('button', { name: 'Close active terminal' }).click();
  await expect(harness.window.getByRole('tab')).toHaveCount(2);
  await expect(integrationTabById).toHaveCount(0);
  await expect(fixtureTabById).toHaveAttribute('data-state', 'active');
});
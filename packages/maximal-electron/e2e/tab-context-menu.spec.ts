import { expect, test } from '@playwright/test';

import { closeApp, launchApp, type Harness } from './harness.js';

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

test('opens the context menu aligned to the click point, not centered on it', async () => {
  const window = harness.window;
  const tab = window.getByRole('tab').nth(1);
  const box = (await tab.boundingBox())!;
  const clickX = box.x + 6;
  const clickY = box.y + box.height / 2;

  await window.mouse.click(clickX, clickY, { button: 'right' });
  const menu = window.getByTestId('tab-context-menu');
  await expect(menu).toBeVisible();
  const menuBox = (await menu.boundingBox())!;

  // Left-aligned ("start") to the click point, not centered on it: the
  // menu's left edge should sit close to the click x, well short of its
  // horizontal midpoint landing there instead.
  expect(menuBox.x).toBeGreaterThan(clickX - 20);
  expect(menuBox.x).toBeLessThan(clickX + 20);

  await window.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});

test('closes the context menu on a click over the draggable titlebar strip', async () => {
  const window = harness.window;
  const tab = window.getByRole('tab').nth(1);
  const box = (await tab.boundingBox())!;
  await window.mouse.click(box.x + 6, box.y + box.height / 2, { button: 'right' });

  const menu = window.getByTestId('tab-context-menu');
  await expect(menu).toBeVisible();

  // The empty draggable strip to the right of the tab bar and "+" button:
  // on macOS a real mouse's press there never reaches the DOM, since the OS
  // treats it as a window-drag gesture instead of a click. The drag-region
  // dismiss catcher stands in so the menu still closes.
  const titlebar = (await window.locator('[data-testid="titlebar"]').boundingBox())!;
  await window.mouse.click(titlebar.x + titlebar.width - 4, titlebar.y + titlebar.height / 2);

  await expect(menu).toBeHidden();
});

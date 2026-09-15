import path from 'node:path';

import { expect, test, type Locator } from '@playwright/test';
import {
  capture,
  closeApp,
  launchApp,
  resetShell,
  setTheme,
  terminalScreen,
  type Harness,
} from './harness.js';
import { createRegistry } from './shuffle.js';

/**
 * Shell behaviour, verified against the built bundles.
 *
 * The assertion style follows `stuffbucket/maximal`'s `ui-layout-verification`
 * skill. Its lesson: unit tests on a DOM with no layout engine cannot answer
 * "is there really a gap between these blocks?", so two real regressions
 * shipped past a green suite. These read **computed** layout from a real
 * engine, which is the only thing that catches that class.
 *
 * Tests run in a **random order**. Each one must therefore set up whatever it
 * needs, and `resetShell` returns the application to a known state first. The
 * seed is printed on every run; `E2E_SEED` replays one.
 *
 */

let harness: Harness;

const { scenario, registerShuffled } = createRegistry();

test.beforeAll(async () => {
  harness = await launchApp();
});

test.beforeEach(async () => {
  await resetShell(harness);
});

test.afterAll(async () => {
  await closeApp(harness);
});

/* ------------------------------------------------------------------ shell */

scenario('shell renders all three panels', async () => {
  const { window } = harness;

  await expect(window.locator('[data-testid="titlebar"]')).toBeVisible();
  await expect(window.locator('[data-testid="left-nav"]')).toBeVisible();
  await expect(window.locator('[data-testid="canvas"]')).toBeVisible();
  await expect(window.locator('[data-testid="inspector"]')).toBeVisible();
});

scenario('IPC round trip populates the runtime section', async () => {
  const { window } = harness;

  // `app:versions` is a main-process call. Real values here prove the whole
  // contract: preload bridge, channel allow-list, and handler.
  await expect(window.locator('.field', { hasText: 'Electron' })).toContainText(
    /\d+\.\d+\.\d+/,
  );
});

scenario('left navigation switches view and updates the canvas', async () => {
  const { window } = harness;

  await window.click('[data-testid="nav-recents"]');
  await expect(window.locator('.toolbar__title')).toHaveText('Recents');

  // Recents has 6 sample rows; library has 12. A count change proves the view
  // re-rendered rather than only re-labelling.
  await expect(window.locator('.card')).toHaveCount(6);

  await window.click('[data-testid="nav-library"]');
  await expect(window.locator('.card')).toHaveCount(12);
});

scenario('grid and list modes swap the content layout', async () => {
  const { window } = harness;

  await window.click('[data-testid="mode-list"]');
  await expect(window.locator('[data-testid="view-list"]')).toBeVisible();

  // A computed-style check, not a class-name check: a dropped CSS selector
  // still leaves the class in place.
  const listDisplay = await window
    .locator('[data-testid="view-list"]')
    .evaluate((node) => getComputedStyle(node).display);
  expect(listDisplay).toBe('flex');

  await window.click('[data-testid="mode-grid"]');
  const gridStyles = await window
    .locator('[data-testid="view-grid"]')
    .evaluate((node) => {
      const style = getComputedStyle(node);
      return { display: style.display, gap: style.rowGap };
    });

  expect(gridStyles.display).toBe('grid');
  // The historical failure mode: the gap resolves to `normal` or `0px`,
  // because the token never reached the element. The number tracks
  // `--space-3`, which the grid moved to when the type ramp grew and the
  // cards needed the room back.
  expect(gridStyles.gap).toBe('12px');
});

scenario('both side panels collapse and expand', async () => {
  const { window } = harness;

  const navWidth = () =>
    window
      .locator('[data-testid="left-nav"]')
      .evaluate((node) => node.getBoundingClientRect().width);

  const inspectorWidth = () =>
    window
      .locator('[data-testid="inspector"]')
      .evaluate((node) => node.getBoundingClientRect().width);

  const navExpanded = await navWidth();
  await window.click('[data-testid="toggle-left"]');
  await expect.poll(navWidth).toBeLessThan(navExpanded);

  await window.click('[data-testid="toggle-left"]');
  await expect.poll(navWidth).toBeGreaterThan(0);

  const inspectorExpanded = await inspectorWidth();
  await window.click('[data-testid="toggle-right"]');
  await expect.poll(inspectorWidth).toBeLessThan(inspectorExpanded);

  await window.click('[data-testid="toggle-right"]');
  await expect.poll(inspectorWidth).toBeGreaterThan(0);
});

scenario('tabs open and close', async () => {
  const { window } = harness;

  const tabs = window.locator('.tab');
  const before = await tabs.count();

  await window.click('[data-testid="tab-new"]');
  await window.getByTestId('terminal-launcher').getByRole('button', {
    name: 'Local',
    exact: true,
  }).click();
  await expect(tabs).toHaveCount(before + 1);

  await window.locator('.tab__close').last().click();
  await expect(tabs).toHaveCount(before);
});

scenario('selecting an item fills the inspector', async () => {
  const { window } = harness;

  await window.locator('.card').first().click();
  await expect(window.locator('[data-testid="inspector"]')).toContainText(
    'Properties',
  );
});

/* ---------------------------------------------------------------- profile */

scenario('the title bar carries one profile control', async () => {
  const { window } = harness;

  // One, not two. The right-hand controls were de-duplicated once already,
  // and a second account button is the easiest way to undo that.
  await expect(window.locator('[data-testid="profile"]')).toHaveCount(1);

  // The name, not the state. Which account is signed in is another test's
  // business, and these run in a random order.
  await expect(window.locator('[data-testid="profile"]')).toHaveAttribute(
    'aria-label',
    /^Account: /,
  );
});

scenario('the profile menu opens the usage dashboard in a tab', async () => {
  const { window } = harness;

  const tabs = window.locator('.tab');
  const before = await tabs.count();

  await window.click('[data-testid="profile"]');
  await window.click('[data-testid="menu-usage"]');

  await expect(tabs).toHaveCount(before + 1);
  await expect(window.locator('[data-testid="settings-usage"]')).toBeVisible();
  await expect(window.locator('[data-testid="usage-summary"]')).toContainText(
    'requests',
  );

  await expect(window.locator('[data-testid="left-nav"]')).toBeVisible();
});

scenario('the profile menu opens the API keys dialog', async () => {
  const { window } = harness;

  await window.click('[data-testid="profile"]');
  await window.click('[data-testid="menu-api-keys"]');

  const dialog = window.locator('[data-testid="settings-api-keys"]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('role', 'dialog');
  await expect(window.locator('[data-testid="client-client-1-key"]')).toHaveText(
    /^•+$/,
  );

  await window.click('[data-testid="api-keys-done"]');
  await expect(dialog).toBeHidden();
});

scenario('signing out empties the profile control', async () => {
  const { window } = harness;
  const profile = window.locator('[data-testid="profile"]');

  await profile.click();
  await window.click('[data-testid="menu-sign-out"]');
  await expect(profile).toHaveAttribute('aria-label', 'Account: not signed in');

  // Back in, so the shared application is where the next test expects it.
  await profile.click();
  await window.click('[data-testid="menu-sign-in"]');
  await expect(profile).toHaveAttribute('aria-label', 'Account: Avery Chen');
});

scenario('card name and subtitle sit on separate lines', async () => {
  const { window } = harness;

  // Regression guard. Both were inline spans once, so they rendered as
  // "Design systemEdited 1 day ago" on one line. Only real layout catches it:
  // the DOM and the class names were correct throughout.
  const card = window.locator('.card').first();
  const nameBox = await card.locator('.card__name').boundingBox();
  const subBox = await card.locator('.card__sub').boundingBox();

  expect(nameBox).not.toBeNull();
  expect(subBox).not.toBeNull();
  expect(subBox!.y).toBeGreaterThanOrEqual(nameBox!.y + nameBox!.height);
});

/* --------------------------------------------------------------- terminal */

scenario('a new tab opens a real xterm terminal', async () => {
  const { window } = harness;

  await window.click('[data-testid="tab-new"]');
  const launcher = window.getByTestId('terminal-launcher');
  await launcher.getByRole('textbox', { name: 'Search terminal profiles' }).fill('');
  await launcher.getByRole('button', {
    name: 'Local',
    exact: true,
  }).click();

  const terminal = window.locator('[data-testid="terminal"]').last();
  await expect(terminal).toBeVisible({ timeout: 20_000 });

  const input = terminal.getByRole('textbox', { name: 'Terminal input' });
  await expect(input).toBeVisible({ timeout: 20_000 });

  const box = await terminal.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);

  const frame = await terminal.evaluate((node) => {
    const terminalBox = node.getBoundingClientRect();
    const hostBox = node.parentElement!.getBoundingClientRect();
    const style = getComputedStyle(node);
    return {
      insetTop: terminalBox.top - hostBox.top,
      insetLeft: terminalBox.left - hostBox.left,
      radius: style.borderRadius,
      shadow: style.boxShadow,
    };
  });
  expect(frame).toEqual({ insetTop: 8, insetLeft: 8, radius: '7px', shadow: 'none' });

  await expect(window.locator('.statusbar')).toHaveCount(0);
  const viewport = terminal.locator('.xterm-viewport');
  await expect(viewport).toBeVisible();
  expect(await viewport.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(
    await terminal.evaluate((node) => getComputedStyle(node).backgroundColor),
  );
  await capture(window, path.join('test-results', 'terminal-surface.png'));
});

scenario('a terminal takes its colours from the design tokens', async () => {
  const { window } = harness;

  // The emulator draws to a canvas, so it inherits nothing from CSS. It used
  // to carry the dark palette as three literal hex values, which left the
  // terminal dark in the light theme and made `docs/architecture.md`'s "no
  // component contains a hex value" false.
  //
  // This samples the rendered terminal surface rather than the theme object
  // the emulator was handed.
  //
  // A terminal keeps the scheme it opened in: the theme is set at construction.
  // Rebuilding it would wipe the scrollback, so this opens a second terminal after
  // switching, rather than expecting the first to follow.
  const openTerminal = async () => {
    await window.click('[data-testid="tab-new"]');
    await window.getByTestId('terminal-launcher').getByRole('button', {
      name: 'Local',
      exact: true,
    }).click();
    const terminal = window.locator('[data-testid="terminal"]').last();
    await expect(terminal.getByRole('textbox', { name: 'Terminal input' })).toBeVisible({
      timeout: 20_000,
    });
    return terminal;
  };

  const background = (terminal: Locator) =>
    terminal.evaluate((node) => getComputedStyle(node).backgroundColor);

  const dark = await openTerminal();
  // `--bg-canvas`, dark: #101216.
  await expect.poll(() => background(dark), { timeout: 20_000 }).toBe('rgb(16, 18, 22)');

  try {
    await setTheme(window, 'light');
    const light = await openTerminal();
    // `--bg-canvas`, light: #eef0f4.
    await expect.poll(() => background(light), { timeout: 20_000 }).toBe('rgb(238, 240, 244)');
  } finally {
    // A persisted preference, and the order of these scenarios is random.
    await setTheme(window, 'dark');
  }
});

scenario('the terminal runs a command and shows its output', async () => {
  const { window } = harness;

  await window.click('[data-testid="tab-new"]');
  const launcher = window.locator('[data-testid="terminal-launcher"]');
  await expect(launcher).toBeVisible();
  await launcher.getByRole('button', { name: 'Local', exact: true }).click();

  const terminal = window.locator('[data-testid="terminal"]').last();
  await expect(terminal.getByRole('textbox', { name: 'Terminal input' })).toBeVisible({
    timeout: 20_000,
  });
  await terminal.click();

  // A marker unlikely to appear in a shell banner, so a match is real output.
  await window.keyboard.type('echo XTERM_OK_7391');
  await window.keyboard.press('Enter');

  // Read the emulator's own buffer. The renderer draws to a canvas, so there
  // is no DOM text to assert on, and a pixel comparison would prove nothing
  // about what the terminal actually parsed.
  await expect
    .poll(
      () => terminalScreen(terminal),
      { timeout: 20_000, message: 'terminal never echoed the command output' },
    )
    .toContain('XTERM_OK_7391');
});

scenario('terminal shortcuts create right and down splits', async () => {
  const { window } = harness;

  await window.click('[data-testid="tab-new"]');
  const launcher = window.locator('[data-testid="terminal-launcher"]');
  await expect(launcher).toBeVisible();
  await launcher.getByRole('button', { name: 'Local', exact: true }).click();

  const activeTab = window.locator('.tab[aria-selected="true"]');
  await expect(activeTab).not.toHaveText('Local');

  const terminals = window.locator('[data-testid="terminal"]:visible');
  await expect(terminals).toHaveCount(1, { timeout: 20_000 });
  await terminals.first().click();
  await window.keyboard.press('Meta+d');
  await expect(terminals).toHaveCount(2, { timeout: 20_000 });

  const left = await terminals.nth(0).boundingBox();
  const right = await terminals.nth(1).boundingBox();
  expect(left).not.toBeNull();
  expect(right).not.toBeNull();
  expect(right!.x).toBeGreaterThan(left!.x);
  expect(Math.abs(right!.y - left!.y)).toBeLessThan(10);
  expect(right!.x - (left!.x + left!.width)).toBeGreaterThanOrEqual(8);
  expect(right!.x - (left!.x + left!.width)).toBeLessThanOrEqual(10);

  await terminals.nth(1).click();
  await window.keyboard.press('Meta+Shift+d');
  await expect(terminals).toHaveCount(3, { timeout: 20_000 });

  const upperRight = await terminals.nth(1).boundingBox();
  const lowerRight = await terminals.nth(2).boundingBox();
  expect(upperRight).not.toBeNull();
  expect(lowerRight).not.toBeNull();
  expect(lowerRight!.y).toBeGreaterThan(upperRight!.y);
  expect(Math.abs(lowerRight!.x - upperRight!.x)).toBeLessThan(10);
  expect(lowerRight!.y - (upperRight!.y + upperRight!.height)).toBeGreaterThanOrEqual(8);
  expect(lowerRight!.y - (upperRight!.y + upperRight!.height)).toBeLessThanOrEqual(10);

  await window.keyboard.press('Meta+[');
  await expect.poll(() => terminals.evaluateAll((nodes) =>
    nodes.findIndex((node) => node.contains(document.activeElement)))).toBe(1);
  await window.keyboard.press('Meta+]');
  await expect.poll(() => terminals.evaluateAll((nodes) =>
    nodes.findIndex((node) => node.contains(document.activeElement)))).toBe(2);

  await capture(window, path.join('test-results', 'terminal-splits.png'));
});

/* ------------------------------------------------------------- registration */

registerShuffled((name, run) => {
  test(name, run);
});

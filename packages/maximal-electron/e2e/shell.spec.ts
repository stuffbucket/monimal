import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  closeApp,
  getPrefs,
  launchApp,
  providerStatus,
  resetShell,
  setPrefs,
  setTheme,
  terminalScreen,
  type Harness,
} from './harness.js';
import { SCRIPTED_MODEL, startScriptedModel, type ScriptedModel } from './model-server.js';
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
 * The application is pinned to the scripted backend in `e2e/model-server.ts`,
 * so the agent scenarios run on a machine with no model. Read that file before
 * changing one: it says what a scripted reply can and cannot prove.
 */

let harness: Harness;
let model: ScriptedModel;

const { scenario, registerShuffled } = createRegistry();

test.beforeAll(async () => {
  model = await startScriptedModel();
  harness = await launchApp({
    STUFFBUCKET_PROVIDER: 'ollama',
    STUFFBUCKET_PROVIDER_URL: model.baseUrl,
  });
});

test.beforeEach(async () => {
  await resetShell(harness);
});

test.afterAll(async () => {
  await closeApp(harness);
  await model.stop();
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

  // The tab is the point: the shell behind it is still the shell.
  await expect(window.locator('[data-testid="left-nav"]')).toBeVisible();
});

scenario('the profile menu opens the API keys dialog', async () => {
  const { window } = harness;

  await window.click('[data-testid="profile"]');
  await window.click('[data-testid="menu-api-keys"]');

  const dialog = window.locator('[data-testid="settings-api-keys"]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('role', 'dialog');

  // Masked until asked. The value behind it is a sample, not a credential.
  await expect(window.locator('[data-testid="client-client-1-key"]')).toHaveText(
    /^•+$/,
  );

  // Closed again, because a dialog left up would swallow the next test's
  // clicks and `resetShell` only closes tabs.
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

scenario('a new tab opens a real Ghostty terminal', async () => {
  const { window } = harness;

  await window.click('[data-testid="tab-new"]');

  const terminal = window.locator('[data-testid="terminal"]').last();
  await expect(terminal).toBeVisible({ timeout: 20_000 });

  // ghostty-web renders to a canvas. Its presence proves `init()` resolved and
  // the WebAssembly parser is live, not that a div exists.
  const canvas = terminal.locator('canvas').first();
  await expect(canvas).toBeVisible({ timeout: 20_000 });

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);
});

scenario('a terminal takes its colours from the design tokens', async () => {
  const { window } = harness;

  // The emulator draws to a canvas, so it inherits nothing from CSS. It used
  // to carry the dark palette as three literal hex values, which left the
  // terminal dark in the light theme and made `docs/architecture.md`'s "no
  // component contains a hex value" false.
  //
  // This samples the canvas rather than the theme object the emulator was
  // handed. Only a pixel proves the colour reached the screen.
  //
  // A terminal keeps the scheme it opened in: the colours are baked into the
  // WebAssembly terminal at construction, and the only supported way to
  // rebuild it wipes the scrollback. So this opens a second terminal after
  // switching, rather than expecting the first to follow.
  const openTerminal = async () => {
    await window.click('[data-testid="tab-new"]');
    const terminal = window.locator('[data-testid="terminal"]').last();
    const canvas = terminal.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 20_000 });
    return canvas;
  };

  // Mid-width and near the bottom. The prompt sits at the top left and the
  // scrollbar hugs the right edge, so this stays background.
  const background = (canvas: Locator) =>
    canvas.evaluate((node) => {
      const element = node as HTMLCanvasElement;
      const context = element.getContext('2d', { willReadFrequently: true });
      if (!context) return null;
      const x = Math.floor(element.width / 2);
      const y = element.height - 6;
      return Array.from(context.getImageData(x, y, 1, 1).data.slice(0, 3));
    });

  const dark = await openTerminal();
  // `--bg-canvas`, dark: #101216.
  await expect.poll(() => background(dark), { timeout: 20_000 }).toEqual([
    16, 18, 22,
  ]);

  try {
    await setTheme(window, 'light');
    const light = await openTerminal();
    // `--bg-canvas`, light: #eef0f4.
    await expect.poll(() => background(light), { timeout: 20_000 }).toEqual([
      238, 240, 244,
    ]);
  } finally {
    // A persisted preference, and the order of these scenarios is random.
    await setTheme(window, 'dark');
  }
});

scenario('the terminal runs a command and shows its output', async () => {
  const { window } = harness;

  await window.click('[data-testid="tab-new"]');
  const terminal = window.locator('[data-testid="terminal"]').last();
  await expect(terminal.locator('canvas').first()).toBeVisible({
    timeout: 20_000,
  });
  await terminal.click();

  // A marker unlikely to appear in a shell banner, so a match is real output.
  await window.keyboard.type('echo GHOSTTY_OK_7391');
  await window.keyboard.press('Enter');

  // Read the emulator's own buffer. The renderer draws to a canvas, so there
  // is no DOM text to assert on, and a pixel comparison would prove nothing
  // about what the terminal actually parsed.
  await expect
    .poll(
      () => terminalScreen(terminal),
      { timeout: 20_000, message: 'terminal never echoed the command output' },
    )
    .toContain('GHOSTTY_OK_7391');
});

/* ---------------------------------------------------------------- overlay */

scenario('the overlay card is a real dialog', async () => {
  const { app, window } = harness;

  await window.click('[data-testid="toggle-overlay"]');
  const overlay =
    app.windows().find((page) => page.url().includes('overlay')) ??
    (await app.waitForEvent('window', { timeout: 15_000 }));
  const card = overlay.locator('[data-testid="overlay-card"]');
  await expect(card).toBeVisible({ timeout: 15_000 });

  /*
   * This card was a div with a click handler: no role, no accessible name, and
   * Tab walked straight out of it. The three keyboard rules that were already
   * right are covered by scenarios below, but those need a running local
   * model, so they skip here and in CI. These four do not need one, and they
   * are what the migration onto a dialog was for.
   */
  await expect(card).toHaveAttribute('role', 'dialog');
  await expect(card).toHaveAttribute('aria-labelledby', /.+/);

  // Radix marks the rest of the document inert rather than setting
  // `aria-modal`, which is the better-supported of the two.
  const modality = await overlay.evaluate(() => {
    const content = document.querySelector('[data-testid="overlay-card"]');
    const siblings = [...document.body.children].filter(
      (element) => !element.contains(content),
    );
    return {
      focusInside: content?.contains(document.activeElement) ?? false,
      siblingsHidden: siblings.every(
        (element) => element.getAttribute('aria-hidden') === 'true',
      ),
    };
  });

  expect(modality.focusInside, 'focus should start inside the card').toBe(true);
  expect(modality.siblingsHidden, 'the rest of the document should be inert').toBe(
    true,
  );

  await overlay.keyboard.press('Escape');
});

/**
 * What Tab can reach, by the definition a browser uses.
 *
 * Radix gives the card itself `tabindex="-1"`, so it is focusable
 * programmatically and unreachable by Tab. Excluding it is the point: a walk
 * that counted it would report a scope of one over a card with no fields.
 */
const TABBABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Where focus is now, and what holds it.
 *
 * Read from `document.activeElement` after every press rather than from a
 * `focusin` listener. Focus leaving the last field of an untrapped dialog
 * lands on `document.body`, and that fires no `focusin` at all, so a listener
 * records nothing and the walk reads as clean. The escape this test exists to
 * catch is exactly that one.
 */
function focusHolder(overlay: Page): Promise<{ inside: boolean; element: string }> {
  return overlay.evaluate(() => {
    const card = document.querySelector('[data-testid="overlay-card"]');
    const active = document.activeElement;
    const name = active
      ? `${active.tagName.toLowerCase()}${active.getAttribute('data-testid') ? `[${active.getAttribute('data-testid') ?? ''}]` : ''}`
      : 'nothing';
    return { inside: Boolean(card && active && card.contains(active)), element: name };
  });
}

/** Press a key `times` times, recording where focus sat after each press. */
async function walk(
  overlay: Page,
  key: 'Tab' | 'Shift+Tab',
  times: number,
): Promise<{ inside: boolean; element: string }[]> {
  const trail: { inside: boolean; element: string }[] = [];
  for (let press = 0; press < times; press += 1) {
    await overlay.keyboard.press(key);
    trail.push(await focusHolder(overlay));
  }
  return trail;
}

/**
 * Somewhere for focus to escape to, and the count of what can hold it.
 *
 * The overlay window holds the dialog and nothing else. With one field inside
 * the card and no background content, Tab has nowhere to go, and a card with
 * no trap at all walks exactly like a trapped one — the check would pass while
 * examining nothing. So the walk supplies the background element. Radix marks
 * the siblings that exist when the dialog mounts; this one arrives afterwards,
 * which is the harder case and the one a later render would produce.
 */
const HATCH = 'focus-escape-hatch';

async function openEscapeHatch(overlay: Page): Promise<void> {
  await overlay.evaluate((testId) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset['testid'] = testId;
    button.textContent = 'outside the card';
    document.body.append(button);
  }, HATCH);
}

async function closeEscapeHatch(overlay: Page): Promise<void> {
  await overlay.evaluate((testId) => {
    document.querySelector(`[data-testid="${testId}"]`)?.remove();
  }, HATCH);
}

/**
 * Tell the renderer it has the keyboard, without taking the user's.
 *
 * Sequential focus navigation is the browser's own, and Chromium performs it
 * only for a focused widget. The suite parks its windows off the side of the
 * display and never activates them, so a dispatched Tab arrives and moves
 * nothing: the walk reads as trapped whatever the dialog does. `bringToFront`
 * would fix it by pulling the keyboard out of whatever the developer is doing,
 * once per run. Focus emulation is the same claim made to the renderer alone.
 */
async function withKeyboardFocus<T>(page: Page, run: () => Promise<T>): Promise<T> {
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  try {
    return await run();
  } finally {
    await session
      .send('Emulation.setFocusEmulationEnabled', { enabled: false })
      .catch(() => undefined);
    await session.detach().catch(() => undefined);
  }
}

/** What Tab can reach inside the card, and what it can reach outside it. */
function tabbableCounts(
  overlay: Page,
): Promise<{ inside: number; outside: number; hatch: boolean }> {
  return overlay.evaluate(
    ({ selector, testId }) => {
      const card = document.querySelector('[data-testid="overlay-card"]');
      const all = [...document.querySelectorAll(selector)];
      const inside = all.filter((element) => card?.contains(element) === true);
      const outside = all.filter((element) => card?.contains(element) !== true);
      return {
        inside: inside.length,
        outside: outside.length,
        hatch: outside.some((element) => element.getAttribute('data-testid') === testId),
      };
    },
    { selector: TABBABLE, testId: HATCH },
  );
}

scenario('Tab and Shift+Tab stay inside the overlay dialog', async () => {
  /*
   * The trap, walked. `role="dialog"` and an inert background declare a modal
   * to assistive technology; neither enforces one, and axe reports no
   * violation against a dialog focus still escapes from. The scenario above
   * checks the declaration. This presses the key.
   *
   * No model is needed: the card renders and traps focus whatever the provider
   * reports, which is why this runs in CI while the agent scenarios skip. See
   * #131.
   */
  const overlay = await openOverlay();

  await openEscapeHatch(overlay);
  try {
    await withKeyboardFocus(overlay, async () => {
      // The card renders while the provider is still being probed, and in that
      // moment it holds a disabled field and no buttons. Waiting for something
      // Tab can reach is the floor: a card that never grows one fails here
      // rather than reporting a walk over nothing.
      await expect
        .poll(async () => (await tabbableCounts(overlay)).inside, {
          timeout: 15_000,
          message: 'nothing inside the card can be reached by Tab, so a walk would prove nothing',
        })
        .toBeGreaterThan(0);

      const reachable = await tabbableCounts(overlay);
      expect(
        reachable.hatch,
        'the element outside the card is not reachable, so an escape has nowhere to land',
      ).toBe(true);
      // Start the walk somewhere defined. Where focus lands on a summon is the
      // scenario above, and these run in a random order, so this puts it on
      // the first field rather than assuming.
      await overlay.locator('[data-testid="overlay-card"]').locator(TABBABLE).first().focus();
      expect((await focusHolder(overlay)).inside, 'the walk starts inside the card').toBe(
        true,
      );

      // Two past the end. One press per element only proves the last one is
      // reachable; the escape happens on the press after that.
      const presses = reachable.inside + reachable.outside + 2;

      const forward = await walk(overlay, 'Tab', presses);
      expect(
        forward.filter((step) => !step.inside).map((step) => step.element),
        'Tab left the card',
      ).toEqual([]);

      const backward = await walk(overlay, 'Shift+Tab', presses);
      expect(
        backward.filter((step) => !step.inside).map((step) => step.element),
        'Shift+Tab left the card',
      ).toEqual([]);
    });
  } finally {
    // These specs share one overlay page, and they run in a random order.
    await closeEscapeHatch(overlay);
  }

  // Escape hands the window back to the main process. Hiding and summoning
  // again must not leave focus outside the card, because the next key the user
  // presses goes wherever it sits.
  const handle = await harness.app.browserWindow(overlay);
  await overlay.keyboard.press('Escape');
  await expect
    .poll(() => handle.evaluate((win) => win.isVisible()), { timeout: 10_000 })
    .toBe(false);

  await openOverlay();
  expect((await focusHolder(overlay)).inside, 'focus should return inside the card').toBe(
    true,
  );

  await overlay.keyboard.press('Escape');
});

scenario('the floating overlay summons and dismisses', async () => {
  const { app, window } = harness;

  await window.click('[data-testid="toggle-overlay"]');

  const overlay =
    app.windows().find((page) => page.url().includes('overlay')) ??
    (await app.waitForEvent('window', { timeout: 15_000 }));
  await overlay.waitForSelector('[data-testid="overlay-card"]', {
    timeout: 15_000,
  });

  // The status line reports the backend, or says plainly that none is running.
  await expect(overlay.locator('[data-testid="overlay-status"]')).not.toBeEmpty();

  // Ask the BrowserWindow, not the document. `document.visibilityState` stays
  // "visible" for a hidden Electron window, so it proves nothing here.
  //
  // Both directions poll. `showInactive` and `hide` are asynchronous on macOS,
  // so a bare assertion races the window server and fails intermittently.
  const handle = await app.browserWindow(overlay);

  await expect
    .poll(() => handle.evaluate((win) => win.isVisible()), { timeout: 10_000 })
    .toBe(true);

  // The reference image is captured separately. It is a documentation
  // artifact, and a runner that cannot composite the overlay should not fail a
  // behaviour test.

  await overlay.keyboard.press('Escape');

  await expect
    .poll(() => handle.evaluate((win) => win.isVisible()), { timeout: 10_000 })
    .toBe(false);
});

/**
 * Summon the overlay and wait for its card.
 *
 * Three agent scenarios need this, and the window lookup has to tolerate the
 * overlay already existing from an earlier test in the shuffled order.
 */
async function openOverlay() {
  const { app, window } = harness;

  await window.click('[data-testid="toggle-overlay"]');
  const overlay =
    app.windows().find((page) => page.url().includes('overlay')) ??
    (await app.waitForEvent('window', { timeout: 15_000 }));
  await overlay.waitForSelector('[data-testid="overlay-card"]', {
    timeout: 15_000,
  });

  return overlay;
}

/**
 * Insist the run is about to use the scripted backend.
 *
 * The floor for every agent scenario. This file starts the backend, so anything
 * else answering is a defect rather than a machine without a model. The model
 * name is distinctive, so a real Ollama on the developer's machine cannot
 * satisfy this by accident.
 */
async function requireScriptedBackend(overlay: Page) {
  await expect
    .poll(() => providerStatus(overlay), { timeout: 15_000 })
    .toEqual({ state: 'ready', provider: 'ollama', model: SCRIPTED_MODEL });
}

/**
 * State the preferences the gate reads, rather than trusting the defaults.
 *
 * `agentApproval` and `agentTools` persist, and these scenarios run in a random
 * order against one profile.
 */
async function armTheGate() {
  const before = await getPrefs(harness.window);
  await setPrefs(harness.window, { agentApproval: 'writes', agentTools: true });
  return before;
}

/**
 * A file only a real shell can write, and a path a shell writes on either
 * platform.
 *
 * This is what makes the gate scenarios mean something. The backend is
 * scripted, so it chooses what comes back: an assertion that the answer
 * contains a marker would pass with the shell never touched, because the
 * script put the marker there. The filesystem cannot be scripted.
 *
 * Git Bash on the Windows runner takes a `C:/…` path, so one form works on
 * both.
 */
function sentinel(): { file: string; shellPath: string } {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'overlay-gate-')), 'ran.txt');
  return { file, shellPath: file.split(path.sep).join('/') };
}

function contents(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

scenario('the overlay streams an answer back into the card', async () => {
  const overlay = await openOverlay();
  await requireScriptedBackend(overlay);

  await overlay.fill('[data-testid="overlay-input"]', 'Reply with exactly: OVERLAY_OK');
  await overlay.keyboard.press('Enter');

  // The answer arrives as `agent:delta` events, so this asserts the whole path:
  // the pi agent loop, the provider's HTTP and SSE handling, the IPC events,
  // and incremental render. The scripted backend sends the word in several
  // deltas rather than one, so a card that only rendered the last chunk fails.
  await expect(overlay.locator('[data-testid="overlay-answer"]')).toContainText(
    'OVERLAY_OK',
    { timeout: 30_000 },
  );

  expect(model.calls.length, 'the scripted backend answered').toBeGreaterThan(0);

  await overlay.keyboard.press('Escape');
});

scenario('the overlay agent asks before it runs bash, and runs it when allowed', async () => {
  const overlay = await openOverlay();
  await requireScriptedBackend(overlay);
  const before = await armTheGate();

  const ran = sentinel();

  try {
    // A tool call is what separates the pi agent loop from a plain chat call.
    // `tee` writes the marker to a file and prints it, so the run leaves
    // evidence in two places that mean different things.
    await overlay.fill(
      '[data-testid="overlay-input"]',
      `Use your bash tool to run: printf '%s' AGENT_TOOL_5521 | tee '${ran.shellPath}' — then report the output.`,
    );
    await overlay.keyboard.press('Enter');

    // The gate must fire first. `agentApproval` is `writes`, and bash is not a
    // read, so nothing should reach the shell without this prompt.
    const approval = overlay.locator('[data-testid="overlay-approval"]');
    await expect(approval).toBeVisible({ timeout: 30_000 });
    await expect(
      overlay.locator('[data-testid="overlay-approval-summary"]'),
    ).toContainText('AGENT_TOOL_5521');

    // Nothing has run yet. Without this the scenario would pass against a gate
    // that shows a card after starting the command.
    expect(contents(ran.file), 'the shell ran before anyone allowed it').toBeUndefined();

    // The prompt has to be on screen, not merely in the DOM. A hidden window
    // still answers every locator, so this is the only assertion that proves
    // the user could actually have seen the question.
    const handle = await harness.app.browserWindow(overlay);
    await expect
      .poll(() => handle.evaluate((win) => win.isVisible()), { timeout: 10_000 })
      .toBe(true);

    await overlay.click('[data-testid="overlay-allow"]');

    // The file is the proof that a shell ran. The answer is the proof that the
    // output travelled back through the tool loop to the model.
    await expect
      .poll(() => contents(ran.file), {
        timeout: 30_000,
        message: 'the allowed command never reached a shell',
      })
      .toContain('AGENT_TOOL_5521');

    await expect(overlay.locator('[data-testid="overlay-answer"]')).toContainText(
      'AGENT_TOOL_5521',
      { timeout: 30_000 },
    );

    await overlay.keyboard.press('Escape');
  } finally {
    await setPrefs(harness.window, before);
  }
});

scenario('Escape answers a pending approval rather than dismissing the overlay', async () => {
  const overlay = await openOverlay();
  await requireScriptedBackend(overlay);
  const before = await armTheGate();

  const ran = sentinel();

  try {
    await overlay.fill(
      '[data-testid="overlay-input"]',
      `Use your bash tool to run: printf '%s' AGENT_DENY_7788 | tee '${ran.shellPath}'`,
    );
    await overlay.keyboard.press('Enter');

    const approval = overlay.locator('[data-testid="overlay-approval"]');
    await expect(approval).toBeVisible({ timeout: 30_000 });

    await overlay.keyboard.press('Escape');

    // The prompt goes, and the card stays. A pending question owns Escape, so
    // denying a tool call must not also tear down the run behind it.
    await expect(approval).toBeHidden();
    await expect(overlay.locator('[data-testid="overlay-card"]')).toBeVisible();

    // The run carries on, and the model is told what happened. Waiting for
    // that is what gives a command that was wrongly allowed the time to have
    // run, so the filesystem claim below is made against a finished run.
    const answer = overlay.locator('[data-testid="overlay-answer"]');
    await expect(answer).toBeVisible({ timeout: 30_000 });

    // What a denial is for, and the strongest claim here. A card that closes is
    // not a command that did not run, and only one of those is the property
    // worth protecting.
    expect(contents(ran.file), 'the denied command reached a shell anyway').toBeUndefined();

    // The refusal reached the loop rather than only the card.
    await expect(answer).toContainText('denied', { timeout: 30_000 });

    await overlay.keyboard.press('Escape');
  } finally {
    await setPrefs(harness.window, before);
  }
});

/* ------------------------------------------------------------- registration */

registerShuffled((name, run) => {
  test(name, run);
});

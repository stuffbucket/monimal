import { expect, test, type Page } from '@playwright/test'

import { cleanupPackagedApp, launchPackagedApp, type RunningApp, waitForLine } from './support/launch'
import { findProcessesContaining } from './support/process-search'
import { assertContrastAtLeast, assertFocusOutlineResolves, assertNoVerticalOverlap, assertWithinWindow } from './support/visual-invariants'

/*
 * Packaged-app E2E — a SMALL, high-value suite, not a broad one.
 *
 * Every test here shares one launch of one relocated copy of the packaged app
 * (support/relocate-app.ts explains the relocation). The properties under test
 * — relocation held, sidecar reached ready, window rendered, shutdown was clean
 * — all describe a single run's lifecycle, so a package build per test would
 * lengthen an already slow suite without covering anything more.
 *
 * Requires `npm run package` to have already produced
 * client/out/Maximal-darwin-<arch>/Maximal.app — this suite never builds it
 * for you. See package.json's `e2e` script / client-ci.yml for the gate that
 * fails loudly instead of silently skipping when that build is missing.
 */

let running: RunningApp

test.beforeAll(async () => {
  running = await launchPackagedApp()
})

test.afterAll(async () => {
  // The last test in this file already closes the app itself (to assert
  // clean shutdown) — closing an already-closed ElectronApplication is safe
  // to attempt again but may reject, so tolerate that here rather than
  // letting a redundant close mask the real test result or skip cleanup.
  try {
    if (running?.app) await running.app.close()
  } catch {
    // already closed
  }
  if (running) cleanupPackagedApp(running)
})

test('launches from a relocated copy and the sidecar reaches ready', async () => {
  // Relocation is asserted during launch; this line is the proof that the
  // relocated copy then boots — the sidecar spawned, bound a port, and main saw
  // it come up.
  await waitForLine(running.lines, /\[maximal-client\] core ready — control /)
})

test('window opens with exactly one non-empty primary heading', async () => {
  const window = await running.app.firstWindow()
  const headings = window.locator('h1')

  // Which surface is showing depends on auth and sidecar state, so the
  // heading's text is not fixed and the count is what the app guarantees: one
  // primary heading per view. Two means two surfaces are mounted at once.
  await expect(headings).toHaveCount(1)
  await expect(headings.first()).not.toBeEmpty()

  // The frame's root is fixed-positioned and fills the window, so a second one
  // does not sit beside the first — it covers it, along with anything else on
  // screen. Both the signed-in frame and first-run's render this class, so one
  // is the count in either state.
  await expect(window.locator('.sb-shell.app')).toHaveCount(1)

  // `.titlebar` carries `-webkit-app-region: drag`, and the window has a hidden
  // native frame, so this element is the only thing a user can drag the window
  // by. Without it the window cannot be moved at all.
  await expect(window.locator('.sb-shell.app .titlebar')).toBeVisible()

  // The frame's size comes from a chain the package only half provides: its
  // root is `position: var(--shell-position, fixed); inset: 0`, and the mounting
  // surface supplies the grow factor `.panel` lacks. Every way that chain breaks
  // leaves the class names intact and the box short, so the box is what to
  // measure.
  const frameBox = await window.locator('.sb-shell.app').boundingBox()
  const viewport = await window.evaluate(() => ({
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  }))
  expect(frameBox, 'the frame should have a layout box at all').not.toBeNull()
  expect(frameBox!.height).toBeGreaterThanOrEqual(viewport.height - 1)
  expect(frameBox!.width).toBeGreaterThanOrEqual(viewport.width - 1)
})

test('packaged preload exposes only the closed named bridge', async () => {
  const page = await running.app.firstWindow()
  const exposed = await page.evaluate(() => ({
    topLevel: Object.keys(window.maximal).sort(),
    control: Object.keys(window.maximal.control).sort(),
    hasCoreOrigin: 'getCoreOrigin' in window.maximal,
    hasWindowRequire: 'require' in window,
  }))

  expect(exposed).toEqual({
    topLevel: [
      'control',
      'getCoreStatus',
      'getProxyUrl',
      'onCoreStatus',
      'openExternal',
    ],
    control: [
      'accountsList',
      'accountsSwitch',
      'authCancel',
      'authSignOut',
      'authStart',
      'authStatus',
      'onChange',
    ],
    hasCoreOrigin: false,
    hasWindowRequire: false,
  })
})

test('renderer window is hardened: contextIsolation, no nodeIntegration, sandboxed', async () => {
  // This package sets none of contextIsolation/nodeIntegration/sandbox — the
  // window comes from the shell dependency. A version bump there could flip
  // `sandbox` to false with no diff in this repository and no failing unit
  // test, and the first symptom would be a renderer holding Node. A unit test
  // would have to read the dependency's own source, which is the thing that
  // changed; only the real window answers.
  //
  // `getLastWebPreferences()` reports the preferences Electron actually applied
  // to this live WebContents, not the options object it was constructed with,
  // so upstream defaults and overrides are already reflected in what it
  // returns. It is absent from Electron's public .d.ts and present at runtime,
  // hence the cast below.
  interface WebContentsWithLegacyPreferences {
    getLastWebPreferences(): Electron.WebPreferences | undefined
  }

  const prefs = await running.app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    const wc = win.webContents as unknown as WebContentsWithLegacyPreferences
    const preferences = wc.getLastWebPreferences()
    if (!preferences) throw new Error('getLastWebPreferences() returned nothing for the app window')
    return preferences
  })

  expect(prefs.contextIsolation).toBe(true)
  expect(prefs.nodeIntegration).toBe(false)
  expect(prefs.sandbox).toBe(true)
})

/**
 * Waits up to `timeoutMs` for `selector`'s first match to become visible,
 * reporting whether it did rather than throwing.
 *
 * The tests below use it to tell the signed-in chrome apart from first-run.
 * This suite is always signed out: `support/launch.ts` gives every run a fresh
 * `--user-data-dir`, and `main/core.ts` scopes `COPILOT_API_HOME` under that
 * same directory, so no GitHub session survives to be resumed. Reaching the
 * signed-in chrome needs a live device-code flow, which is not scriptable here.
 *
 * The assertions are still written against that chrome, because that is the
 * surface whose layout they protect. Each test probes first and either falls
 * back to an equivalent first-run target or skips — never fails — so the suite
 * is green signed out while still being the check that fires once a real
 * session is present.
 */
async function probeVisible(window: Page, selector: string, timeoutMs = 3_000): Promise<boolean> {
  try {
    await window.locator(selector).first().waitFor({ state: 'visible', timeout: timeoutMs })
    return true
  } catch {
    return false
  }
}

const SIGNED_OUT_SKIP_MESSAGE =
  'Package chrome (post sign-in) did not render within the probe window. This harness is ' +
  'structurally always signed out (a fresh --user-data-dir per run scopes COPILOT_API_HOME to an ' +
  'empty profile — see src/main/core.ts), which is also the state a real CI machine is in, so this ' +
  'is expected here and is not a failure.'

test('chrome text is not near-invisible against its background', async () => {
  // Every shell control colours itself from `var(--shell-*)`. With none of
  // those properties defined the declarations fall back to inherited or initial
  // values, which is near-black text on a near-black window at roughly 1.1:1 —
  // legible in the DOM, invisible on screen. First-run's controls read the same
  // chain, so either set of targets exercises it.
  const window = await running.app.firstWindow()
  // The panel toggle, not the frame root: first-run mounts a `.sb-shell.app`
  // too, so only the toggle — which the three-panel shell alone renders —
  // identifies the signed-in chrome these branches select between.
  const packageChromeVisible = await probeVisible(
    window,
    '.sb-shell.app .icon-button[data-testid="toggle-left"]',
  )

  const targets = packageChromeVisible
    ? [
        { locator: window.locator('.sb-shell.app .icon-button[data-testid="toggle-left"]'), label: 'titlebar icon button' },
        { locator: window.locator('.sb-shell.app .statusbar span').first(), label: 'status bar text' },
        { locator: window.locator('.sb-shell.app .tab[aria-selected="true"]'), label: 'selected document tab' },
      ]
    : [
        { locator: window.locator('.first-run-heading'), label: 'first-run heading' },
        { locator: window.locator('.first-run-note').first(), label: 'first-run note' },
        { locator: window.locator('.first-run-button--primary'), label: 'first-run primary button' },
      ]

  let checked = 0
  for (const { locator, label } of targets) {
    if ((await locator.count()) === 0) continue
    await assertContrastAtLeast(locator, label)
    checked++
  }
  expect(checked, 'expected at least one on-screen chrome control to check contrast against').toBeGreaterThan(0)
})

test("a focused chrome control's outline actually resolves", async () => {
  // `outline: 2px solid var(--shell-focus, var(--shell-accent))` is invalid at
  // computed-value time when neither property is defined (CSS Custom Properties
  // §3.2), and an invalid declaration computes to `outline: none` — silently,
  // on every focusable shell control at once. First-run's primary button
  // carries the same rule shape, so either target exercises it.
  const window = await running.app.firstWindow()
  // The panel toggle, not the frame root: first-run mounts a `.sb-shell.app`
  // too, so only the toggle — which the three-panel shell alone renders —
  // identifies the signed-in chrome these branches select between.
  const packageChromeVisible = await probeVisible(
    window,
    '.sb-shell.app .icon-button[data-testid="toggle-left"]',
  )

  const target = packageChromeVisible
    ? window.locator('.sb-shell.app .icon-button[data-testid="toggle-left"]')
    : window.locator('.first-run-button--primary')
  const label = packageChromeVisible ? 'titlebar icon button' : 'first-run primary button'

  await expect(target).toBeVisible()
  await assertFocusOutlineResolves(window, target, label)
})

test('nav rail entries do not overlap vertically', async () => {
  // `.nav__item` is a hardcoded `height: 30px`, so a label that wraps to a
  // second line paints outside its own row and over the next one. First-run has
  // no repeated list at a fixed row height, so there is nothing equivalent to
  // check signed out.
  const window = await running.app.firstWindow()
  // The Runs tab specifically: first-run's frame has a tab strip of its own, so
  // the presence of a tab does not mean the view tabs this test drives exist.
  if (!(await probeVisible(window, '.sb-shell.app .tab:has-text("Runs")'))) {
    test.skip(true, SIGNED_OUT_SKIP_MESSAGE)
    return
  }

  await window.locator('.sb-shell.app .tab', { hasText: 'Runs' }).click()

  // `.nav__label`, not `.nav__item`. The item's box stays exactly 30px and
  // flush against its neighbours whether or not the label inside it wraps, so
  // measuring the item reports a healthy layout while the screen is visibly
  // broken. A wrapped label's own box grows past 30px, which is the overlap
  // itself.
  const navLabels = window.locator('[data-testid="projects-nav"] .nav__label')
  await expect(navLabels.first()).toBeVisible()
  await assertNoVerticalOverlap(await navLabels.all(), 'projects nav rail labels')
})

test('status bar text is not clipped at the window edge', async () => {
  // Status items wrap when they do not fit the window's width. If the bar's
  // height is fixed rather than a floor, the wrapped line escapes the box in
  // both directions: up over the document content, and down past the window's
  // bottom edge. First-run has nothing comparable, so this skips signed out.
  const window = await running.app.firstWindow()
  // The Runs tab specifically: first-run's frame has a tab strip of its own, so
  // the presence of a tab does not mean the view tabs this test drives exist.
  if (!(await probeVisible(window, '.sb-shell.app .tab:has-text("Runs")'))) {
    test.skip(true, SIGNED_OUT_SKIP_MESSAGE)
    return
  }

  await window.locator('.sb-shell.app .tab', { hasText: 'Runs' }).click()

  // Per span, not on the container. A fixed-height bar stays nominally within
  // the window while the children that wrapped out of it do not.
  const statusTexts = window.locator('.sb-shell.app .statusbar span')
  const count = await statusTexts.count()
  expect(count, 'expected the status bar to render at least one text span').toBeGreaterThan(0)
  for (const span of await statusTexts.all()) {
    await assertWithinWindow(window, span, 'status bar text')
  }

  // The other direction: status text must not reach up into the document
  // content above it.
  await assertNoVerticalOverlap(
    [window.locator('.tabpanel'), window.locator('.sb-shell.app .statusbar')],
    'tabpanel vs statusbar',
  )

  // The runs canvas is DELIBERATELY internally scrollable (package
  // stylesheet: `.canvas { overflow-y: auto }`) — its CONTENT may legitimately
  // be taller than its box; that is what the scrollbar is for. What must
  // still hold is that its own outer box, like any other panel, fits inside
  // the window rather than being clipped by the window edge itself.
  await assertWithinWindow(window, window.locator('[data-testid="runs-canvas"]'), 'runs canvas (outer box)')
})

test('exits cleanly without orphaning the sidecar process', async () => {
  // appRoot is a fresh mktemp path unique to this run, so a substring match
  // against it cannot collide with an unrelated maximal-core/Electron
  // process already on the machine (e.g. a dev instance).
  const before = findProcessesContaining(running.appRoot)
  expect(before.some((line) => line.includes('maximal-core'))).toBe(true)

  await running.app.close()

  // killCore() sends SIGTERM on 'before-quit' rather than blocking on exit,
  // so give the sidecar a moment to actually finish tearing down before
  // declaring it orphaned.
  const deadline = Date.now() + 10_000
  let remaining: string[]
  do {
    remaining = findProcessesContaining(running.appRoot)
    if (remaining.length === 0) break
    await new Promise((r) => setTimeout(r, 200))
  } while (Date.now() < deadline)

  expect(remaining).toEqual([])
})

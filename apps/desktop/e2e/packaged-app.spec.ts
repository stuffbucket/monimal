import { randomBytes } from 'node:crypto'
import { execFile, execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { expect, test, type Page } from '@playwright/test'
import { spawn as spawnPty } from 'node-pty'

import { SETTINGS_SECTIONS } from '@maximal/maximal-client/shared/settings-sections'

import { cleanupPackagedApp, launchPackagedApp, type RunningApp } from './support/launch'
import { SCRIPTED_ANSWER, SCRIPTED_MODEL, startScriptedModel, type ScriptedModel } from './support/model-server'
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
 * out/Maximal-darwin-<arch>/Maximal.app — this suite never builds it
 * for you. See package.json's `e2e` script / client-ci.yml for the gate that
 * fails loudly instead of silently skipping when that build is missing.
 */

let running: RunningApp
let model: ScriptedModel
const execFileAsync = promisify(execFile)
const EVIDENCE_HOLD_MS = 7_500
const MIN_EVIDENCE_SECONDS = 5
let tmuxSocketDirectory: string | undefined

test.beforeAll(async () => {
  model = await startScriptedModel()
  if (process.platform === 'darwin') {
    tmuxSocketDirectory = mkdtempSync('/tmp/mt-')
  }
  running = await launchPackagedApp({
    MAXIMAL_DISABLE_GLOBAL_KEYBOARD_HOOK: '1',
    STUFFBUCKET_HARNESS_START_OPEN: '1',
    STUFFBUCKET_PROVIDER: 'maximal',
    STUFFBUCKET_PROVIDER_URL: model.baseUrl,
    ...(tmuxSocketDirectory
      ? { TMUX_TMPDIR: tmuxSocketDirectory, TERM: 'xterm-256color' }
      : {}),
  })
})

async function mainWindow(): Promise<Page> {
  await running.app.firstWindow()
  await expect.poll(() =>
    running.app.windows().some((candidate) => candidate.url().includes('/main_window/index.html')),
  ).toBe(true)
  const page = running.app.windows().find((candidate) =>
    candidate.url().includes('/main_window/index.html'),
  )
  if (!page) throw new Error('The packaged main window did not open.')
  return page
}

async function openNativeSettings(label: string): Promise<string[]> {
  return running.app.evaluate(({ BrowserWindow, Menu }, wanted) => {
    const menu = Menu.getApplicationMenu()
    const leaves = process.platform === 'darwin'
      ? menu?.items[0]?.submenu?.items.find((item) => item.label === 'Settings')?.submenu?.items
      : menu?.items.find((item) => item.label === 'Settings')
        ?.submenu?.items.find((item) => item.label === 'Open Section')?.submenu?.items
    const target = leaves?.find((item) => item.label === wanted)
    if (!target) throw new Error(`No native Settings section named ${wanted}`)
    if (typeof target.click !== 'function') throw new Error(`Settings section ${wanted} cannot be opened`)
    const click = target.click as (
      item: typeof target,
      window: ReturnType<typeof BrowserWindow.getFocusedWindow> | undefined,
      event: { keyCode: string; triggeredByAccelerator: boolean; type: 'keyDown' },
    ) => void
    click(
      target,
      BrowserWindow.getFocusedWindow() ?? undefined,
      { keyCode: '', triggeredByAccelerator: false, type: 'keyDown' },
    )
    return leaves?.map((item) => item.label) ?? []
  }, label)
}

async function toggleNativeRecording(output?: string): Promise<void> {
  await running.app.evaluate(({ BrowserWindow, dialog, Menu }, destination) => {
    if (destination) {
      dialog.showSaveDialog = () => Promise.resolve({
        canceled: false,
        filePath: destination,
      })
    }
    const menu = Menu.getApplicationMenu()
    const file = menu?.items.find((item) => item.label === 'File')
    const target = file?.submenu?.items.find((item) =>
      item.label === (destination ? 'Record Window…' : 'Stop Window Recording'),
    )
    if (!target || typeof target.click !== 'function') {
      throw new Error(destination ? 'Record Window menu item is unavailable' : 'Window recording is not active')
    }
    const click = target.click as (
      item: typeof target,
      window: ReturnType<typeof BrowserWindow.getFocusedWindow> | undefined,
      event: { keyCode: string; triggeredByAccelerator: boolean; type: 'keyDown' },
    ) => void
    click(
      target,
      BrowserWindow.getFocusedWindow() ?? undefined,
      { keyCode: '', triggeredByAccelerator: false, type: 'keyDown' },
    )
  }, output)
}

async function startWindowRecording(output: string): Promise<void> {
  await toggleNativeRecording(output)
  await expect.poll(() => running.app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()?.items
      .find((item) => item.label === 'File')
      ?.submenu?.items.some((item) => item.label === 'Stop Window Recording') ?? false,
  )).toBe(true)
}

async function stopWindowRecording(
  output: string,
  screenshot: string,
): Promise<void> {
  await toggleNativeRecording()
  await expect.poll(() => running.app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()?.items
      .find((item) => item.label === 'File')
      ?.submenu?.items.some((item) => item.label === 'Record Window…') ?? false,
  )).toBe(true)
  await expect.poll(async () => (await stat(output)).size).toBeGreaterThan(0)
  await execFileAsync(process.env['FFMPEG'] ?? 'ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-sseof',
    '-0.1',
    '-i',
    output,
    '-frames:v',
    '1',
    screenshot,
  ])
  expect((await stat(screenshot)).size).toBeGreaterThan(0)
  const { stdout } = await execFileAsync(
    process.env['FFPROBE'] ?? 'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      output,
    ],
  )
  expect(Number(stdout.trim())).toBeGreaterThanOrEqual(MIN_EVIDENCE_SECONDS)
}

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
  if (tmuxSocketDirectory) {
    rmSync(tmuxSocketDirectory, { recursive: true, force: true })
  }
  if (model) await model.stop()
})

test('launches from a relocated copy and the sidecar reaches ready', async () => {
  // Relocation is asserted during launch. A named control call proves the
  // packaged sidecar's inherited process channel works, not just its proxy.
  const page = await mainWindow()
  await expect.poll(async () =>
    (await page.evaluate(() => window.maximal.getCoreStatus())).phase,
  ).toBe('ready')
  const status = await page.evaluate(() => window.maximal.control.authStatus())
  expect(status.ok).toBe(true)
  if (status.ok) {
    expect([
      'unauthenticated', 'device_code_issued', 'polling', 'authenticated', 'error',
    ]).toContain(status.value.state)
  }
})

test('window opens with exactly one non-empty primary heading', async () => {
  const window = await mainWindow()
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
  expect(viewport.width, 'the Overview canvas needs the wide three-panel window').toBeGreaterThanOrEqual(1279)
  expect(frameBox!.height).toBeGreaterThanOrEqual(viewport.height - 1)
  expect(frameBox!.width).toBeGreaterThanOrEqual(viewport.width - 1)
})

test('packaged preload exposes only the closed named bridge', async () => {
  const page = await mainWindow()
  const exposed = await page.evaluate(() => ({
    topLevel: Object.keys(window.maximal).sort(),
    control: Object.keys(window.maximal.control).sort(),
    harness: Object.keys(window.maximal.harness).sort(),
    hasCoreOrigin: 'getCoreOrigin' in window.maximal,
    hasWindowRequire: 'require' in window,
  }))

  expect(exposed).toEqual({
    topLevel: [
      'appearance',
      'clientInstallations',
      'control',
      'getCoreStatus',
      'getProxyUrl',
      'harness',
      'licenses',
      'localModels',
      'logs',
      'menuBarMode',
      'ollamaRuntime',
      'onCoreStatus',
      'onOpenLicenses',
      'onOpenSettings',
      'openExternal',
      'pendingSettingsRequest',
      'providerOnboarding',
      'shutdown',
      'terminal',
    ],
    control: [
      'accountsList',
      'accountsReorder',
      'accountsSetEnabled',
      'accountsSwitch',
      'apiKeysCreate',
      'apiKeysList',
      'apiKeysRemove',
      'apiKeysSetEnforcement',
      'apiKeysUpdate',
      'appsList',
      'appsSetEnabled',
      'authCancel',
      'authSignOut',
      'authStart',
      'authStatus',
      'connectionsAct',
      'connectionsList',
      'connectionsRevealCredential',
      'diagnosticsGet',
      'modelsList',
      'modelsRefresh',
      'observabilityOverview',
      'observabilityRequest',
      'observabilityRequests',
      'ollamaAccountsList',
      'ollamaApiKeyTest',
      'ollamaSettingsGet',
      'ollamaSettingsUpdate',
      'onChange',
      'onTrafficInvalidation',
      'searchProviderValidate',
      'searchSettingsGet',
      'searchSettingsUpdate',
      'usageGet',
    ],
    harness: [
      'abort',
      'approve',
      'ask',
      'ensureModel',
      'hide',
      'onApproval',
      'onDelta',
      'onEnd',
      'onModelProgress',
      'onTool',
      'provider',
      'selectEffort',
      'selectModel',
      'show',
    ],
    hasCoreOrigin: false,
    hasWindowRequire: false,
  })
})

test('packaged harness opens focused, resolves its theme, and streams an answer', async ({ page: _page }, testInfo) => {
  await expect.poll(() =>
    running.app.windows().some((page) => page.url().includes('overlay')),
  ).toBe(true)
  const overlay = running.app.windows().find((page) => page.url().includes('overlay'))
  if (!overlay) throw new Error('The startup summon did not create the overlay window.')

  const card = overlay.locator('[data-testid="overlay-card"]')
  const input = overlay.locator('[data-testid="overlay-input"]')
  await expect(card).toBeVisible()
  await expect(input).toBeFocused()
  await expect(overlay.locator('[data-testid="overlay-status"]')).toHaveText(
    'maximal · Claude Haiku',
  )
  await overlay.locator('[data-testid="overlay-model-picker"]').click()
  await expect(overlay.locator('[data-testid="overlay-model-menu"]'))
    .toContainText('Extended reasoning · 200K context')
  await overlay.getByRole('button', { name: 'low', exact: true }).click()

  const style = await card.evaluate((element) => {
    const computed = getComputedStyle(element)
    return {
      background: computed.backgroundColor,
      paddingTop: computed.paddingTop,
      raised: computed.getPropertyValue('--shell-raised').trim(),
    }
  })
  expect(style.raised).not.toBe('')
  expect(style.background).not.toBe('rgba(0, 0, 0, 0)')
  expect(style.paddingTop).not.toBe('0px')

  const cardBox = await card.boundingBox()
  const overlayViewport = await overlay.evaluate(() => ({
    height: document.documentElement.clientHeight,
    width: document.documentElement.clientWidth,
  }))
  expect(overlayViewport).toEqual({ height: 480, width: 640 })
  expect(cardBox).not.toBeNull()
  expect(cardBox!.height).toBeLessThan(overlayViewport.height / 2)
  expect(cardBox!.x).toBeCloseTo(12, 0)
  expect(cardBox!.y).toBeCloseTo(12, 0)
  expect(cardBox!.width).toBeCloseTo(overlayViewport.width - 24, 0)
  const inputBox = await input.boundingBox()
  const footerBox = await overlay.locator('.mh-card__footer').boundingBox()
  expect(inputBox).not.toBeNull()
  expect(footerBox).not.toBeNull()
  expect(footerBox!.y - (inputBox!.y + inputBox!.height)).toBeGreaterThanOrEqual(0)
  expect(footerBox!.y - (inputBox!.y + inputBox!.height)).toBeLessThanOrEqual(9)
  await overlay.screenshot({ path: testInfo.outputPath('assistant-overlay.png') })

  expect(await overlay.locator('.mh-drag-handle').evaluate((element) =>
    getComputedStyle(element).getPropertyValue('-webkit-app-region'),
  )).toBe('drag')
  expect(await running.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((window) => window.webContents.getURL().includes('overlay'))
      ?.isMovable(),
  )).toBe(true)

  await overlay.evaluate(() => {
    const state = window as typeof window & {
      harnessStreamObserver?: MutationObserver
      harnessStreamStates?: string[]
    }
    state.harnessStreamStates = []
    state.harnessStreamObserver = new MutationObserver(() => {
      const text = document.querySelector('[data-testid="overlay-answer"]')?.textContent ?? ''
      if (text && state.harnessStreamStates?.at(-1) !== text) {
        state.harnessStreamStates?.push(text)
      }
    })
    state.harnessStreamObserver.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    })
  })

  const prompt = 'Reply with the packaged harness marker.'
  await input.fill(prompt)
  await input.press('Enter')
  await expect(overlay.locator('[data-testid="overlay-answer"]')).toHaveText(
    SCRIPTED_ANSWER,
  )
  const streamed = await overlay.evaluate(() => {
    const state = window as typeof window & {
      harnessStreamObserver?: MutationObserver
      harnessStreamStates?: string[]
    }
    state.harnessStreamObserver?.disconnect()
    return state.harnessStreamStates ?? []
  })
  expect(new Set(streamed).size).toBeGreaterThan(1)
  expect((await card.boundingBox())!.height).toBeLessThanOrEqual(overlayViewport.height * 0.8 + 1)
  expect(model.requests).toContainEqual({
    path: '/v1/messages',
    prompt,
    model: SCRIPTED_MODEL,
    stream: true,
    effort: 'low',
  })

  await overlay.keyboard.press('Escape')
})

test('desktop terminal selector presents the app-owned clients with canonical icons', async ({ page: _page }, testInfo) => {
  const page = await mainWindow()
  await page.getByTestId('tab-new').click()
  const launcher = page.getByTestId('terminal-launcher')
  await expect(launcher).toBeVisible()

  for (const id of ['claude-desktop', 'claude-code', 'copilot-cli', 'codex', 'maximal']) {
    await expect(launcher.getByTestId(`terminal-profile-icon-${id}`)).toBeVisible()
  }

  const profileNames = await page.evaluate(() =>
    window.maximal.terminal.profiles().then((profiles) =>
      profiles.slice(0, 5).map(({ id, label }) => [id, label])),
  )
  expect(profileNames).toEqual([
    ['claude-desktop', 'Claude Desktop'],
    ['claude-code', 'Claude Code'],
    ['copilot-cli', 'Copilot CLI'],
    ['codex', 'Codex'],
    ['maximal', 'Maximal'],
  ])

  const claudeCode = launcher.getByRole('button', { name: /Claude Code/ })
  const claudeDesktop = launcher.getByRole('button', { name: /Claude Desktop/ })
  const local = launcher.locator('[aria-label="Available"]').getByRole('button', { name: /Local/ })
  const choiceBox = await claudeCode.boundingBox()
  const adjacentChoiceBox = await claudeDesktop.boundingBox()
  const launcherBox = await launcher.boundingBox()
  const nameBox = await claudeCode.locator('.terminal-launcher__choice-name').boundingBox()
  const descriptionBox = await claudeCode.locator('.terminal-launcher__choice-description').boundingBox()
  expect(choiceBox).not.toBeNull()
  expect(adjacentChoiceBox).not.toBeNull()
  expect(launcherBox).not.toBeNull()
  expect(nameBox).not.toBeNull()
  expect(descriptionBox).not.toBeNull()
  await expect(local).toContainText('Open a terminal on your local file system')
  expect(choiceBox!.y).toBe(adjacentChoiceBox!.y)
  expect(choiceBox!.width).toBeLessThan(launcherBox!.width / 2)
  expect(descriptionBox!.y).toBeGreaterThanOrEqual(nameBox!.y + nameBox!.height)
  expect(descriptionBox!.y + descriptionBox!.height).toBeLessThanOrEqual(
    choiceBox!.y + choiceBox!.height,
  )

  await local.click()
  await expect(launcher).toBeHidden()
  await page.getByTestId('tab-new').click()
  await expect(launcher).toBeVisible()
  const runningLocal = launcher.locator(
    '[aria-label="Running"] .terminal-launcher__choice',
  ).first()
  await expect(runningLocal).toContainText('Local')
  await expect(runningLocal).not.toContainText(
    'Open a terminal on your local file system',
  )
  await expect(
    runningLocal.locator('.terminal-launcher__choice-description'),
  ).toHaveCount(0)
  const runningChoiceBox = await runningLocal.boundingBox()
  const runningNameBox = await runningLocal
    .locator('.terminal-launcher__choice-name')
    .boundingBox()
  const runningKindBox = await runningLocal
    .locator('.terminal-launcher__kind')
    .boundingBox()
  expect(runningChoiceBox).not.toBeNull()
  expect(runningNameBox).not.toBeNull()
  expect(runningKindBox).not.toBeNull()
  expect(runningNameBox!.x + runningNameBox!.width).toBeLessThanOrEqual(
    runningKindBox!.x,
  )
  expect(runningKindBox!.x + runningKindBox!.width).toBeLessThanOrEqual(
    runningChoiceBox!.x + runningChoiceBox!.width,
  )

  await page.screenshot({ path: testInfo.outputPath('terminal-selector.png') })
  await page.keyboard.press('Escape')
  await expect(launcher).toBeHidden()
})

test('packaged terminal bridge launches and terminates a native shell', async () => {
  const page = await mainWindow()
  const result = await page.evaluate(async () => {
    const profiles = await window.maximal.terminal.profiles()
    const launched = await window.maximal.terminal.launch({
      profileId: 'local',
      cols: 80,
      rows: 24,
    })
    let output = ''
    const complete = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('terminal produced no output')), 10_000)
      const unsubscribe = window.maximal.terminal.onData((message) => {
        if (message.id !== launched.sessionId) return
        output += message.data
        if (!output.includes('MAXIMAL_TERMINAL_READY')) return
        clearTimeout(timeout)
        unsubscribe()
        resolve()
      })
    })
    await window.maximal.terminal.spawn({ id: launched.sessionId, cols: 80, rows: 24 })
    await window.maximal.terminal.write(launched.sessionId, "printf 'MAXIMAL_TERMINAL_READY\\n'\r")
    await complete
    await window.maximal.terminal.terminate(launched.sessionId)
    return { hasLocal: profiles.some((profile) => profile.id === 'local'), output }
  })

  expect(result.hasLocal).toBe(true)
  expect(result.output).toContain('MAXIMAL_TERMINAL_READY')
})

test('macOS terminal picker shares an external tmux parrot session', async ({ page: _page }, testInfo) => {
  test.skip(process.platform !== 'darwin', 'The external tmux PTY journey requires macOS.')
  if (!tmuxSocketDirectory) throw new Error('The isolated tmux socket directory was not created.')

  const tmuxEnvironment: Record<string, string> = {
    ...Object.fromEntries(Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    )),
    TMUX_TMPDIR: tmuxSocketDirectory,
    TERM: 'xterm-256color',
  }
  const sessionName = `maximal-${randomBytes(16).toString('hex')}`
  const sessionTarget = `=${sessionName}:0.0`
  const runTmux = (args: string[]): string => execFileSync('tmux', args, {
    encoding: 'utf8',
    env: tmuxEnvironment,
    timeout: 10_000,
  }).trim()
  const killTestSession = (): void => {
    const result = spawnSync('tmux', ['has-session', '-t', `=${sessionName}`], {
      encoding: 'utf8',
      env: tmuxEnvironment,
    })
    if (result.error) throw result.error
    if (result.status === 0) {
      runTmux(['kill-session', '-t', `=${sessionName}`])
    } else if (result.status !== 1) {
      throw new Error(`Could not determine whether the test tmux session still exists: ${result.stderr}`)
    }
  }
  const capturePane = (): string =>
    runTmux(['capture-pane', '-p', '-t', sessionTarget])
  let externalClient: ReturnType<typeof spawnPty> | undefined
  let externalClientExited: Promise<void> | undefined
  let externalExitCode: number | undefined
  let externalOutput = ''
  let terminalId: string | undefined
  const page = await mainWindow()

  try {
    runTmux([
      '-f',
      '/dev/null',
      'new-session',
      '-d',
      '-s',
      sessionName,
      'printf "MAXIMAL_EXTERNAL_READY\\n"; exec /bin/zsh -f',
    ])
    const client = spawnPty(
      'tmux',
      ['attach-session', '-t', `=${sessionName}`],
      { name: 'xterm-256color', cols: 80, rows: 24, cwd: process.cwd(), env: tmuxEnvironment },
    )
    externalClient = client
    client.onData((chunk) => {
      externalOutput = `${externalOutput}${chunk.toString()}`.slice(-500_000)
    })
    externalClientExited = new Promise<void>((resolve) => {
      client.onExit(({ exitCode }) => {
        externalExitCode = exitCode
        resolve()
      })
    })

    await expect.poll(() => externalOutput).toContain('MAXIMAL_EXTERNAL_READY')
    externalClient.write('curl parrot.live\r')
    await expect.poll(() =>
      runTmux(['display-message', '-p', '-t', sessionTarget, '#{pane_current_command}']),
    ).toBe('curl')
    await expect.poll(() => externalOutput).toContain('.cccc')

    await page.evaluate(() => {
      const state = window as typeof window & {
        __tmuxOutputById?: Record<string, string>
        __tmuxOutputUnsubscribe?: () => void
      }
      state.__tmuxOutputById = {}
      state.__tmuxOutputUnsubscribe = window.maximal.terminal.onData(({ id, data }) => {
        const previous = state.__tmuxOutputById?.[id] ?? ''
        if (state.__tmuxOutputById) {
          state.__tmuxOutputById[id] = `${previous}${data}`.slice(-500_000)
        }
      })
    })

    const beforeIds = await page.evaluate(() =>
      window.maximal.terminal.list().then((sessions) => sessions.map(({ id }) => id)),
    )
    await page.getByTestId('tab-new').click()
    const launcher = page.getByTestId('terminal-launcher')
    await expect(launcher).toBeVisible()
    const runningSession = launcher.locator('[aria-label="Running"]')
      .getByRole('button', { name: /Terminal \d+/ })
    await expect(runningSession).toBeVisible()
    await runningSession.click()

    const terminals = page.locator('[data-testid="terminal"]:visible')
    await expect(terminals).toHaveCount(1, { timeout: 20_000 })
    await expect.poll(async () =>
      page.evaluate((knownIds) =>
        window.maximal.terminal.list().then((sessions) =>
          sessions.filter(({ id }) => !knownIds.includes(id)).map(({ id }) => id)),
      beforeIds),
    ).toHaveLength(1)
    const sessionIds = await page.evaluate((knownIds) =>
      window.maximal.terminal.list().then((sessions) =>
        sessions.filter(({ id }) => !knownIds.includes(id)).map(({ id }) => id)),
    beforeIds)
    terminalId = sessionIds[0]
    if (!terminalId) throw new Error('Maximal did not register the attached tmux session.')
    const attachedTerminalId = terminalId

    await expect.poll(() =>
      page.evaluate((id) =>
        (window as typeof window & { __tmuxOutputById?: Record<string, string> })
          .__tmuxOutputById?.[id] ?? '',
      attachedTerminalId),
    ).toContain('.cccc')
    expect(externalOutput).toContain('.cccc')
    await page.screenshot({ path: testInfo.outputPath('tmux-parrot-shared.png') })

    await terminals.first().click()
    await expect.poll(() =>
      runTmux(['display-message', '-p', '-t', sessionTarget, '#{pane_current_command}']),
    ).toBe('curl')
    await page.keyboard.press('Control+c')
    await expect.poll(() =>
      runTmux(['display-message', '-p', '-t', sessionTarget, '#{pane_current_command}']),
    ).toBe('zsh')

    externalClient.write("printf 'TMUX_EXTERNAL_INPUT_OK\\n'\r")
    await expect.poll(capturePane).toContain('TMUX_EXTERNAL_INPUT_OK')

    await terminals.first().click()
    await page.keyboard.insertText("printf 'MAXIMAL_INPUT_OK\\n'")
    await page.keyboard.press('Enter')
    await expect.poll(capturePane).toContain('MAXIMAL_INPUT_OK')
  } finally {
    try {
      await page.evaluate(() => {
        const state = window as typeof window & { __tmuxOutputUnsubscribe?: () => void }
        state.__tmuxOutputUnsubscribe?.()
        delete state.__tmuxOutputUnsubscribe
      })
      if (terminalId) await page.evaluate((id) => window.maximal.terminal.terminate(id), terminalId)
    } finally {
      try {
        if (externalClient && externalClientExited && externalExitCode === undefined) {
          externalClient.kill()
          await externalClientExited
        }
      } finally {
        killTestSession()
      }
    }
  }
})

test('terminal splits preserve geometry, focus navigation, and theme tokens', async () => {
  const page = await mainWindow()
  await page.keyboard.press('Escape')
  await page.getByTestId('tab-new').click()
  const launcher = page.getByTestId('terminal-launcher')
  await expect(launcher).toBeVisible()
  await launcher.locator('[aria-label="Available"]').getByRole('button', { name: /Local/ }).click()

  const terminals = page.locator('[data-testid="terminal"]:visible')
  await expect(terminals).toHaveCount(1, { timeout: 20_000 })
  await expect(terminals.first()).toHaveAttribute('aria-label', 'Terminal')

  const colours = await terminals.first().evaluate((node) => {
    const probe = document.createElement('span')
    probe.style.background = 'var(--shell-terminal-background)'
    node.appendChild(probe)
    const expected = getComputedStyle(probe).backgroundColor
    probe.remove()
    return {
      actual: getComputedStyle(node).backgroundColor,
      expected,
    }
  })
  expect(colours.expected).not.toBe('')
  expect(colours.actual).toBe(colours.expected)

  await terminals.first().click()
  await page.keyboard.press('Meta+d')
  await expect(terminals).toHaveCount(2, { timeout: 20_000 })

  const left = await terminals.nth(0).boundingBox()
  const right = await terminals.nth(1).boundingBox()
  expect(left).not.toBeNull()
  expect(right).not.toBeNull()
  expect(right!.x).toBeGreaterThan(left!.x)
  expect(Math.abs(right!.y - left!.y)).toBeLessThan(10)

  await terminals.nth(1).click()
  await page.keyboard.press('Meta+Shift+d')
  await expect(terminals).toHaveCount(3, { timeout: 20_000 })

  const upperRight = await terminals.nth(1).boundingBox()
  const lowerRight = await terminals.nth(2).boundingBox()
  expect(upperRight).not.toBeNull()
  expect(lowerRight).not.toBeNull()
  expect(lowerRight!.y).toBeGreaterThan(upperRight!.y)
  expect(Math.abs(lowerRight!.x - upperRight!.x)).toBeLessThan(10)

  await page.keyboard.press('Meta+[')
  await expect.poll(() => terminals.evaluateAll((nodes) =>
    nodes.findIndex((node) => node.contains(document.activeElement)))).toBe(1)
  await page.keyboard.press('Meta+]')
  await expect.poll(() => terminals.evaluateAll((nodes) =>
    nodes.findIndex((node) => node.contains(document.activeElement)))).toBe(2)

  await page.evaluate(async () => {
    const sessions = await window.maximal.terminal.list()
    await Promise.all(sessions.map(({ id }) => window.maximal.terminal.terminate(id)))
  })
})

test('native Settings flyout opens every restored section in the packaged UI', async () => {
  const page = await mainWindow()
  const nativeLabels = await openNativeSettings('Usage')
  expect(nativeLabels).toEqual(SETTINGS_SECTIONS.map(({ label }) => label))
  await expect(page.locator('h1')).toHaveText('Usage')
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('.settings')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Settings sections' })).toBeVisible()

  const selected = page.locator('[data-testid="settings-rail-settings-usage-heading"]')
  await expect(selected).toHaveAttribute('aria-current', 'page')
  const tabpanel = page.locator('.tabpanel')
  await expect(tabpanel).toHaveCount(1)
  expect(await selected.getAttribute('aria-controls')).toBe(await tabpanel.getAttribute('id'))

  await expect(page.locator('#right')).toHaveCount(0)
  await expect(page.locator('[data-testid="toggle-right"]')).toHaveCount(0)
})

test('General settings expose packaged Electron desktop behavior', async ({ browserName: _browserName }, testInfo) => {
  const page = await mainWindow()
  const evidenceDirectory = process.env['MAXIMAL_EVIDENCE_DIR']
  if (evidenceDirectory) await mkdir(evidenceDirectory, { recursive: true })
  const evidencePath = (name: string): string =>
    evidenceDirectory ? join(evidenceDirectory, name) : testInfo.outputPath(name)
  await openNativeSettings('General')
  const hasRevealRecordings = await running.app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()?.items
      .find((item) => item.label === 'File')
      ?.submenu?.items.some((item) =>
        item.label === 'Reveal Recordings Folder' && item.enabled,
      ) ?? false,
  )
  expect(hasRevealRecordings).toBe(true)

  await expect(page.locator('h1')).toHaveText('General')
  await expect(page.getByRole('heading', { name: 'Desktop app', level: 2 })).toBeVisible()
  await expect(page.getByText('Run on startup', { exact: true })).toBeVisible()
  await expect(page.getByText('Ctrl Ctrl', { exact: true })).toBeVisible()
  await expect(page.getByText('Menu bar', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Notifications', level: 2 })).toBeVisible()

  const native = await running.app.evaluate(({ app }) => ({
    version: app.getVersion(),
    startOnLogin: app.getLoginItemSettings().openAtLogin,
  }))
  const bridged = await page.evaluate(() => window.maximal.generalSettings.get())
  expect(bridged).toEqual({
    ...native,
    quickAccessShortcut: 'control-control',
  })
  await expect(page.getByText(native.version, { exact: true })).toBeVisible()
  await expect(page.getByTestId('start-on-login-switch')).toHaveAttribute(
    'aria-checked',
    String(native.startOnLogin),
  )

  const unchanged = await page.evaluate((enabled) =>
    window.maximal.generalSettings.setStartOnLogin(enabled), native.startOnLogin)
  expect(unchanged).toEqual(bridged)

  const overviewRecording = evidencePath('general-settings.mp4')
  const overviewScreenshot = evidencePath('general-settings.png')
  await startWindowRecording(overviewRecording)
  await expect(page.getByText('System notifications', { exact: true })).toBeVisible()
  await page.waitForTimeout(EVIDENCE_HOLD_MS)
  await stopWindowRecording(overviewRecording, overviewScreenshot)

  const confirmationRecording = evidencePath('general-menu-bar-confirmation.mp4')
  const confirmationScreenshot = evidencePath('general-menu-bar-confirmation.png')
  await startWindowRecording(confirmationRecording)
  await page.getByTestId('menu-bar-only-switch').click()
  await expect(
    page.getByRole('heading', { name: 'Keep menu bar only?' }).first(),
  ).toBeVisible()
  await page.waitForTimeout(EVIDENCE_HOLD_MS)
  await stopWindowRecording(confirmationRecording, confirmationScreenshot)
  await page.getByRole('button', { name: 'Revert' }).click()
  await expect(page.getByText('Keep menu bar only?')).toHaveCount(0)
  await testInfo.attach('General settings', {
    path: overviewScreenshot,
    contentType: 'image/png',
  })
  await testInfo.attach('Menu bar confirmation', {
    path: confirmationScreenshot,
    contentType: 'image/png',
  })
})

test('Appearance effects persist, honor reduced motion, and release Pixi when disabled', async ({ page: _page }, testInfo) => {
  const page = await mainWindow()
  const recordingPath = process.env.MAXIMAL_E2E_CAPTURE_COZY_VIDEO === '1'
    ? testInfo.outputPath('cozy-background-demo.mp4')
    : null
  const recordingHoldMs = Number.parseInt(
    process.env.MAXIMAL_E2E_COZY_VIDEO_HOLD_MS ?? '5000',
    10,
  )
  if (!Number.isInteger(recordingHoldMs) || recordingHoldMs < 0) {
    throw new Error('MAXIMAL_E2E_COZY_VIDEO_HOLD_MS must be a non-negative integer.')
  }
  testInfo.setTimeout(Math.max(testInfo.timeout, recordingHoldMs + 30_000))
  await page.evaluate(async () => {
    await window.maximal.appearance.setVibrancyEnabled(false)
    await window.maximal.appearance.setBackgroundEffectsEnabled(false)
    await window.maximal.appearance.setReducedMotionEnabled(false)
  })

  await openNativeSettings('General')
  await expect(page.locator('h1')).toHaveText('General')
  await expect(page.getByRole('heading', { name: 'Window materials' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Visual effects' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Desktop app' })).toBeVisible()

  const vibrancy = page.getByTestId('vibrancy-switch')
  const background = page.getByTestId('background-effects-switch')
  const reducedMotion = page.getByTestId('reduced-motion-switch')
  await expect(background).toHaveAttribute('aria-checked', 'false')
  await expect(reducedMotion).toHaveAttribute('aria-checked', 'false')
  const disabledFrame = await page.screenshot({
    path: testInfo.outputPath('appearance-effects-disabled.png'),
  })
  if (recordingPath) {
    await toggleNativeRecording(recordingPath)
    await expect.poll(() => running.app.evaluate(({ Menu }) =>
      Menu.getApplicationMenu()?.items
        .find((item) => item.label === 'File')
        ?.submenu?.items.some((item) => item.label === 'Stop Window Recording') ?? false,
    )).toBe(true)
    await page.waitForTimeout(1_000)
  }

  const vibrancySupported = await page.evaluate(
    () => window.maximal.appearance.get().then(({ vibrancySupported }) => vibrancySupported),
  )
  if (vibrancySupported) {
    await expect(vibrancy).toBeEnabled()
  } else {
    await expect(vibrancy).toBeDisabled()
  }

  await background.click()
  await expect(background).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('html')).toHaveAttribute('data-background-effects', 'true')
  const canvas = page.locator('.cozy-background canvas')
  await expect(canvas).toHaveCount(1)
  await page.waitForTimeout(250)
  const animatedFrameA = await canvas.screenshot({
    path: testInfo.outputPath('cozy-background-animated-a.png'),
  })
  await page.waitForTimeout(250)
  const animatedFrameB = await canvas.screenshot({
    path: testInfo.outputPath('cozy-background-animated-b.png'),
  })
  expect(animatedFrameB.equals(animatedFrameA)).toBe(false)
  const materialMetrics = await running.app.evaluate(({ nativeImage }, frames) => {
    const decode = (encoded: string): Buffer =>
      nativeImage
        .createFromBuffer(Buffer.from(encoded, 'base64'))
        .resize({ width: 64, height: 64, quality: 'best' })
        .toBitmap()
    const disabled = decode(frames.disabled)
    const enabled = decode(frames.enabled)
    let changed = 0
    let difference = 0
    const pixelCount = Math.min(disabled.length, enabled.length) / 4
    for (let index = 0; index < pixelCount * 4; index += 4) {
      const red = Math.abs((disabled[index] ?? 0) - (enabled[index] ?? 0))
      const green = Math.abs((disabled[index + 1] ?? 0) - (enabled[index + 1] ?? 0))
      const blue = Math.abs((disabled[index + 2] ?? 0) - (enabled[index + 2] ?? 0))
      const pixelDifference = (red + green + blue) / 3
      difference += pixelDifference
      if (pixelDifference >= 6) changed += 1
    }
    return {
      changedPixelRatio: changed / pixelCount,
      meanPixelDifference: difference / pixelCount,
    }
  }, {
    disabled: disabledFrame.toString('base64'),
    enabled: animatedFrameA.toString('base64'),
  })
  expect(materialMetrics.changedPixelRatio).toBeGreaterThan(0.2)
  expect(materialMetrics.meanPixelDifference).toBeGreaterThan(4)
  if (recordingPath) await page.waitForTimeout(recordingHoldMs)

  await reducedMotion.click()
  await expect(reducedMotion).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true')
  await page.waitForTimeout(100)
  const reducedFrameA = await canvas.screenshot({
    path: testInfo.outputPath('cozy-background-reduced-motion.png'),
  })
  await page.waitForTimeout(250)
  const reducedFrameB = await canvas.screenshot()
  expect(reducedFrameB.equals(reducedFrameA)).toBe(true)
  if (recordingPath) await page.waitForTimeout(2_000)

  await page.reload()
  await openNativeSettings('General')
  await expect(page.getByTestId('background-effects-switch'))
    .toHaveAttribute('aria-checked', 'true')
  await expect(page.getByTestId('reduced-motion-switch'))
    .toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('.cozy-background canvas')).toHaveCount(1)

  await page.getByTestId('background-effects-switch').click()
  await expect(page.locator('.cozy-background')).toHaveCount(0)
  await expect(page.locator('html')).not.toHaveAttribute('data-background-effects', /.+/)
  await page.getByTestId('reduced-motion-switch').click()
  await expect(page.locator('html')).not.toHaveAttribute('data-reduced-motion', /.+/)
  if (recordingPath) {
    await page.waitForTimeout(1_000)
    await toggleNativeRecording()
    await expect.poll(async () => (await stat(recordingPath)).size).toBeGreaterThan(0)
  }
})

test('model settings preserve hierarchy and semantics at narrow widths', async ({ browserName: _browserName }, testInfo) => {
  const page = await mainWindow()
  const originalSize = await running.app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find(
      (candidate) => candidate.webContents.getURL().includes('/main_window/index.html'),
    )
    if (!window) throw new Error('The packaged main window did not open.')
    const [width, height] = window.getContentSize()
    return { width, height }
  })
  const resize = async (width: number): Promise<void> => {
    await running.app.evaluate(({ BrowserWindow }, size) => {
      const window = BrowserWindow.getAllWindows().find(
        (candidate) => candidate.webContents.getURL().includes('/main_window/index.html'),
      )
      window?.setContentSize(size.width, size.height)
    }, { width, height: originalSize.height })
    await page.waitForFunction((expected) => window.innerWidth === expected, width)
  }

  await running.app.evaluate(({ ipcMain }) => {
    const catalogue = {
      models: [
        {
          id: 'claude-opus-5',
          name: 'Claude Opus 5',
          vendor: 'Anthropic',
          family: 'claude',
          type: 'chat',
          preview: false,
          context_window_tokens: 1_000_000,
          max_output_tokens: 128_000,
          capabilities: {
            vision: true,
            tool_calls: true,
            streaming: true,
            reasoning: true,
          },
        },
        {
          id: 'embed-one',
          name: 'Embed One',
          vendor: 'Example',
          family: 'embed',
          type: 'embeddings',
          preview: false,
          context_window_tokens: 8_192,
          max_output_tokens: null,
          capabilities: {
            vision: false,
            tool_calls: false,
            streaming: true,
            reasoning: false,
          },
        },
      ],
      count: 2,
      loaded_at: null,
    }
    const localCatalogue = {
      revision: 1,
      models: [
        {
          key: 'qwen3-0.6b-q8-gguf',
          modelId: 'qwen3-0.6b',
          displayName: 'Qwen3 0.6B Q8',
          format: 'gguf',
          expectedBytes: 639_446_688,
          publication: 'provider',
          state: 'registered',
          capabilities: { input: ['text'], output: ['text'] },
          context: { contextWindow: 32_768, maxOutputTokens: 8_192 },
        },
      ],
    }
    for (const channel of [
      'maximal:control/models-list',
      'maximal:control/models-refresh',
    ]) {
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, () => ({ ok: true, value: catalogue }))
    }
    ipcMain.removeHandler('maximal:control/local-models-list')
    ipcMain.handle('maximal:control/local-models-list', () => ({
      ok: true,
      value: localCatalogue,
    }))
  })

  try {
    await resize(1280)
    await openNativeSettings('Cloud Models')
    await expect(page.locator('h1')).toHaveText('Cloud Models')

    const chatGroup = page.locator('section.settings__section').filter({
      has: page.getByRole('heading', { name: 'Chat models (1)' }),
    })
    const card = chatGroup.locator('[data-testid="model-claude-opus-5"]')
    await expect(card.getByRole('heading', { name: 'Claude Opus 5' })).toBeVisible()
    await expect(card.getByText('1.0M')).toBeVisible()
    await expect(page.locator('[data-testid="model-embed-one"]')).toBeVisible()

    const headingBox = await chatGroup.getByRole('heading', { name: 'Chat models (1)' }).boundingBox()
    const cardBox = await card.boundingBox()
    expect(headingBox).not.toBeNull()
    expect(cardBox).not.toBeNull()
    expect(cardBox!.y).toBeGreaterThanOrEqual(headingBox!.y + headingBox!.height)
    await page.screenshot({ path: testInfo.outputPath('models-settings.png') })

    await resize(700)
    await page.getByRole('button', { name: 'List view' }).first().click()
    const overflow = await page.evaluate(() => ({
      bodyClient: document.body.clientWidth,
      bodyScroll: document.body.scrollWidth,
      tableClient:
        document.querySelector<HTMLElement>('.model-table-wrap')
          ?.clientWidth ?? 0,
      tableScroll:
        document.querySelector<HTMLElement>('.model-table-wrap')
          ?.scrollWidth ?? 0,
    }))
    expect(overflow.bodyScroll).toBeLessThanOrEqual(overflow.bodyClient)
    expect(overflow.tableScroll).toBeGreaterThanOrEqual(overflow.tableClient)
    await page.screenshot({
      path: testInfo.outputPath('models-settings-narrow.png'),
    })

    await page
      .locator('[data-testid="settings-rail-settings-local-models-heading"]')
      .click()
    await expect(page.locator('h1')).toHaveText('Local models')
    await expect(page.getByText('Qwen3 0.6B Q8')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open models folder' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0)
    const localOverflow = await page.evaluate(() => ({
      client: document.body.clientWidth,
      scroll: document.body.scrollWidth,
    }))
    expect(localOverflow.scroll).toBeLessThanOrEqual(localOverflow.client)
    await page.screenshot({
      path: testInfo.outputPath('local-models-settings-narrow.png'),
    })
  } finally {
    await resize(originalSize.width)
  }
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
  'empty profile — see src/main/sidecar/core.ts), which is also the state a real CI machine is in, so this ' +
  'is expected here and is not a failure.'

test('chrome text is not near-invisible against its background', async () => {
  // Every shell control colours itself from `var(--shell-*)`. With none of
  // those properties defined the declarations fall back to inherited or initial
  // values, which is near-black text on a near-black window at roughly 1.1:1 —
  // legible in the DOM, invisible on screen. First-run's controls read the same
  // chain, so either set of targets exercises it.
  const window = await mainWindow()
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
        // `.note` and `.btn--primary`, not `.first-run-note` and
        // `.first-run-button--primary`. First run composes the package's `Note`
        // and `Button` now, and those two classes are gone. Left as they were,
        // this branch would have kept passing on the heading alone and quietly
        // dropped from three contrast checks to one — the count is not
        // asserted, only that something was checked.
        { locator: window.locator('.sb-shell .note').first(), label: 'first-run note' },
        { locator: window.locator('.sb-shell .btn--primary').first(), label: 'first-run primary button' },
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
  // on every focusable shell control at once.
  //
  // The signed-out branch used to target first run's own hand-rolled button,
  // which merely copied that rule shape. It now targets the package's `.btn`,
  // because first run composes `Button` — so both branches exercise the real
  // `.btn:focus-visible`, which is what this test was always about.
  const window = await mainWindow()
  // The panel toggle, not the frame root: first-run mounts a `.sb-shell.app`
  // too, so only the toggle — which the three-panel shell alone renders —
  // identifies the signed-in chrome these branches select between.
  const packageChromeVisible = await probeVisible(
    window,
    '.sb-shell.app .icon-button[data-testid="toggle-left"]',
  )

  const target = packageChromeVisible
    ? window.locator('.sb-shell.app .icon-button[data-testid="toggle-left"]')
    : window.locator('.sb-shell .btn--primary').first()
  const label = packageChromeVisible ? 'titlebar icon button' : 'first-run primary button'

  await expect(target).toBeVisible()
  await assertFocusOutlineResolves(window, target, label)
})

test('Settings rail entries do not overlap vertically', async () => {
  const window = await mainWindow()
  await openNativeSettings('Accounts')

  const settingsLinks = window.locator('.settings-rail__link')
  await expect(settingsLinks.first()).toBeVisible()
  await assertNoVerticalOverlap(
    await settingsLinks.all(),
    'settings section rail entries',
  )
})


test('status bar text is not clipped at the window edge', async () => {
  // Status items wrap when they do not fit the window's width. If the bar's
  // height is fixed rather than a floor, the wrapped line escapes the box in
  // both directions: up over the document content, and down past the window's
  // bottom edge. First-run has nothing comparable, so this skips signed out.
  const window = await mainWindow()
  // The Traffic tab specifically: first-run's frame has a tab strip of its own, so
  // the presence of a tab does not mean the view tabs this test drives exist.
  if (!(await probeVisible(window, '.sb-shell.app .tab:has-text("Traffic")'))) {
    test.skip(true, SIGNED_OUT_SKIP_MESSAGE)
    return
  }

  await window.locator('.sb-shell.app .tab', { hasText: 'Traffic' }).click()

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
})

test('packaged llama worker loads native code and can crash without taking down the app', async () => {
  test.setTimeout(120_000)

  const result = await running.app.evaluate(
    ({ app, utilityProcess }, workerRelative) =>
      new Promise<{ code: number; device?: string; loadMs?: number; error?: string }>(
        (resolve) => {
          const worker = utilityProcess.fork(
            `${app.getAppPath()}/${workerRelative}`,
            [],
            { serviceName: 'llama-e2e', stdio: 'pipe' },
          )
          let device: string | undefined
          let loadMs: number | undefined
          const timer = setTimeout(() => {
            worker.kill()
            resolve({ code: 0, error: 'The llama worker did not answer in 90 seconds.' })
          }, 90_000)

          worker.on('message', (message: unknown) => {
            const event = message as {
              kind?: string
              id?: string
              device?: string
              ms?: number
              reason?: string
            }
            if (event.kind === 'hello') {
              worker.postMessage({ kind: 'probe', id: 'packaged-e2e' })
            } else if (event.kind === 'loaded' && event.id === 'packaged-e2e') {
              device = event.device
              loadMs = event.ms
              worker.postMessage({ kind: 'crash-on-purpose' })
            } else if (event.kind === 'failed' && event.id === 'packaged-e2e') {
              clearTimeout(timer)
              worker.kill()
              resolve({ code: 0, error: event.reason })
            }
          })
          worker.on('exit', (code) => {
            clearTimeout(timer)
            resolve({ code, device, loadMs })
          })
        },
      ),
    '.vite/build/llama-worker.js',
  )

  expect(result.error).toBeUndefined()
  expect(result.device).toMatch(/^(cpu|metal|cuda|vulkan)$/)
  expect(result.loadMs).toBeGreaterThanOrEqual(0)
  expect(result.code).not.toBe(0)
  await expect(running.app.firstWindow()).resolves.toBeDefined()
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

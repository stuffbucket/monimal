import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const packageDirectory = resolve(import.meta.dirname, '..')
const outputDirectory = join(tmpdir(), 'maximal-ui-check')

function check(condition, message) {
  if (!condition) throw new Error(message)
}

async function layout(page) {
  return page.evaluate(() => {
    const root = document.documentElement
    const settings = document.querySelector('.settings-page')
    const tabpanel = document.querySelector('[role="tabpanel"]')
    const providerRows = [...document.querySelectorAll('.partitioned-sortable__item')]
    const enabledFlags = providerRows.map((row) => row.getAttribute('data-enabled') === 'true')
    const firstDisabled = enabledFlags.indexOf(false)
    const disabledRow = providerRows.find((row) => row.getAttribute('data-enabled') === 'false')
    const enabledRow = providerRows.find((row) => row.getAttribute('data-enabled') === 'true')
    if (!(settings instanceof HTMLElement)) {
      throw new Error('The Settings page did not render.')
    }
    return {
      h1Count: document.querySelectorAll('h1').length,
      sectionHeadings: [...document.querySelectorAll('h2')].map(
        (heading) => heading.textContent,
      ),
      providerCount: providerRows.length,
      providerListCount: document.querySelectorAll('.partitioned-sortable__list').length,
      switchCount: document.querySelectorAll('.partitioned-sortable__toggle').length,
      providersGrouped:
        firstDisabled < 0
        || enabledFlags.every((enabled, index) => index < firstDisabled ? enabled : !enabled),
      disabledIsDistinct:
        disabledRow instanceof HTMLElement
        && enabledRow instanceof HTMLElement
        && getComputedStyle(disabledRow).borderColor
          !== getComputedStyle(enabledRow).borderColor,
      nestedCardCount: document.querySelectorAll('.card .card').length,
      viewportOverflowX: root.scrollWidth - root.clientWidth,
      settingsOverflowX: settings.scrollWidth - settings.clientWidth,
      settingsScrolls: settings.scrollHeight > settings.clientHeight,
      tabpanelTabIndex: tabpanel?.getAttribute('tabindex') ?? null,
      hasCoreBridge: 'maximal' in window,
    }
  })
}

const server = await createServer({
  configFile: resolve(packageDirectory, 'vite.renderer.config.ts'),
  clearScreen: false,
  server: { host: '127.0.0.1', port: 0, strictPort: false },
})

let browser
try {
  await mkdir(outputDirectory, { recursive: true })
  await server.listen()
  const address = server.httpServer?.address()
  check(address !== null && typeof address === 'object', 'Vite did not open a TCP listener.')

  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(`http://127.0.0.1:${address.port}/ui-preview.html`, {
    waitUntil: 'networkidle',
  })
  await page.getByRole('heading', { level: 1, name: 'Search' }).waitFor()

  const desktop = await layout(page)
  check(desktop.h1Count === 1, `Expected one primary heading; found ${desktop.h1Count}.`)
  check(
    desktop.sectionHeadings.join('|') === 'Provider order|Search behavior',
    `Unexpected section hierarchy: ${desktop.sectionHeadings.join(', ')}`,
  )
  check(desktop.providerCount === 3, `Expected three provider rows; found ${desktop.providerCount}.`)
  check(desktop.providerListCount === 1, `Expected one provider list; found ${desktop.providerListCount}.`)
  check(desktop.switchCount === 3, `Expected three provider switches; found ${desktop.switchCount}.`)
  check(desktop.providersGrouped, 'Disabled providers are not grouped below enabled providers.')
  check(desktop.disabledIsDistinct, 'Disabled providers are not visually distinct from enabled providers.')
  check(desktop.nestedCardCount === 0, 'The Settings page contains nested cards.')
  check(desktop.viewportOverflowX === 0, `Desktop viewport overflows by ${desktop.viewportOverflowX}px.`)
  check(desktop.settingsOverflowX === 0, `Desktop Settings content overflows by ${desktop.settingsOverflowX}px.`)
  check(desktop.tabpanelTabIndex === null, 'The non-interactive tabpanel is in the tab order.')
  check(!desktop.hasCoreBridge, 'The renderer-only preview unexpectedly has a Core bridge.')

  for (const [name, tooltip] of [
    ['Move Ollama hosted search down', 'Move down'],
    ['Move GitHub Copilot search up', 'Move up'],
    ['Configure Ollama hosted search', 'Configure'],
  ]) {
    const action = page.getByRole('button', { name })
    await action.hover()
    const visibleTooltip = page.locator('.tooltip').filter({ hasText: tooltip })
    await visibleTooltip.waitFor()
    await page.keyboard.press('Escape')
    await visibleTooltip.waitFor({ state: 'hidden' })
  }

  const desktopPath = join(outputDirectory, 'search-settings-desktop.png')
  await page.screenshot({ path: desktopPath })

  await page.setViewportSize({ width: 520, height: 720 })
  await page.locator('.settings-page').evaluate((element) => {
    element.scrollTop = 0
  })
  const compact = await layout(page)
  check(compact.viewportOverflowX === 0, `Compact viewport overflows by ${compact.viewportOverflowX}px.`)
  check(compact.settingsOverflowX === 0, `Compact Settings content overflows by ${compact.settingsOverflowX}px.`)
  check(compact.settingsScrolls, 'Compact Settings content does not exercise its scroll boundary.')
  check(compact.providersGrouped, 'Compact providers do not keep disabled rows at the bottom.')

  const compactPath = join(outputDirectory, 'search-settings-compact.png')
  await page.screenshot({ path: compactPath })

  const copilot = page.getByRole('button', { name: 'Configure GitHub Copilot search' })
  await copilot.click()
  const model = page.getByTestId('search-setting-copilot-model')
  await model.focus()
  check(await model.evaluate((element) => document.activeElement === element), 'Tab did not reach the Copilot model field.')
  check(await model.inputValue() === 'gpt-5-mini', 'The Copilot model does not default to gpt-5-mini.')
  check(await model.locator('option').count() === 3, 'The Copilot model dropdown did not render its provider options.')
  const focus = await model.evaluate((element) => {
    const style = getComputedStyle(element)
    return { borderColor: style.borderColor, boxShadow: style.boxShadow }
  })
  check(focus.boxShadow !== 'none', 'The focused Copilot model field has no visible ring.')
  const expanded = await layout(page)
  check(expanded.settingsOverflowX === 0, `Expanded provider content overflows by ${expanded.settingsOverflowX}px.`)

  const providerPath = join(outputDirectory, 'search-settings-compact-copilot.png')
  await page.screenshot({ path: providerPath })
  check(pageErrors.length === 0, `The preview raised browser errors: ${pageErrors.join('; ')}`)

  console.log('UI check: 2 viewports, 3 captures, 2 sections, 3 providers, 0 browser errors.')
  console.log(`Desktop: ${desktopPath}`)
  console.log(`Compact: ${compactPath}`)
  console.log(`Compact Copilot: ${providerPath}`)
} finally {
  await browser?.close()
  await server.close()
}

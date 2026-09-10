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
    const scrollArea = document.querySelector('.scroll-area')
    const providerRows = [...document.querySelectorAll('.partitioned-sortable__item')]
    const enabledFlags = providerRows.map((row) => row.getAttribute('data-enabled') === 'true')
    const firstDisabled = enabledFlags.indexOf(false)
    const disabledRow = providerRows.find((row) => row.getAttribute('data-enabled') === 'false')
    const enabledRow = providerRows.find((row) => row.getAttribute('data-enabled') === 'true')
    if (!(settings instanceof HTMLElement)) {
      throw new Error('The Settings page did not render.')
    }
    if (!(scrollArea instanceof HTMLElement)) {
      throw new Error('The Settings scroll area did not render.')
    }
    const scrollAreaStyle = getComputedStyle(scrollArea)
    const scrollThumbStyle = getComputedStyle(scrollArea, '::-webkit-scrollbar-thumb')
    const scrollTrackStyle = getComputedStyle(scrollArea, '::-webkit-scrollbar-track')
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
      scrollbarColorScheme: scrollAreaStyle.colorScheme,
      scrollbarColor: scrollAreaStyle.scrollbarColor,
      scrollbarThumbBackground: scrollThumbStyle.backgroundColor,
      scrollbarTrackBackground: scrollTrackStyle.backgroundColor,
      tabpanelTabIndex: tabpanel?.getAttribute('tabindex') ?? null,
      hasCoreBridge: 'maximal' in window,
    }
  })
}

async function providerFieldLayout(page, providerId, fullFieldId) {
  return page.evaluate(
    ({ providerId: id, fullFieldId: fullId }) => {
      const fullInput = document.querySelector(
        `[data-testid="search-setting-${id}-${fullId}"]`,
      )
      const timeout = document.querySelector(
        `[data-testid="search-setting-${id}-timeoutMs"]`,
      )
      const maxResults = document.querySelector(
        `[data-testid="search-setting-${id}-maxResults"]`,
      )
      const row = fullInput?.closest('.partitioned-sortable__item')
      const fields = row?.querySelector('.settings-connector-fields')
      const label = row?.querySelector('.partitioned-sortable__content')
      const fullField = fullInput?.closest('.settings-connector-field')
      const timeoutField = timeout?.closest('.settings-connector-field')
      const maxResultsField = maxResults?.closest('.settings-connector-field')
      if (
        !(fullInput instanceof HTMLInputElement)
        || !(timeout instanceof HTMLInputElement)
        || !(maxResults instanceof HTMLInputElement)
        || !(fields instanceof HTMLElement)
        || !(label instanceof HTMLElement)
        || !(fullField instanceof HTMLElement)
        || !(timeoutField instanceof HTMLElement)
        || !(maxResultsField instanceof HTMLElement)
      ) {
        throw new Error(`Provider ${id} fields did not render.`)
      }
      return {
        detailsLeft: fields.getBoundingClientRect().left,
        labelLeft: label.getBoundingClientRect().left,
        fullFieldTop: fullField.getBoundingClientRect().top,
        fullFieldWidth: fullField.getBoundingClientRect().width,
        fieldsWidth: fields.getBoundingClientRect().width,
        timeoutTop: timeoutField.getBoundingClientRect().top,
        maxResultsTop: maxResultsField.getBoundingClientRect().top,
        timeoutValue: timeout.value,
        timeoutMin: timeout.min,
        timeoutMax: timeout.max,
        fullFieldDisabled: fullInput.disabled,
      }
    },
    { providerId, fullFieldId },
  )
}

const server = await createServer({
  configFile: resolve(packageDirectory, 'vite.renderer.config.mts'),
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    hmr: false,
    port: 0,
    strictPort: false,
  },
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
    desktop.sectionHeadings.join('|') === 'Provider order|Domain filtering',
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
  check(desktop.scrollbarColorScheme === 'dark', 'The native scrollbar did not inherit the dark host scheme.')
  check(desktop.scrollbarColor === 'auto', 'The scroll area overrides the native scrollbar colour.')
  check(
    desktop.scrollbarThumbBackground === 'rgba(0, 0, 0, 0)',
    'The scroll area overrides the native scrollbar thumb.',
  )
  check(
    desktop.scrollbarTrackBackground === 'rgba(0, 0, 0, 0)',
    'The scroll area overrides the native scrollbar track.',
  )

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

  for (const [name, state] of [
    ['Enable DuckDuckGo fallback', 'Disabled'],
  ]) {
    const toggle = page.getByRole('switch', { name })
    await toggle.hover()
    const visibleTooltip = page.locator('.tooltip').filter({ hasText: state })
    await visibleTooltip.waitFor()
    await page.keyboard.press('Escape')
    await visibleTooltip.waitFor({ state: 'hidden' })
  }

  check(
    await page.getByTestId('search-provider-required-ollama').count() === 0,
    'A disabled Ollama provider displays a redundant warning.',
  )
  const ollamaToggle = page.getByRole('switch', { name: 'Enable Ollama hosted search' })
  check(!(await ollamaToggle.isDisabled()), 'The invalid Ollama enable control is not actionable.')
  await ollamaToggle.click()
  check(
    await ollamaToggle.getAttribute('aria-checked') === 'false',
    'Ollama is enabled without its required API key.',
  )

  const expandedOllamaDisclosure = page.getByRole('button', {
    name: 'Collapse Ollama hosted search',
  })
  check(
    await expandedOllamaDisclosure.getAttribute('aria-expanded') === 'true',
    'The Ollama disclosure closed without user input.',
  )
  const ollamaKeyLink = page.getByRole('link', {
    name: 'Create or manage an API key',
  })
  check(
    await ollamaKeyLink.getAttribute('href') === 'https://ollama.com/settings/keys',
    'The Ollama API key help link is missing or incorrect.',
  )
  const ollamaKeyInput = page.getByTestId('search-setting-ollama-apiKey')
  check(
    await ollamaKeyInput.getAttribute('placeholder') === 'Paste your Ollama API key',
    'The Ollama API key placeholder is missing or incorrect.',
  )
  await page.getByRole('button', { name: 'Show API key' }).click()
  check(
    await ollamaKeyInput.getAttribute('type') === 'text',
    'The Ollama API key reveal action did not expose the input value.',
  )
  await page.getByRole('button', { name: 'Hide API key' }).click()
  check(
    await ollamaKeyInput.getAttribute('type') === 'password',
    'The Ollama API key hide action did not mask the input value.',
  )
  await ollamaKeyInput.fill('rejected-key')
  await ollamaToggle.click()
  check(
    await ollamaToggle.getAttribute('aria-checked') === 'false',
    'Ollama is enabled after the API key is rejected.',
  )
  await page
    .getByText('API key was rejected by Ollama hosted search.', { exact: true })
    .waitFor()
  const ollamaFields = await providerFieldLayout(page, 'ollama', 'baseUrl')
  const ollamaApiKey = await providerFieldLayout(page, 'ollama', 'apiKey')
  check(
    Math.abs(ollamaFields.detailsLeft - ollamaFields.labelLeft) <= 1,
    'Ollama controls do not align with the provider label.',
  )
  check(
    ollamaFields.fullFieldWidth >= ollamaFields.fieldsWidth - 1,
    'Ollama Base URL does not span the provider field grid.',
  )
  check(
    ollamaApiKey.fullFieldWidth >= ollamaApiKey.fieldsWidth - 1,
    'Ollama API key does not span the provider field grid.',
  )
  check(
    Math.abs(ollamaApiKey.fullFieldTop - ollamaFields.fullFieldTop) > 1,
    'Ollama API key and Base URL share a row.',
  )
  check(
    Math.abs(ollamaFields.timeoutTop - ollamaFields.maxResultsTop) <= 1,
    'Ollama Timeout and provider result limit are not on the same row.',
  )
  check(ollamaFields.timeoutValue === '300', 'Ollama Timeout is not displayed as 300 seconds.')
  check(ollamaFields.timeoutMin === '1', 'Ollama Timeout minimum is not displayed in seconds.')
  check(ollamaFields.timeoutMax === '600', 'Ollama Timeout maximum is not displayed in seconds.')

  const desktopPath = join(outputDirectory, 'search-settings-desktop.png')
  await page.screenshot({ path: desktopPath })

  await page.getByRole('button', { name: 'Configure DuckDuckGo fallback' }).click()
  const duckDuckGoFields = await providerFieldLayout(page, 'duckduckgo', 'searchUrl')
  check(
    duckDuckGoFields.fullFieldWidth >= duckDuckGoFields.fieldsWidth - 1,
    'DuckDuckGo Search URL does not span the provider field grid.',
  )
  check(
    Math.abs(duckDuckGoFields.timeoutTop - duckDuckGoFields.maxResultsTop) <= 1,
    'DuckDuckGo Timeout and provider result limit are not on the same row.',
  )
  check(!duckDuckGoFields.fullFieldDisabled, 'Disabled provider fields are not editable.')

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

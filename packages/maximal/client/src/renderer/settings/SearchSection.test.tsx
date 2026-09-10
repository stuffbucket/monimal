import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  SearchSettingsResponse,
  SettingsCapabilities,
} from './capabilities'
import { AppFrame, PRODUCT_TABS } from '../frame/AppFrame'
import { SearchSection } from './SearchSection'

class NoopResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = NoopResizeObserver
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const snapshot: SearchSettingsResponse = {
  manifest: {
    id: 'search',
    label: 'Search',
    description: 'Choose how searches are handled.',
    fields: [
      { key: 'fallback', type: 'boolean', label: 'Use fallback', default: true },
      { key: 'priority', type: 'string-list', label: 'Provider priority' },
      { key: 'allowedDomains', type: 'string-list', label: 'Allowed domains' },
      { key: 'blockedDomains', type: 'string-list', label: 'Blocked domains' },
    ],
    providers: [
      {
        id: 'example',
        label: 'Example provider',
        description: 'A provider supplied by a plugin.',
        capabilities: ['search', 'fetch'],
        settings: [
          { key: 'endpoint', type: 'string', label: 'Endpoint' },
          { key: 'token', type: 'secret', label: 'Token' },
          {
            key: 'limit',
            type: 'integer',
            label: 'Limit',
            min: 1,
            max: 10,
          },
          { key: 'domains', type: 'string-list', label: 'Domains' },
          {
            key: 'mode',
            type: 'select',
            label: 'Mode',
            options: [
              { value: 'fast', label: 'Fast' },
              { value: 'deep', label: 'Deep' },
            ],
          },
        ],
      },
    ],
  },
  settings: { fallback: true, priority: ['example'] },
  providers: {
    example: {
      enabled: true,
      settings: { endpoint: 'https://search.example', limit: 5, mode: 'fast' },
      secret_sources: { token: 'settings' },
    },
  },
}

let root: Root | null = null
let container: HTMLElement | null = null

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  if (root !== null) act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.restoreAllMocks()
})

function fakeCapabilities(response: SearchSettingsResponse = snapshot) {
  const search = {
    get: vi.fn(async () => response),
    update: vi.fn(async () => response),
  }
  return {
    capabilities: { search } as unknown as SettingsCapabilities,
    search,
  }
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value',
  )?.set
  setter?.call(textarea, value)
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
}

function incompleteSnapshot(): SearchSettingsResponse {
  const response = structuredClone(snapshot)
  const token = response.manifest.providers[0]?.settings?.find(
    ({ key }) => key === 'token',
  )
  if (token === undefined) throw new Error('Token descriptor is missing')
  token.required = true
  token.emptyDescription = 'Enter a provider token.'
  response.providers.example.secret_sources = {}
  return response
}

async function renderSearch(
  capabilities: SettingsCapabilities,
): Promise<HTMLElement> {
  if (root === null || container === null) throw new Error('test root not ready')
  await act(async () => {
    root?.render(
      <AppFrame
        tabs={PRODUCT_TABS}
        activeTab="settings"
        surface="settings"
        onSelectTab={vi.fn()}
      >
        <SearchSection capabilities={capabilities} />
      </AppFrame>,
    )
    await Promise.resolve()
  })
  return container
}

function control<T extends HTMLElement>(
  surface: HTMLElement,
  testId: string,
): T {
  const element = surface.querySelector<T>(`[data-testid="${testId}"]`)
  if (element === null) throw new Error(`${testId} was not rendered`)
  return element
}

function button(surface: HTMLElement, label: string): HTMLButtonElement {
  const element = [...surface.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === label,
  )
  if (element === undefined) throw new Error(`${label} button was not rendered`)
  return element
}

describe('SearchSection', () => {
  it('renders every supported field type from the manifest', async () => {
    const { capabilities } = fakeCapabilities()
    const surface = await renderSearch(capabilities)

    expect(control(surface, 'search-setting-global-fallback')).toBeInstanceOf(
      HTMLButtonElement,
    )
    expect(
      control(surface, 'search-setting-global-fallback').querySelector('.lucide-info'),
    ).not.toBeNull()
    expect(surface.textContent).toContain('Provider order')
    expect(
      surface.querySelector('[aria-label="Disable Example provider"]')
        ?.getAttribute('aria-checked'),
    ).toBe('true')
    expect(surface.textContent).not.toContain('Enabled')
    expect(surface.querySelector('h1')?.textContent).toBe('Search')
    expect(
      [...surface.querySelectorAll('h2')].map((heading) => heading.textContent),
    ).toEqual(['Provider order', 'Domain filtering'])
    expect(surface.querySelector('.partitioned-sortable__list')).not.toBeNull()
    expect(surface.querySelector('.settings-disclosure-list')).toBeNull()
    expect(surface.querySelectorAll('.settings__section')).toHaveLength(2)
    expect(surface.querySelector('[data-testid="search-setting-global-priority"]')).toBeNull()
    expect(surface.textContent).toContain('Changes take effect after you save.')
    expect(
      surface.querySelector('[aria-label="About allowed domains"]'),
    ).not.toBeNull()
    expect(
      surface.querySelector('[aria-label="About blocked domains"]'),
    ).not.toBeNull()

    await act(async () => {
      const configure = surface.querySelector<HTMLButtonElement>(
        '[aria-label="Configure Example provider"]',
      )
      if (configure === null) throw new Error('Configure provider button was not rendered')
      configure.click()
    })
    expect(
      control(surface, 'search-setting-example-endpoint').getAttribute('type'),
    ).toBe('text')
    expect(
      control(surface, 'search-setting-example-token').getAttribute('type'),
    ).toBe('password')
    expect(
      control(surface, 'search-setting-example-limit').getAttribute('type'),
    ).toBe('number')
    expect(control(surface, 'search-setting-example-domains')).toBeInstanceOf(
      HTMLTextAreaElement,
    )
    expect(control(surface, 'search-setting-example-mode')).toBeInstanceOf(
      HTMLSelectElement,
    )
    expect(surface.textContent).toContain('A value is stored in settings.')
  })

  it('sends only changed fields and leaves an untouched secret alone', async () => {
    const { capabilities, search } = fakeCapabilities()
    const surface = await renderSearch(capabilities)

    await act(async () =>
      control<HTMLButtonElement>(
        surface,
        'search-setting-global-fallback',
      ).click(),
    )
    await act(async () => button(surface, 'Save changes').click())

    expect(search.update).toHaveBeenCalledWith({
      settings: { fallback: false },
    })
  })

  it('accepts common domain delimiters and normalizes them on blur', async () => {
    const { capabilities, search } = fakeCapabilities()
    const surface = await renderSearch(capabilities)
    const allowed = control<HTMLTextAreaElement>(
      surface,
      'search-setting-global-allowedDomains',
    )

    await act(async () => {
      setTextareaValue(allowed, 'example.com, docs.example.com; api.example.com')
    })
    expect(allowed.value).toBe('example.com, docs.example.com; api.example.com')

    await act(async () => allowed.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
    expect(allowed.value).toBe('example.com\ndocs.example.com\napi.example.com')

    await act(async () => button(surface, 'Save changes').click())
    expect(search.update).toHaveBeenCalledWith({
      settings: {
        allowedDomains: ['example.com', 'docs.example.com', 'api.example.com'],
      },
    })
  })

  it('uses null to explicitly clear a stored secret', async () => {
    const { capabilities, search } = fakeCapabilities()
    const surface = await renderSearch(capabilities)

    await act(async () => {
      const configure = surface.querySelector<HTMLButtonElement>(
        '[aria-label="Configure Example provider"]',
      )
      if (configure === null) throw new Error('Configure provider button was not rendered')
      configure.click()
    })
    await act(async () => button(surface, 'Clear stored value').click())
    expect(surface.textContent).toContain(
      'The stored value will be cleared when you save.',
    )
    await act(async () => button(surface, 'Save changes').click())

    expect(search.update).toHaveBeenCalledWith({
      providers: { example: { settings: { token: null } } },
    })
  })

  it('persists provider enablement from the ordered lists', async () => {
    const { capabilities, search } = fakeCapabilities()
    const surface = await renderSearch(capabilities)

    await act(async () => {
      const disable = surface.querySelector<HTMLButtonElement>(
        '[aria-label="Disable Example provider"]',
      )
      if (disable === null) throw new Error('Disable provider button was not rendered')
      disable.click()
    })
    await act(async () => button(surface, 'Save changes').click())

    expect(search.update).toHaveBeenCalledWith({
      providers: { example: { enabled: false } },
    })
  })

  it('opens, explains, and delays disabling an incomplete enabled provider', async () => {
    vi.useFakeTimers()
    const { capabilities, search } = fakeCapabilities(incompleteSnapshot())
    const surface = await renderSearch(capabilities)
    const token = control<HTMLInputElement>(surface, 'search-setting-example-token')
    const disable = surface.querySelector<HTMLButtonElement>(
      '[aria-label="Disable Example provider"]',
    )

    expect(token.getAttribute('aria-invalid')).toBe('true')
    expect(token.title).toBe('Token is required. Enter a provider token.')
    expect(surface.textContent).toContain(
      'Token is required. Enter a provider token.',
    )
    const requiredAlert = control<HTMLElement>(
      surface,
      'search-provider-required-example',
    )
    expect(requiredAlert.getAttribute('role')).toBe('alert')
    expect(requiredAlert.textContent).toContain(
      'Example provider will be disabled unless its required information is completed',
    )
    expect(disable?.disabled).toBe(true)

    await act(async () => vi.advanceTimersByTime(1200))

    const enable = surface.querySelector<HTMLButtonElement>(
      '[aria-label="Enable Example provider"]',
    )
    expect(enable?.getAttribute('aria-checked')).toBe('false')
    expect(enable?.disabled).toBe(true)
    expect(requiredAlert.textContent).toContain(
      'Example provider cannot be enabled until its required information is completed',
    )
    expect(token.disabled).toBe(false)
    await act(async () => button(surface, 'Save changes').click())
    expect(search.update).toHaveBeenCalledWith({
      providers: { example: { enabled: false } },
    })
    vi.useRealTimers()
  })

  it('keeps an enabled provider active when requirements are completed in time', async () => {
    vi.useFakeTimers()
    const { capabilities } = fakeCapabilities(incompleteSnapshot())
    const surface = await renderSearch(capabilities)
    const token = control<HTMLInputElement>(surface, 'search-setting-example-token')

    await act(async () => setInputValue(token, 'ready-token'))
    expect(token.getAttribute('aria-invalid')).toBeNull()
    expect(
      surface.querySelector<HTMLButtonElement>(
        '[aria-label="Disable Example provider"]',
      )?.disabled,
    ).toBe(false)

    await act(async () => vi.advanceTimersByTime(1200))
    expect(
      surface.querySelector('[aria-label="Disable Example provider"]')
        ?.getAttribute('aria-checked'),
    ).toBe('true')
    vi.useRealTimers()
  })
})

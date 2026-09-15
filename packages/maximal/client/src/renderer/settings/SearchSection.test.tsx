import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  SearchProviderValidationResponse,
  SearchSettingsResponse,
  SettingsCapabilities,
} from './capabilities'
import { AppFrame, PRODUCT_TABS } from '../frame/AppFrame'
import {
  UnsavedChangesProvider,
  useGuardedNavigation,
} from '../unsaved-changes'
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
          {
            key: 'endpoint',
            type: 'string',
            label: 'Endpoint',
            placeholder: 'https://search.example/api',
          },
          {
            key: 'token',
            type: 'secret',
            label: 'Token',
            placeholder: 'Paste provider token',
            helpLink: {
              label: 'Create a token',
              url: 'https://search.example/tokens',
            },
          },
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
  document.querySelectorAll('.sb-shell--standalone').forEach((node) => node.remove())
  container?.remove()
  root = null
  container = null
  vi.restoreAllMocks()
})

function fakeCapabilities(response: SearchSettingsResponse = snapshot) {
  const search = {
    get: vi.fn(async () => response),
    update: vi.fn(async () => response),
    validateProvider: vi.fn(async (): Promise<SearchProviderValidationResponse> => ({
      status: 'valid' as const,
      fieldErrors: {},
    })),
  }
  return {
    capabilities: { search } as unknown as SettingsCapabilities,
    search,
  }
}

function LeaveSearchTrigger(): ReactElement {
  const requestNavigation = useGuardedNavigation()
  return (
    <button
      type="button"
      hidden
      data-testid="leave-search"
      onClick={() => requestNavigation(() => undefined)}
    >
      Leave Search
    </button>
  )
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
      <UnsavedChangesProvider>
        <AppFrame
          tabs={PRODUCT_TABS}
          activeTab="settings"
          surface="settings"
          onSelectTab={vi.fn()}
        >
          <SearchSection capabilities={capabilities} />
        </AppFrame>
        <LeaveSearchTrigger />
      </UnsavedChangesProvider>,
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

function dialogButton(label: string): HTMLButtonElement {
  const element = [...document.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === label,
  )
  if (element === undefined) throw new Error(`${label} dialog button was not rendered`)
  return element
}

async function openLeaveDialog(surface: HTMLElement): Promise<void> {
  await act(async () => {
    control<HTMLButtonElement>(surface, 'leave-search').click()
  })
}

async function saveByLeaving(surface: HTMLElement): Promise<void> {
  await openLeaveDialog(surface)
  await act(async () => {
    dialogButton('Save changes').click()
    await Promise.resolve()
  })
}

describe('SearchSection', () => {
  it('renders every supported field type from the manifest', async () => {
    const { capabilities } = fakeCapabilities()
    const surface = await renderSearch(capabilities)

    expect(control(surface, 'search-setting-global-fallback')).toBeInstanceOf(
      HTMLButtonElement,
    )
    expect(
      control(surface, 'search-setting-global-fallback').closest(
        '.search-provider-order__fallback',
      ),
    ).not.toBeNull()
    expect(
      control(surface, 'search-setting-global-fallback').querySelector('.lucide-info'),
    ).not.toBeNull()
    expect(surface.textContent).toContain('Provider order')
    expect(
      surface.querySelector('[aria-label="Disable Example provider"]')
        ?.getAttribute('aria-checked'),
    ).toBe('true')
    expect(surface.textContent).not.toContain('Enabled')
    expect(surface.querySelector('h1')).toBeNull()
    expect(
      [...surface.querySelectorAll('h2')].map((heading) => heading.textContent),
    ).toEqual(['Provider order', 'Domain filtering'])
    expect(surface.querySelector('.partitioned-sortable__list')).not.toBeNull()
    expect(surface.querySelector('.settings-disclosure-list')).toBeNull()
    expect(surface.querySelectorAll('.settings__section')).toHaveLength(2)
    expect(surface.querySelector('[data-testid="search-setting-global-priority"]')).toBeNull()
    expect(surface.textContent).not.toContain('Changes take effect after you save.')
    expect(surface.textContent).not.toContain('Reset changes')
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
      control(surface, 'search-setting-example-endpoint').getAttribute('placeholder'),
    ).toBe('https://search.example/api')
    expect(
      control(surface, 'search-setting-example-token').getAttribute('placeholder'),
    ).toBe('Paste provider token')
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
    const helpLink = surface.querySelector<HTMLAnchorElement>(
      'a[href="https://search.example/tokens"]',
    )
    expect(helpLink?.textContent).toBe('Create a token')
    expect(helpLink?.target).toBe('_blank')
    expect(helpLink?.rel).toBe('noreferrer')

    const token = control<HTMLInputElement>(surface, 'search-setting-example-token')
    await act(async () => setInputValue(token, 'visible-token'))
    await act(async () => {
      const reveal = surface.querySelector<HTMLButtonElement>('[aria-label="Show Token"]')
      if (reveal === null) throw new Error('Secret reveal button was not rendered')
      reveal.click()
    })
    expect(token.type).toBe('text')
    expect(surface.querySelector('[aria-label="Hide Token"]')).not.toBeNull()
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
    await saveByLeaving(surface)

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

    await saveByLeaving(surface)
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
    await saveByLeaving(surface)

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
    await saveByLeaving(surface)

    expect(search.update).toHaveBeenCalledWith({
      providers: { example: { enabled: false } },
    })
  })

  it('does not auto-disable or expand an incomplete enabled provider', async () => {
    vi.useFakeTimers()
    const { capabilities, search } = fakeCapabilities(incompleteSnapshot())
    const surface = await renderSearch(capabilities)
    const disable = surface.querySelector<HTMLButtonElement>(
      '[aria-label="Disable Example provider"]',
    )

    expect(disable?.getAttribute('aria-checked')).toBe('true')
    expect(disable?.disabled).toBe(false)
    expect(surface.querySelector('[data-testid="search-setting-example-token"]')).toBeNull()

    await act(async () => vi.runAllTimers())

    expect(disable?.getAttribute('aria-checked')).toBe('true')
    expect(surface.querySelector('[data-testid="search-setting-example-token"]')).toBeNull()
    expect(search.update).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('opens a disabled provider instead of enabling it when settings are invalid', async () => {
    const response = incompleteSnapshot()
    response.providers.example.enabled = false
    const { capabilities, search } = fakeCapabilities(response)
    const surface = await renderSearch(capabilities)
    const enable = surface.querySelector<HTMLButtonElement>(
      '[aria-label="Enable Example provider"]',
    )

    expect(surface.querySelector('[data-testid="search-setting-example-token"]')).toBeNull()
    expect(surface.querySelector('[data-testid="search-provider-required-example"]')).toBeNull()
    expect(enable?.disabled).toBe(false)

    await act(async () => enable?.click())

    expect(enable?.getAttribute('aria-checked')).toBe('false')
    expect(control(surface, 'search-setting-example-token')).toBeInstanceOf(
      HTMLInputElement,
    )
    expect(search.update).not.toHaveBeenCalled()
  })

  it('flags a rejected secret and keeps the provider disabled', async () => {
    const response = incompleteSnapshot()
    response.providers.example.enabled = false
    const { capabilities, search } = fakeCapabilities(response)
    search.validateProvider.mockResolvedValue({
      status: 'invalid',
      fieldErrors: { token: 'Token was rejected by Example provider.' },
    })
    const surface = await renderSearch(capabilities)

    await act(async () => {
      surface.querySelector<HTMLButtonElement>(
        '[aria-label="Enable Example provider"]',
      )?.click()
    })
    const token = control<HTMLInputElement>(surface, 'search-setting-example-token')
    await act(async () => setInputValue(token, 'rejected-token'))
    await act(async () => {
      surface.querySelector<HTMLButtonElement>(
        '[aria-label="Enable Example provider"]',
      )?.click()
      await Promise.resolve()
    })

    expect(search.validateProvider).toHaveBeenCalledWith({
      providerId: 'example',
      settings: { token: 'rejected-token' },
    })
    expect(
      surface.querySelector('[aria-label="Enable Example provider"]')
        ?.getAttribute('aria-checked'),
    ).toBe('false')
    expect(token.getAttribute('aria-invalid')).toBe('true')
    expect(surface.querySelector('[role="alert"]')?.textContent).toBe(
      'Token was rejected by Example provider.',
    )
    await openLeaveDialog(surface)
    expect(dialogButton('Save changes').disabled).toBe(true)
  })

  it('validates a changed secret before saving an enabled provider', async () => {
    const response = structuredClone(snapshot)
    response.providers.example.secret_sources = {}
    const { capabilities, search } = fakeCapabilities(response)
    search.validateProvider.mockResolvedValue({
      status: 'invalid',
      fieldErrors: { token: 'Token was rejected by Example provider.' },
    })
    const surface = await renderSearch(capabilities)

    await act(async () => {
      surface.querySelector<HTMLButtonElement>(
        '[aria-label="Configure Example provider"]',
      )?.click()
    })
    const token = control<HTMLInputElement>(surface, 'search-setting-example-token')
    await act(async () => setInputValue(token, 'rejected-token'))
    await saveByLeaving(surface)

    expect(search.validateProvider).toHaveBeenCalledWith({
      providerId: 'example',
      settings: { token: 'rejected-token' },
    })
    expect(search.update).not.toHaveBeenCalled()
    expect(token.getAttribute('aria-invalid')).toBe('true')
    expect(surface.querySelector('[role="alert"]')?.textContent).toBe(
      'Token was rejected by Example provider.',
    )
  })

  it('keeps an enabled provider active while its requirements are edited', async () => {
    const { capabilities } = fakeCapabilities(incompleteSnapshot())
    const surface = await renderSearch(capabilities)
    await act(async () => {
      surface.querySelector<HTMLButtonElement>(
        '[aria-label="Configure Example provider"]',
      )?.click()
    })
    const token = control<HTMLInputElement>(surface, 'search-setting-example-token')

    await act(async () => setInputValue(token, 'ready-token'))
    expect(token.getAttribute('aria-invalid')).toBeNull()
    expect(
      surface.querySelector<HTMLButtonElement>(
        '[aria-label="Disable Example provider"]',
      )?.disabled,
    ).toBe(false)

    expect(
      surface.querySelector('[aria-label="Disable Example provider"]')
        ?.getAttribute('aria-checked'),
    ).toBe('true')
  })
})

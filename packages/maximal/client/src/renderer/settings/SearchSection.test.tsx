import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  SearchSettingsResponse,
  SettingsCapabilities,
} from './capabilities'
import { SearchSection } from './SearchSection'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const snapshot: SearchSettingsResponse = {
  manifest: {
    id: 'search',
    label: 'Search',
    description: 'Choose how searches are handled.',
    fields: [
      { key: 'fallback', type: 'boolean', label: 'Use fallback', default: true },
      { key: 'priority', type: 'string-list', label: 'Provider priority' },
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

function fakeCapabilities() {
  const search = {
    get: vi.fn(async () => snapshot),
    update: vi.fn(async () => snapshot),
  }
  return {
    capabilities: { search } as unknown as SettingsCapabilities,
    search,
  }
}

async function renderSearch(
  capabilities: SettingsCapabilities,
): Promise<HTMLElement> {
  if (root === null || container === null) throw new Error('test root not ready')
  await act(async () => {
    root?.render(<SearchSection capabilities={capabilities} />)
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
    expect(surface.textContent).toContain('Provider order')
    expect(surface.textContent).toContain('Enabled')
    expect(surface.querySelector('h1')?.textContent).toBe('Search')
    expect(
      [...surface.querySelectorAll('h2')].map((heading) => heading.textContent),
    ).toEqual(['Provider order', 'Search behavior', 'Provider configuration'])
    expect(
      surface.querySelector('h3.settings-disclosure__title')?.textContent,
    ).toBe('Example provider')
    expect(surface.querySelector('.settings-disclosure-list')).not.toBeNull()
    expect(surface.querySelectorAll('.settings__section')).toHaveLength(3)
    expect(surface.querySelector('[data-testid="search-setting-global-priority"]')).toBeNull()
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

  it('uses null to explicitly clear a stored secret', async () => {
    const { capabilities, search } = fakeCapabilities()
    const surface = await renderSearch(capabilities)

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
})

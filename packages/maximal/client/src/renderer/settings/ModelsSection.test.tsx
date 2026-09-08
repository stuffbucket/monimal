import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ModelsListResponse, SettingsCapabilities } from './capabilities'
import { ModelsSection } from './ModelsSection'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const catalogue: ModelsListResponse = {
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
      id: 'mystery-chat',
      name: 'Mystery Chat',
      vendor: 'Example',
      family: 'unknown',
      type: '',
      preview: true,
      context_window_tokens: 200_000,
      max_output_tokens: null,
      capabilities: {
        vision: false,
        tool_calls: false,
        streaming: false,
        reasoning: false,
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
        reasoning: true,
      },
    },
  ],
  count: 3,
  loaded_at: null,
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

function fakeCapabilities(list: () => Promise<ModelsListResponse>) {
  const models = {
    list: vi.fn(list),
    refresh: vi.fn(async () => catalogue),
  }
  return {
    capabilities: { models } as unknown as SettingsCapabilities,
    models,
  }
}

async function renderModels(capabilities: SettingsCapabilities): Promise<HTMLElement> {
  if (root === null || container === null) throw new Error('test root not ready')
  await act(async () => {
    root?.render(<ModelsSection capabilities={capabilities} />)
    await Promise.resolve()
  })
  return container
}

function tableRows(table: HTMLTableElement): HTMLTableRowElement[] {
  return [...table.querySelectorAll<HTMLTableRowElement>('tbody tr')]
}

describe('ModelsSection', () => {
  it('groups models by vendor then type and labels a missing type', async () => {
    const { capabilities } = fakeCapabilities(async () => catalogue)
    const surface = await renderModels(capabilities)
    const vendors = [...surface.querySelectorAll<HTMLElement>('.settings-model-vendor')]
    const regions = [...surface.querySelectorAll<HTMLElement>('[role="region"]')]

    expect(
      vendors.map((vendor) => vendor.querySelector('h2')?.textContent),
    ).toEqual(['Anthropic', 'Example'])
    expect(
      regions.map((region) => region.querySelector('caption')?.textContent),
    ).toEqual(['chat models (1)', 'Type not reported (1)', 'embeddings models (1)'])
    expect(regions.map((region) => region.tabIndex)).toEqual([0, 0, 0])
    const captionIds = regions.map((region) => region.querySelector('caption')?.id)
    expect(regions.map((region) => region.getAttribute('aria-labelledby'))).toEqual(
      captionIds,
    )
    expect(captionIds.every((id) => id !== undefined && id !== '')).toBe(true)
    expect(new Set(captionIds).size).toBe(captionIds.length)

    const vendorHeadings = vendors.map((vendor) => vendor.querySelector('h2'))
    const vendorHeadingIds = vendorHeadings.map((heading) => heading?.id)
    expect(vendors.map((vendor) => vendor.getAttribute('aria-labelledby'))).toEqual(
      vendorHeadingIds,
    )
    expect(vendorHeadingIds.every((id) => id !== undefined && id !== '')).toBe(true)
    expect(new Set(vendorHeadingIds).size).toBe(vendorHeadingIds.length)
  })

  it('normalizes grouping labels and distinguishes singular token quantities', async () => {
    const normalizedCatalogue: ModelsListResponse = {
      models: [
        {
          ...catalogue.models[0]!,
          id: 'trimmed-model',
          vendor: '  Acme  ',
          type: '  chat  ',
          context_window_tokens: 1,
          max_output_tokens: 1,
        },
        {
          ...catalogue.models[1]!,
          id: 'unclassified-model',
          vendor: '   ',
          type: '   ',
        },
      ],
      count: 2,
      loaded_at: null,
    }
    const { capabilities } = fakeCapabilities(async () => normalizedCatalogue)
    const surface = await renderModels(capabilities)

    expect(
      [...surface.querySelectorAll('.settings-model-vendor h2')].map(
        (heading) => heading.textContent,
      ),
    ).toEqual(['Acme', 'Vendor not reported'])
    expect(
      [...surface.querySelectorAll('caption')].map((caption) => caption.textContent),
    ).toEqual(['chat models (1)', 'Type not reported (1)'])
    expect(
      [...surface.querySelectorAll<HTMLElement>('.settings-table__number span')]
        .slice(0, 2)
        .map((quantity) => quantity.getAttribute('aria-label')),
    ).toEqual(['1 token', '1 token'])
  })

  it('renders only the refined scoped columns and keeps model IDs verbatim', async () => {
    const { capabilities } = fakeCapabilities(async () => catalogue)
    const surface = await renderModels(capabilities)
    const tables = [...surface.querySelectorAll<HTMLTableElement>('table')]
    const chatTable = tables[0]
    if (chatTable === undefined) throw new Error('chat models table was not rendered')

    expect(
      [...chatTable.querySelectorAll('thead th')].map((heading) => heading.textContent),
    ).toEqual(['Model', 'Context', 'Max output', 'Capabilities'])
    expect(
      [...chatTable.querySelectorAll('thead th')].map((heading) => heading.getAttribute('scope')),
    ).toEqual(Array.from({ length: 4 }, () => 'col'))

    const ids = [...surface.querySelectorAll('tbody code')].map((code) => code.textContent)
    expect(ids).toEqual(['claude-opus-5', 'mystery-chat', 'embed-one'])
    expect(surface.textContent).not.toContain('claude-opus-5-1M')
    expect(tableRows(chatTable)[0]?.querySelector('th')?.getAttribute('scope')).toBe('row')
  })

  it('shows compact counts with exact token labels and never byte labels', async () => {
    const { capabilities } = fakeCapabilities(async () => catalogue)
    const surface = await renderModels(capabilities)
    const quantities = [...surface.querySelectorAll<HTMLElement>('.settings-table__number span')]

    expect(quantities.map((quantity) => quantity.textContent?.trim())).toEqual([
      '1M',
      '128K',
      '200K',
      '—',
      '8.2K',
      '—',
    ])
    expect(quantities.map((quantity) => quantity.getAttribute('aria-label'))).toEqual([
      '1,000,000 tokens',
      '128,000 tokens',
      '200,000 tokens',
      'Not reported',
      '8,192 tokens',
      'Not reported',
    ])
    expect(quantities.map((quantity) => quantity.title)).toEqual(
      quantities.map((quantity) => quantity.getAttribute('aria-label')),
    )
    expect(surface.textContent?.toLowerCase()).not.toContain('byte')
  })

  it('uses accessible icons for only the closed capability schema', async () => {
    const { capabilities } = fakeCapabilities(async () => catalogue)
    const surface = await renderModels(capabilities)
    const tables = [...surface.querySelectorAll<HTMLTableElement>('table')]
    const firstIcons = [...tables[0]!.querySelectorAll<HTMLElement>('[role="img"]')]

    expect(firstIcons.map((icon) => icon.getAttribute('aria-label'))).toEqual([
      'Vision',
      'Tool calls',
      'Streaming',
      'Reasoning',
    ])
    expect(firstIcons.map((icon) => icon.title)).toEqual([
      'Vision',
      'Tool calls',
      'Streaming',
      'Reasoning',
    ])
    expect(tables[1]?.querySelectorAll('[role="img"]')).toHaveLength(0)
    expect(tables[1]?.querySelector('[title="No capabilities reported"]')).not.toBeNull()
    expect(
      [...(tables[2]?.querySelectorAll<HTMLElement>('[role="img"]') ?? [])].map(
        (icon) => icon.getAttribute('aria-label'),
      ),
    ).toEqual(['Streaming', 'Reasoning'])
    expect(surface.textContent).not.toContain('Vision')
    expect(surface.textContent).not.toContain('Audio')
    expect(surface.textContent).not.toContain('Voice')
  })

  it('shows loading, empty, and error states', async () => {
    let resolveList: ((value: ModelsListResponse) => void) | undefined
    const pending = new Promise<ModelsListResponse>((resolve) => {
      resolveList = resolve
    })
    const pendingCapabilities = fakeCapabilities(() => pending)
    const surface = await renderModels(pendingCapabilities.capabilities)
    const initialRefresh = surface.querySelector<HTMLButtonElement>('button')
    expect(surface.textContent).toContain('Loading model catalogue…')
    expect(initialRefresh?.textContent).toBe('Refreshing…')
    expect(initialRefresh?.disabled).toBe(true)
    expect(initialRefresh?.classList.contains('btn--primary')).toBe(true)

    await act(async () => resolveList?.({ models: [], count: 0, loaded_at: null }))
    expect(surface.textContent).toContain('No models are available yet.')

    const failure = fakeCapabilities(async () => {
      throw new Error('catalogue unavailable')
    })
    await act(async () => {
      root?.render(<ModelsSection capabilities={failure.capabilities} />)
      await Promise.resolve()
    })
    expect(surface.textContent).toContain('catalogue unavailable')
  })

  it('refreshes the catalogue and replaces the rendered rows', async () => {
    const initial = { ...catalogue, models: [catalogue.models[0]!], count: 1 }
    const refreshed = { ...catalogue, models: [catalogue.models[2]!], count: 1 }
    const { capabilities, models } = fakeCapabilities(async () => initial)
    models.refresh.mockResolvedValue(refreshed)
    const surface = await renderModels(capabilities)
    const refresh = [...surface.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Refresh',
    )
    if (refresh === undefined) throw new Error('Refresh button was not rendered')

    await act(async () => refresh.click())

    expect(models.refresh).toHaveBeenCalledOnce()
    expect(surface.textContent).not.toContain('Claude Opus 5')
    expect(surface.textContent).toContain('Embed One')
    expect(refresh.textContent).toBe('Refresh')
    expect(refresh.disabled).toBe(false)
  })

  it('disables refresh while a replacement catalogue is pending', async () => {
    let resolveRefresh: ((value: ModelsListResponse) => void) | undefined
    const pendingRefresh = new Promise<ModelsListResponse>((resolve) => {
      resolveRefresh = resolve
    })
    const { capabilities, models } = fakeCapabilities(async () => catalogue)
    models.refresh.mockReturnValue(pendingRefresh)
    const surface = await renderModels(capabilities)
    const refresh = surface.querySelector<HTMLButtonElement>('button')
    if (refresh === null) throw new Error('Refresh button was not rendered')

    act(() => refresh.click())

    expect(refresh.textContent).toBe('Refreshing…')
    expect(refresh.disabled).toBe(true)

    await act(async () => resolveRefresh?.(catalogue))
    expect(refresh.textContent).toBe('Refresh')
    expect(refresh.disabled).toBe(false)
  })

  it('reports a refresh failure and restores the refresh action', async () => {
    const { capabilities, models } = fakeCapabilities(async () => catalogue)
    models.refresh.mockRejectedValue(new Error('refresh unavailable'))
    const surface = await renderModels(capabilities)
    const refresh = surface.querySelector<HTMLButtonElement>('button')
    if (refresh === null) throw new Error('Refresh button was not rendered')

    await act(async () => refresh.click())

    expect(surface.textContent).toContain('refresh unavailable')
    expect(refresh.textContent).toBe('Refresh')
    expect(refresh.disabled).toBe(false)
  })

  it('clears a catalogue error after a successful refresh', async () => {
    const { capabilities } = fakeCapabilities(async () => {
      throw new Error('catalogue unavailable')
    })
    const surface = await renderModels(capabilities)
    const refresh = surface.querySelector<HTMLButtonElement>('button')
    if (refresh === null) throw new Error('Refresh button was not rendered')

    await act(async () => refresh.click())

    expect(surface.textContent).not.toContain('catalogue unavailable')
    expect(surface.textContent).toContain('Claude Opus 5')
  })

  it('refreshes through replacement capabilities after reconnecting', async () => {
    const initial = fakeCapabilities(async () => catalogue)
    const replacementCatalogue = {
      ...catalogue,
      models: [catalogue.models[2]!],
      count: 1,
    }
    const replacement = fakeCapabilities(async () => replacementCatalogue)
    replacement.models.refresh.mockResolvedValue(replacementCatalogue)
    const surface = await renderModels(initial.capabilities)

    await act(async () => {
      root?.render(<ModelsSection capabilities={replacement.capabilities} />)
      await Promise.resolve()
    })
    const refresh = surface.querySelector<HTMLButtonElement>('button')
    if (refresh === null) throw new Error('Refresh button was not rendered')
    await act(async () => refresh.click())

    expect(initial.models.refresh).not.toHaveBeenCalled()
    expect(replacement.models.refresh).toHaveBeenCalledOnce()
    expect(surface.textContent).toContain('Embed One')
    expect(surface.textContent).not.toContain('Claude Opus 5')
  })
})

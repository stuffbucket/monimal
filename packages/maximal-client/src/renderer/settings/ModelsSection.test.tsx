import * as Tooltip from '@radix-ui/react-tooltip'
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
        image_generation: false,
        video_generation: false,
        tool_calls: true,
        streaming: true,
        reasoning: true,
      },
    },
    {
      id: 'image-model',
      name: 'Image model',
      vendor: 'Ollama',
      family: 'image',
      type: 'image',
      preview: true,
      context_window_tokens: null,
      max_output_tokens: null,
      capabilities: {
        vision: false,
        image_generation: true,
        video_generation: false,
        tool_calls: false,
        streaming: false,
        reasoning: false,
      },
    },
  ],
  count: 2,
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
    root?.render(
      <Tooltip.Provider delayDuration={0}>
        <ModelsSection capabilities={capabilities} />
      </Tooltip.Provider>,
    )
    await Promise.resolve()
  })
  return container
}

describe('ModelsSection', () => {
  it('renders the shared model-card grid grouped by model type', async () => {
    const { capabilities } = fakeCapabilities(async () => catalogue)
    const surface = await renderModels(capabilities)

    expect(surface.querySelector('h2')?.textContent).toBe('Cloud Models')
    expect([...surface.querySelectorAll('.settings__section-title')].map(
      (heading) => heading.textContent,
    )).toEqual(['Cloud Models', 'Chat models (1)', 'Image models (1)'])
    expect(surface.querySelectorAll('.model-card')).toHaveLength(2)
    expect(surface.textContent).toContain('Claude Opus 5')
    expect(surface.textContent).toContain('claude-opus-5')
    expect(surface.textContent).toContain('1.0M')
    expect(surface.textContent).toContain('Tools')
    expect(surface.textContent).toContain('Image generation')
  })

  it('shows loading, empty, and error states', async () => {
    let resolveList: ((value: ModelsListResponse) => void) | undefined
    const pending = new Promise<ModelsListResponse>((resolve) => {
      resolveList = resolve
    })
    const pendingCapabilities = fakeCapabilities(() => pending)
    const surface = await renderModels(pendingCapabilities.capabilities)
    const refresh = surface.querySelector<HTMLButtonElement>('button')

    expect(surface.textContent).toContain('Loading model catalogue…')
    expect(refresh?.textContent).toBe('Refreshing…')
    expect(refresh?.disabled).toBe(true)

    await act(async () => resolveList?.({ models: [], count: 0, loaded_at: null }))
    expect(surface.textContent).toContain('No cloud models are currently available.')

    const failure = fakeCapabilities(async () => {
      throw new Error('catalogue unavailable')
    })
    await act(async () => {
      root?.render(
        <Tooltip.Provider>
          <ModelsSection capabilities={failure.capabilities} />
        </Tooltip.Provider>,
      )
      await Promise.resolve()
    })
    expect(surface.textContent).toContain('catalogue unavailable')
  })

  it('refreshes the model-card grid', async () => {
    const initial = { ...catalogue, models: [catalogue.models[0]], count: 1 }
    const refreshed = { ...catalogue, models: [catalogue.models[1]], count: 1 }
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
    expect(surface.textContent).toContain('Image model')
  })
})

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TooltipProvider } from '@radix-ui/react-tooltip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  LocalModelCatalogSnapshot,
  LocalModelOperationEvent,
  SettingsCapabilities,
} from './capabilities'
import { LocalModelsSection } from './LocalModelsSection'

class NoopResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = NoopResizeObserver
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const OLLAMA_ENDPOINT = 'http://127.0.0.1:11434'
const MAXIMAL_ENDPOINT = (() => {
  const endpoint = new URL(OLLAMA_ENDPOINT)
  endpoint.port = '4141'
  return endpoint.toString().replace(/\/$/u, '')
})()

const catalogue: LocalModelCatalogSnapshot = {
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

function fakeCapabilities(initial: LocalModelCatalogSnapshot = catalogue) {
  let listener: (event: LocalModelOperationEvent) => void = () => {}
  const localModels = {
    list: vi.fn(async () => initial),
    ensure: vi.fn(async (modelKey: string) => ({
      modelKey,
      operationId: 'operation-1',
      started: true,
    })),
    cancel: vi.fn(async (operationId: string) => ({
      operationId,
      cancelled: true,
    })),
    openFolder: vi.fn(async () => {}),
    subscribe: vi.fn((next: (event: LocalModelOperationEvent) => void) => {
      listener = next
      return () => {}
    }),
  }
  const runtimeStatus = {
      installation: 'application' as const,
      installed: true,
      running: false,
      can_launch: true,
      can_manage: true,
      application_path: '/Applications/Ollama.app',
      server_configuration_path: '/Users/test/.ollama/server.json',
      desktop_settings_path: '/Users/test/Ollama/db.sqlite',
      endpoint: OLLAMA_ENDPOINT,
      process_id: null,
      process_endpoint: null,
      suggested_endpoint: null,
      context_length: 4096,
  }
  const ollamaRuntime = {
    status: vi.fn(async () => runtimeStatus),
    launch: vi.fn(async () => ({
      installation: 'application' as const,
      installed: true,
      running: true,
      can_launch: true,
      can_manage: true,
      application_path: '/Applications/Ollama.app',
      server_configuration_path: '/Users/test/.ollama/server.json',
      desktop_settings_path: '/Users/test/Ollama/db.sqlite',
      endpoint: OLLAMA_ENDPOINT,
      process_id: 42,
      process_endpoint: OLLAMA_ENDPOINT,
      suggested_endpoint: null,
      context_length: 4096,
    })),
    updateContextLength: vi.fn(async (contextLength: number) => ({
      ...runtimeStatus,
      context_length: contextLength,
    })),
  }
  let ollamaSettingsValue = {
    has_api_key: false,
    api_key: null,
    credential_source: 'none' as const,
    local_enabled: true,
    local_endpoint: OLLAMA_ENDPOINT,
    prefer_local_models: true,
  }
  const ollamaSettings = {
    get: vi.fn(async () => ollamaSettingsValue),
    update: vi.fn(async (update: Partial<typeof ollamaSettingsValue>) => {
      ollamaSettingsValue = { ...ollamaSettingsValue, ...update }
      return ollamaSettingsValue
    }),
  }
  return {
    capabilities: {
      localModels,
      ollamaRuntime,
      ollamaSettings,
      connection: {
        proxyUrl: vi.fn(async () => MAXIMAL_ENDPOINT),
      },
    } as unknown as SettingsCapabilities,
    emit: (event: LocalModelOperationEvent) => listener(event),
    localModels,
    ollamaRuntime,
    ollamaSettings,
  }
}

async function renderLocalModels(
  capabilities: SettingsCapabilities,
): Promise<HTMLElement> {
  if (root === null || container === null) throw new Error('test root not ready')
  await act(async () => {
    root?.render(
      <TooltipProvider>
        <LocalModelsSection capabilities={capabilities} />
      </TooltipProvider>,
    )
    await Promise.resolve()
  })
  return container
}

function button(surface: HTMLElement, label: string): HTMLButtonElement {
  const match = [...surface.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent === label,
  )
  if (match === undefined) throw new Error(`${label} button was not rendered`)
  return match
}

describe('LocalModelsSection', () => {
  it('renders path-free model metadata and opens the owned models folder', async () => {
    const { capabilities, localModels } = fakeCapabilities()
    const surface = await renderLocalModels(capabilities)

    expect(surface.querySelector('h1')).toBeNull()
    expect(surface.textContent).toContain('Qwen3 0.6B Q8')
    expect(surface.textContent).toContain('qwen3-0.6b')
    expect(surface.textContent).toContain('Installed, not running')
    expect(surface.textContent).toContain('Enabled · Running · Maximal')
    expect(surface.textContent).toContain('Available models')
    expect(surface.textContent).toContain('Chat models (1)')
    expect(surface.textContent).not.toContain('/models/')

    await act(async () => button(surface, 'Open models folder').click())
    expect(localModels.openFolder).toHaveBeenCalledOnce()
  })

  it('starts, reports, and cancels provisioning by operation id', async () => {
    const { capabilities, emit, localModels } = fakeCapabilities()
    const surface = await renderLocalModels(capabilities)

    await act(async () => button(surface, 'Download').click())
    expect(localModels.ensure).toHaveBeenCalledWith('qwen3-0.6b-q8-gguf')

    act(() => {
      emit({
        type: 'progress',
        operationId: 'operation-1',
        progress: {
          modelKey: 'qwen3-0.6b-q8-gguf',
          phase: 'downloading',
          completedBytes: 1024,
          totalBytes: 4096,
        },
      })
    })
    expect(surface.textContent).toContain('Downloading')

    await act(async () => button(surface, 'Cancel').click())
    expect(localModels.cancel).toHaveBeenCalledWith('operation-1')
    expect(surface.textContent).toContain('Download')
  })

  it('reconciles catalogue and completion events without deletion controls', async () => {
    const { capabilities, emit } = fakeCapabilities()
    const surface = await renderLocalModels(capabilities)

    await act(async () => button(surface, 'Download').click())
    act(() => {
      emit({
        type: 'completed',
        operationId: 'operation-1',
        model: { ...catalogue.models[0], state: 'ready' },
      })
    })

    expect(surface.textContent).toContain('ready')
    expect(surface.textContent).not.toContain('Cancel')
    expect(surface.textContent).not.toContain('Delete')

    act(() => {
      emit({
        type: 'catalog',
        snapshot: { models: [], revision: 2 },
      })
    })
    expect(surface.textContent).toContain('No bundled local models are configured.')
  })

  it('surfaces provisioning and folder failures', async () => {
    const { capabilities, emit, localModels } = fakeCapabilities()
    localModels.openFolder.mockRejectedValue(new Error('folder unavailable'))
    const surface = await renderLocalModels(capabilities)

    await act(async () => button(surface, 'Open models folder').click())
    expect(surface.textContent).toContain('folder unavailable')

    await act(async () => {
      emit({
        type: 'failed',
        operationId: 'operation-1',
        error: { message: 'download rejected', retryable: true },
      })
      await Promise.resolve()
    })
    expect(surface.textContent).toContain('download rejected')
  })

  it('opens an installed Ollama desktop app and reports its process status', async () => {
    const { capabilities, ollamaRuntime } = fakeCapabilities()
    const surface = await renderLocalModels(capabilities)

    await act(async () => button(surface, 'Open Ollama').click())

    expect(ollamaRuntime.launch).toHaveBeenCalledOnce()
    expect(surface.textContent).toContain('Running')
  })

  it('polls runtime status and puts the provider toggle in the runtime header', async () => {
    const setInterval = vi.spyOn(window, 'setInterval')
    const { capabilities, ollamaRuntime, ollamaSettings } = fakeCapabilities()
    const surface = await renderLocalModels(capabilities)

    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 3000)
    expect(surface.textContent).not.toContain('Enable provider')
    expect(surface.textContent).not.toContain('Refresh')
    expect(surface.querySelector('[data-testid="ollama-provider-settings"]')?.getAttribute('data-dividers'))
      .toBe('false')

    const toggle = surface.querySelector<HTMLButtonElement>(
      '[data-testid="local-models-enable-ollama"]',
    )
    if (toggle === null) throw new Error('provider toggle was not rendered')
    expect(toggle.textContent).toBe('')
    expect(toggle.getAttribute('aria-label')).toBe('Disable provider')
    expect(toggle.closest('.settings__item-actions')).not.toBeNull()

    await act(async () => toggle.click())

    expect(ollamaSettings.update).toHaveBeenCalledWith({ local_enabled: false })
    expect(toggle.textContent).toBe('')
    expect(toggle.getAttribute('aria-label')).toBe('Enable provider')
    expect(surface.textContent).toContain('Disabled · Installed, not running · Ollama')

    const pollingCall = setInterval.mock.calls.find(([, delay]) => delay === 3000)
    const poll = pollingCall?.[0]
    if (typeof poll !== 'function') throw new Error('runtime polling was not scheduled')
    await act(async () => {
      poll()
      await Promise.resolve()
    })

    expect(ollamaRuntime.status).toHaveBeenCalledTimes(2)
  })

  it('mirrors provider status and controls for Maximal', async () => {
    const { capabilities } = fakeCapabilities()
    const surface = await renderLocalModels(capabilities)
    const toggle = surface.querySelector<HTMLButtonElement>(
      '[data-testid="local-models-enable-maximal"]',
    )
    if (toggle === null) throw new Error('Maximal provider toggle was not rendered')

    expect(surface.textContent).toContain('Enabled · Running · Maximal')
    expect(surface.textContent).toContain(MAXIMAL_ENDPOINT)
    expect(surface.textContent).toContain('Maximal llama.cpp runtime')
    expect(surface.textContent).toContain('32,768')

    act(() => toggle.click())

    expect(toggle.getAttribute('aria-label')).toBe('Enable provider')
    expect(surface.textContent).toContain('Disabled · Running · Maximal')
    expect(button(surface, 'Download').disabled).toBe(true)
  })

  it('uses the shared left-aligned action row below runtime details', async () => {
    const { capabilities } = fakeCapabilities()
    const surface = await renderLocalModels(capabilities)
    const actions = surface.querySelector('[data-testid="ollama-provider-actions"]')

    expect(actions?.classList.contains('settings__actions-row')).toBe(true)
    expect(actions?.textContent).toContain('Edit account…')
    expect(actions?.textContent).toContain('Open Ollama')
    expect(actions?.textContent).not.toContain('Actions')
    expect(actions?.querySelector('.settings__item-actions')).toBeNull()
  })

  it('uses stepped context lengths and saves the selected value', async () => {
    const { capabilities, ollamaRuntime } = fakeCapabilities()
    const surface = await renderLocalModels(capabilities)
    const slider = surface.querySelector<HTMLElement>(
      '[role="slider"]',
    )
    if (slider === null) throw new Error('context length slider was not rendered')

    expect(slider.getAttribute('aria-valuemin')).toBe('0')
    expect(slider.getAttribute('aria-valuemax')).toBe('6')
    expect(slider.getAttribute('aria-valuenow')).toBe('0')
    expect(slider.getAttribute('aria-valuetext')).toBe('4k')
    const marks = [...surface.querySelectorAll<HTMLElement>('.slider__mark')]
    const labels = [...surface.querySelectorAll<HTMLElement>('.slider__label')]
    expect(labels.map((label) => label.textContent)).toEqual([
      '4k',
      '8k',
      '16k',
      '32k',
      '64k',
      '128k',
      '256k',
    ])
    expect(marks.map((mark) => mark.style.left)).toEqual(
      labels.map((label) => label.style.left),
    )
    expect(marks.map((mark) => mark.hidden)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      false,
    ])
    expect(surface.querySelector('input[type="number"]')).toBeNull()

    await act(async () => {
      slider.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        bubbles: true,
      }))
      await Promise.resolve()
    })

    expect(ollamaRuntime.updateContextLength).toHaveBeenCalledWith(8_192)
    expect(slider.getAttribute('aria-valuetext')).toBe('8k')
    expect(marks.map((mark) => mark.hidden)).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
      false,
    ])
  })
})

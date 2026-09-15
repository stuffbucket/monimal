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

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

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
  const ollamaRuntime = {
    status: vi.fn(async () => ({
      installation: 'application' as const,
      installed: true,
      running: false,
      can_launch: true,
      can_manage: true,
      application_path: '/Applications/Ollama.app',
      server_configuration_path: '/Users/test/.ollama/server.json',
      desktop_settings_path: '/Users/test/Ollama/db.sqlite',
      endpoint: 'http://127.0.0.1:11434',
      context_length: 4096,
    })),
    launch: vi.fn(async () => ({
      installation: 'application' as const,
      installed: true,
      running: true,
      can_launch: true,
      can_manage: true,
      application_path: '/Applications/Ollama.app',
      server_configuration_path: '/Users/test/.ollama/server.json',
      desktop_settings_path: '/Users/test/Ollama/db.sqlite',
      endpoint: 'http://127.0.0.1:11434',
      context_length: 4096,
    })),
    updateContextLength: vi.fn(),
  }
  return {
    capabilities: {
      localModels,
      ollamaRuntime,
      ollamaSettings: {
        get: vi.fn(async () => ({
          has_api_key: false,
          credential_source: 'none' as const,
          local_enabled: true,
          prefer_local_models: true,
        })),
        update: vi.fn(),
      },
    } as unknown as SettingsCapabilities,
    emit: (event: LocalModelOperationEvent) => listener(event),
    localModels,
    ollamaRuntime,
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
    expect(surface.textContent).toContain('GGUF')
    expect(surface.textContent).toContain('registered')
    expect(surface.textContent).toContain('Published by its configured provider')
    expect(surface.textContent).toContain('Installed, not running')
    expect(surface.textContent).toContain('Models hosted by Maximal')
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

  it('opens an installed Ollama desktop app and refreshes its process status', async () => {
    const { capabilities, ollamaRuntime } = fakeCapabilities()
    const surface = await renderLocalModels(capabilities)

    await act(async () => button(surface, 'Open Ollama').click())

    expect(ollamaRuntime.launch).toHaveBeenCalledOnce()
    expect(surface.textContent).toContain('Running')
  })
})

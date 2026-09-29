import * as Tooltip from '@radix-ui/react-tooltip'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { OllamaRuntimeStatus, SettingsCapabilities } from './capabilities'
import { SettingsNavigationProvider } from './navigation'
import { OllamaAccountsSection } from './OllamaAccountsSection'
import type { SettingsSectionId } from '../../shared/settings-sections'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const settings = {
  has_api_key: false,
  cloud_enabled: true,
  api_key: null,
  credential_source: 'none' as const,
  local_enabled: true,
  local_endpoint: window.location.origin,
  prefer_local_models: true,
}

function endpointAtPort(port: number): string {
  const endpoint = new URL(settings.local_endpoint)
  endpoint.port = String(port)
  return endpoint.href.replace(/\/$/u, '')
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
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function fakeCapabilities(options?: {
  configured?: boolean
  update?: ReturnType<typeof vi.fn>
  testApiKey?: ReturnType<typeof vi.fn>
  installed?: boolean
  running?: boolean
  suggestedEndpoint?: string | null
  processId?: number | null
  cloudAvailable?: boolean
  cloudErrorCode?: string
}) {
  const savedApiKey = 'saved-ollama-key'
  const current = {
    ...settings,
    has_api_key: options?.configured ?? false,
    cloud_enabled: true,
    api_key: options?.configured ? savedApiKey : null,
    credential_source: options?.configured ? 'file' as const : 'none' as const,
  }
  const update = options?.update
    ?? vi.fn(async (input: { api_key?: string; cloud_enabled?: boolean }) => ({
      ...settings,
      has_api_key: Boolean(input.api_key),
      cloud_enabled: input.cloud_enabled ?? current.cloud_enabled,
      api_key: input.api_key || null,
      credential_source: input.api_key ? 'file' as const : 'none' as const,
    }))
  const runtimeStatus = async (
    endpoint = settings.local_endpoint,
  ): Promise<OllamaRuntimeStatus> => ({
    installation: options?.installed === false ? 'none' as const : 'application' as const,
    installed: options?.installed !== false,
    running: options?.running ?? true,
    can_launch: options?.installed !== false,
    can_manage: options?.installed !== false,
    application_path:
      options?.installed === false ? null : '/Applications/Ollama.app',
    server_configuration_path: '/Users/test/.ollama/server.json',
    desktop_settings_path:
      options?.installed === false ? null : '/Users/test/Ollama/db.sqlite',
    endpoint,
    process_id: options?.processId ?? (options?.running === false ? null : 42),
    process_endpoint: options?.running === false ? null : endpoint,
    suggested_endpoint: options?.suggestedEndpoint ?? null,
    context_length: options?.installed === false ? null : 4096,
  })
  const status = vi.fn(runtimeStatus)
  const list = vi.fn(async () => ({
    accounts: options?.cloudAvailable || options?.cloudErrorCode
      ? [{
          type: 'ollama' as const,
          provider: 'ollama-cloud',
          endpoint: 'https://ollama.com',
          scope: 'remote' as const,
          account_state: 'authenticated' as const,
          availability: options?.cloudAvailable
            ? 'available' as const
            : 'unavailable' as const,
          model_count: options?.cloudAvailable ? 1 : null,
          error_code: options?.cloudErrorCode ?? null,
        }]
      : [],
  }))
  return {
    update,
    status,
    list,
    capabilities: {
      ollamaAccounts: {
        list,
      },
      ollamaSettings: {
        get: vi.fn(async () => current),
        update,
        testApiKey: options?.testApiKey ?? vi.fn(async () => ({
          status: 'valid' as const,
          message: 'Ollama accepted this API key.',
        })),
      },
      ollamaRuntime: {
        status,
        launch: vi.fn(async (
          endpoint: string = settings.local_endpoint,
        ) => ({
          ...(await runtimeStatus(endpoint)),
          running: true,
          process_id: 42,
          process_endpoint: endpoint,
          suggested_endpoint: null,
        })),
        preferences: vi.fn(async () => ({
          start_on_maximal_launch: false,
          cloud_disabled: false,
          restart_required: false,
        })),
        updatePreferences: vi.fn(async (
          input: Parameters<
            SettingsCapabilities['ollamaRuntime']['updatePreferences']
          >[0],
        ) => ({
          start_on_maximal_launch: input.start_on_maximal_launch ?? false,
          cloud_disabled: input.cloud_disabled ?? false,
          restart_required: false,
        })),
      },
      openExternal: vi.fn(),
    } as unknown as SettingsCapabilities,
  }
}

async function renderSection(
  capabilities: SettingsCapabilities,
  navigate: (sectionId: SettingsSectionId) => void = () => undefined,
): Promise<HTMLElement> {
  if (root === null || container === null) throw new Error('test root not ready')
  await act(async () => {
    root?.render(
      <Tooltip.Provider>
        <SettingsNavigationProvider value={navigate}>
          <OllamaAccountsSection capabilities={capabilities} />
        </SettingsNavigationProvider>
      </Tooltip.Provider>,
    )
  })
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  return container
}

function enter(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function button(surface: HTMLElement, label: string): HTMLButtonElement {
  const match = [...surface.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent === label,
  )
  if (match === undefined) throw new Error(`${label} button was not rendered`)
  return match
}

describe('OllamaAccountsSection API key validation', () => {
  it('renders a disabled primary save action beside the empty API key input', async () => {
    const { capabilities } = fakeCapabilities()
    const surface = await renderSection(capabilities)
    const input = surface.querySelector<HTMLInputElement>(
      '[data-testid="ollama-api-key"]',
    )
    const save = [...surface.querySelectorAll('button')].find(
      (button) => button.textContent === 'Save API Key',
    )

    expect(input?.closest('.settings-credential-field')).not.toBeNull()
    expect(input?.placeholder).toBe(
      'Enter an API key for direct Ollama Cloud access.',
    )
    expect(save?.closest('.settings-credential-field')).toBe(
      input?.closest('.settings-credential-field'),
    )
    expect(save?.classList.contains('btn--primary')).toBe(true)
    expect(save?.disabled).toBe(true)
    expect(surface.querySelector('.settings-credential-field .avatar')).toBeNull()
  })

  it('loads the saved key obscured and allows it to be revealed', async () => {
    const { capabilities } = fakeCapabilities({ configured: true })
    const surface = await renderSection(capabilities)
    const input = surface.querySelector<HTMLInputElement>(
      '[data-testid="ollama-api-key"]',
    )

    expect(input?.value).toBe('saved-ollama-key')
    expect(input?.type).toBe('password')
    expect(button(surface, 'Save API Key').disabled).toBe(true)

    const show = surface.querySelector<HTMLButtonElement>(
      '[aria-label="Show Ollama API key"]',
    )
    if (show === null) throw new Error('show API key action was not rendered')
    act(() => show.click())
    expect(input?.type).toBe('text')
    expect(input?.value).toBe('saved-ollama-key')

    const hide = surface.querySelector<HTMLButtonElement>(
      '[aria-label="Hide Ollama API key"]',
    )
    if (hide === null) throw new Error('hide API key action was not rendered')
    act(() => hide.click())
    expect(input?.type).toBe('password')
  })

  it('rehydrates the saved key after the section is left and reopened', async () => {
    const { capabilities } = fakeCapabilities({ configured: true })
    const surface = await renderSection(capabilities)

    await act(async () => {
      root?.render(<div data-testid="another-settings-section" />)
    })
    await renderSection(capabilities)

    const input = surface.querySelector<HTMLInputElement>(
      '[data-testid="ollama-api-key"]',
    )
    expect(capabilities.ollamaSettings.get).toHaveBeenCalledTimes(2)
    expect(input?.value).toBe('saved-ollama-key')
    expect(input?.type).toBe('password')
  })

  it('reports a saved working API key below the control', async () => {
    const { capabilities } = fakeCapabilities({
      configured: true,
      cloudAvailable: true,
    })
    const surface = await renderSection(capabilities)

    expect(surface.textContent).toContain('API key is saved and working.')
  })

  it('reports the validation error code for a saved API key', async () => {
    const { capabilities } = fakeCapabilities({
      configured: true,
      cloudErrorCode: 'HTTP 503',
    })
    const surface = await renderSection(capabilities)

    expect(surface.textContent).toContain(
      'API key is saved, but Ollama Cloud returned HTTP 503.',
    )
  })

  it('checks a saved key once on entry and only again when requested', async () => {
    const { capabilities, list } = fakeCapabilities({
      configured: true,
      cloudErrorCode: 'UNKNOWN',
    })
    const surface = await renderSection(capabilities)

    expect(list).toHaveBeenCalledOnce()
    expect(surface.textContent).toContain(
      'API key is saved, but Ollama Cloud could not be checked because no error code was returned.',
    )
    await act(async () => button(surface, 'Check key').click())

    expect(list).toHaveBeenCalledTimes(2)
  })

  it('polls the local runtime without repeatedly checking Ollama Cloud', async () => {
    vi.useFakeTimers()
    try {
      const { capabilities, list, status } = fakeCapabilities({
        configured: true,
        cloudAvailable: true,
      })
      await renderSection(capabilities)

      expect(list).toHaveBeenCalledOnce()
      expect(status).toHaveBeenCalledOnce()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000)
      })

      expect(status).toHaveBeenCalledTimes(4)
      expect(list).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows direct and local Ollama controls and links related settings', async () => {
    const { capabilities } = fakeCapabilities()
    const navigate = vi.fn()
    const surface = await renderSection(capabilities, navigate)

    expect(surface.textContent).toContain('Direct Cloud API key')
    expect(surface.textContent).toContain('Local Application')
    expect(surface.textContent).toContain('Ollama starts when Maximal starts')
    expect(surface.textContent).toContain(
      'Access Ollama Cloud via the local Ollama application',
    )
    expect(
      surface.querySelector('[data-testid="ollama-disable-cloud"]')
        ?.getAttribute('aria-checked'),
    ).toBe('true')
    expect(surface.querySelectorAll('input[type="password"]')).toHaveLength(1)
    expect(
      surface.querySelector('[data-testid="ollama-start-on-launch"]')
        ?.closest('.settings__item'),
    ).toBe(
      surface.querySelector('[data-testid="ollama-disable-cloud"]')
        ?.closest('.settings__item'),
    )
    await act(async () => {
      surface.querySelector<HTMLButtonElement>(
        '[data-testid="ollama-disable-cloud"]',
      )?.click()
    })
    expect(capabilities.ollamaRuntime.updatePreferences).toHaveBeenCalledWith({
      cloud_disabled: true,
    })

    const cloudModels = [...surface.querySelectorAll('button')].find(
      (button) => button.textContent === 'Cloud models',
    )
    const search = [...surface.querySelectorAll('button')].find(
      (button) => button.textContent === 'Ollama search providers',
    )
    const localModels = [...surface.querySelectorAll('button')].find(
      (button) => button.textContent === 'Local models',
    )
    const cloudSettings = [...surface.querySelectorAll('button')].find(
      (button) => button.textContent === 'Cloud settings',
    )
    if (!cloudModels || !search || !localModels || !cloudSettings) {
      throw new Error('related settings actions were not rendered')
    }

    act(() => {
      cloudModels.click()
      search.click()
      localModels.click()
      cloudSettings.click()
    })

    expect(navigate.mock.calls).toEqual([
      ['settings-models-heading'],
      ['settings-search-heading'],
      ['settings-local-models-heading'],
    ])
    expect(capabilities.openExternal).toHaveBeenCalledWith(
      expect.stringContaining('disable-ollama-cloud-features'),
    )
  })

  it('does not trigger validation while typing', async () => {
    const { capabilities, update } = fakeCapabilities()
    const surface = await renderSection(capabilities)
    const input = surface.querySelector<HTMLInputElement>(
      '[data-testid="ollama-api-key"]',
    )
    if (input === null) throw new Error('API key input was not rendered')

    act(() => enter(input, 'o'))
    act(() => enter(input, 'ollama-secret-key'))

    expect(update).not.toHaveBeenCalled()
  })

  it('tests and saves an entered API key from the inline action', async () => {
    const { capabilities, update } = fakeCapabilities({ cloudAvailable: true })
    const surface = await renderSection(capabilities)
    const input = surface.querySelector<HTMLInputElement>(
      '[data-testid="ollama-api-key"]',
    )
    if (input === null) throw new Error('API key input was not rendered')

    act(() => enter(input, 'ollama-secret-key'))
    const save = [...surface.querySelectorAll('button')].find(
      (button) => button.textContent === 'Save API Key',
    )
    if (!save) throw new Error('save button not found')
    expect(save.disabled).toBe(false)

    await act(async () => {
      save.click()
      await Promise.resolve()
    })

    expect(capabilities.ollamaSettings.testApiKey).toHaveBeenCalledWith({
      api_key: 'ollama-secret-key',
    })
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith({ api_key: 'ollama-secret-key' })
    expect(surface.textContent).toContain('API key is saved and working.')
    expect(save.disabled).toBe(true)
  })

  it('does not save an API key rejected by Ollama', async () => {
    const testApiKey = vi.fn(async () => ({
      status: 'invalid' as const,
      message: 'Ollama rejected this API key.',
    }))
    const { capabilities, update } = fakeCapabilities({ testApiKey })
    const surface = await renderSection(capabilities)
    const input = surface.querySelector<HTMLInputElement>(
      '[data-testid="ollama-api-key"]',
    )
    if (input === null) throw new Error('API key input was not rendered')

    act(() => enter(input, 'ollama-secret-key'))
    const save = [...surface.querySelectorAll('button')].find(
      (button) => button.textContent === 'Save API Key',
    )
    if (!save) throw new Error('save button not found')

    await act(async () => {
      save.click()
      await Promise.resolve()
    })

    expect(testApiKey).toHaveBeenCalledTimes(1)
    expect(update).not.toHaveBeenCalled()
    expect(surface.textContent).toContain('Ollama rejected this API key.')
    expect(save.disabled).toBe(true)
  })

  it('rejects keys that are too short before making network calls', async () => {
    const { capabilities, update } = fakeCapabilities()
    const surface = await renderSection(capabilities)
    const input = surface.querySelector<HTMLInputElement>(
      '[data-testid="ollama-api-key"]',
    )
    if (input === null) throw new Error('API key input was not rendered')

    act(() => enter(input, 'short'))
    const save = [...surface.querySelectorAll('button')].find(
      (button) => button.textContent === 'Save API Key',
    )
    if (!save) throw new Error('save button not found')

    await act(async () => {
      save.click()
      await Promise.resolve()
    })

    expect(capabilities.ollamaSettings.testApiKey).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(surface.textContent).toContain('API key is too short to be valid.')
    expect(save.disabled).toBe(true)
  })

  it('surfaces a save failure once without repeating', async () => {
    const update = vi.fn(async () => {
      throw new Error('Ollama rejected this API key.')
    })
    const { capabilities } = fakeCapabilities({ update })
    const surface = await renderSection(capabilities)
    const input = surface.querySelector<HTMLInputElement>(
      '[data-testid="ollama-api-key"]',
    )
    if (input === null) throw new Error('API key input was not rendered')

    act(() => enter(input, 'invalid-ollama-key'))
    const save = [...surface.querySelectorAll('button')].find(
      (button) => button.textContent === 'Save API Key',
    )
    if (!save) throw new Error('save button not found')

    await act(async () => {
      save.click()
      await Promise.resolve()
    })

    expect(update).toHaveBeenCalledTimes(1)
    expect(surface.textContent).toContain('Ollama rejected this API key.')
    expect(save.disabled).toBe(true)
  })

  it('marks working cloud and local inputs as active', async () => {
    const { capabilities } = fakeCapabilities({
      configured: true,
      cloudAvailable: true,
      running: true,
    })

    const surface = await renderSection(capabilities)

    expect(
      surface.querySelector('[data-testid="ollama-api-key"]')
        ?.getAttribute('data-active'),
    ).toBe('true')
    expect(
      surface.querySelector('[data-testid="ollama-endpoint"]')
        ?.getAttribute('data-active'),
    ).toBe('true')
  })

  it('keeps the local description static and reports status below the input', async () => {
    const { capabilities } = fakeCapabilities({ running: true })
    const surface = await renderSection(capabilities)
    const input = surface.querySelector<HTMLInputElement>(
      '[data-testid="ollama-endpoint"]',
    )
    const item = input?.closest('.settings__item')

    expect(item?.querySelector('.settings__item-description')?.textContent).toBe(
      'Connect to an Ollama application running on this computer or another host.',
    )
    expect(input?.closest('.form-field')?.textContent).toContain(
      'Ollama is available.',
    )
  })

  it('saves an alternate Ollama location and restores the default when cleared', async () => {
    const alternateEndpoint = endpointAtPort(11500)
    const update = vi.fn(async (input: {
      local_endpoint?: string
    }) => ({
      ...settings,
      local_endpoint: input.local_endpoint || settings.local_endpoint,
    }))
    const { capabilities, status } = fakeCapabilities({ update })
    const surface = await renderSection(capabilities)
    const input = surface.querySelector<HTMLInputElement>(
      '[data-testid="ollama-endpoint"]',
    )
    if (input === null) throw new Error('endpoint input was not rendered')

    act(() => enter(input, alternateEndpoint))
    await act(async () => {
      button(surface, 'Save location').click()
      await Promise.resolve()
    })
    expect(update).toHaveBeenLastCalledWith({
      local_endpoint: alternateEndpoint,
    })
    expect(status).toHaveBeenLastCalledWith(alternateEndpoint)

    act(() => enter(input, ''))
    await act(async () => {
      button(surface, 'Save location').click()
      await Promise.resolve()
    })
    expect(update).toHaveBeenLastCalledWith({
      local_endpoint: '',
    })
  })

  it('offers to use the responding port discovered from the Ollama PID', async () => {
    const detectedEndpoint = endpointAtPort(11501)
    const update = vi.fn(async (input: {
      local_endpoint?: string
    }) => ({
      ...settings,
      local_endpoint: input.local_endpoint || settings.local_endpoint,
    }))
    const { capabilities } = fakeCapabilities({
      update,
      running: false,
      processId: 4242,
      suggestedEndpoint: detectedEndpoint,
    })
    await renderSection(capabilities)
    const dialog = document.querySelector(
      '[data-testid="ollama-endpoint-suggestion-dialog"]',
    )

    expect(dialog?.textContent).toContain('Ollama process 4242')
    const useDetected = [...(dialog?.querySelectorAll('button') ?? [])].find(
      (candidate) => candidate.textContent === 'Use detected port',
    )
    if (!useDetected) throw new Error('detected-port action was not rendered')
    await act(async () => {
      useDetected.click()
      await Promise.resolve()
    })
    expect(update).toHaveBeenCalledWith({
      local_endpoint: detectedEndpoint,
    })
  })

  it('offers to start an installed stopped Ollama app when auto-start is enabled', async () => {
    const { capabilities } = fakeCapabilities({
      installed: true,
      running: false,
      processId: null,
    })
    const surface = await renderSection(capabilities)
    const toggle = surface.querySelector<HTMLElement>(
      '[data-testid="ollama-start-on-launch"]',
    )
    if (toggle === null) throw new Error('auto-start toggle was not rendered')

    await act(async () => {
      toggle.click()
      await Promise.resolve()
    })
    const dialog = document.querySelector('[data-testid="ollama-start-dialog"]')
    expect(dialog).not.toBeNull()

    const start = [...(dialog?.querySelectorAll('button') ?? [])].find(
      (candidate) => candidate.textContent === 'Start Ollama',
    )
    if (!start) throw new Error('start action was not rendered')
    await act(async () => {
      start.click()
      await Promise.resolve()
    })
    expect(capabilities.ollamaRuntime.launch).toHaveBeenCalledWith(
      settings.local_endpoint,
    )
  })

  it('offers to start an installed stopped Ollama app from the header', async () => {
    const { capabilities } = fakeCapabilities({
      installed: true,
      running: false,
      processId: null,
    })
    const surface = await renderSection(capabilities)

    await act(async () => {
      button(surface, 'Start Ollama').click()
      await Promise.resolve()
    })

    expect(capabilities.ollamaRuntime.launch).toHaveBeenCalledWith(
      settings.local_endpoint,
    )
  })

  it('offers the Ollama download when no installation is detected', async () => {
    const { capabilities } = fakeCapabilities({ installed: false, running: false })
    const surface = await renderSection(capabilities)

    await act(async () => {
      button(surface, 'Get Ollama').click()
      await Promise.resolve()
    })
    expect(capabilities.openExternal).toHaveBeenCalledWith(
      'https://ollama.com/download',
    )
  })

  it('places Local models in the Local Application footer', async () => {
    const { capabilities } = fakeCapabilities({ installed: true, running: true })
    const surface = await renderSection(capabilities)
    const localModels = button(surface, 'Local models')

    expect(localModels.closest('.settings__item-actions')).toBeNull()
    expect(localModels.closest('.settings__actions-row')).not.toBeNull()
  })

  it('removes a configured key only through an explicit action', async () => {
    const { capabilities, update } = fakeCapabilities({ configured: true })
    const surface = await renderSection(capabilities)
    const remove = [...surface.querySelectorAll('button')].find(
      (button) => button.textContent === 'Remove saved key',
    )
    if (remove === undefined) throw new Error('remove action was not rendered')

    await act(async () => {
      remove.click()
      await Promise.resolve()
    })

    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith({ api_key: '' })
  })
})

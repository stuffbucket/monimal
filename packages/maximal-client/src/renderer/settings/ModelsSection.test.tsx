import * as Tooltip from '@radix-ui/react-tooltip'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SettingsSectionId } from '../../shared/settings-sections'
import type {
  ModelsListResponse,
  OllamaAccountsListResponse,
  SettingsCapabilities,
} from './capabilities'
import { ModelsSection } from './ModelsSection'
import { SettingsNavigationProvider } from './navigation'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const catalogue: ModelsListResponse = {
  models: [
    {
      id: 'claude-opus-5',
      name: 'Claude Opus 5',
      vendor: 'Anthropic',
      provider: 'anthropic',
      location: 'cloud',
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
      id: 'gpt-5',
      name: 'GPT-5',
      vendor: 'GitHub Copilot',
      provider: 'github-copilot',
      location: 'cloud',
      family: 'gpt',
      type: 'chat',
      preview: false,
      context_window_tokens: 128_000,
      max_output_tokens: 32_000,
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
      provider: 'ollama-cloud',
      location: 'cloud',
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

function fakeCapabilities(
  list: () => Promise<ModelsListResponse>,
  options: {
    githubAvailable?: boolean
    ollamaHasApiKey?: boolean
    localOllamaAvailable?: boolean
  } = {},
) {
  let githubEnabled = true
  let ollamaCloudEnabled = true
  let ollamaCloudDisabled = false
  const githubAvailable = options.githubAvailable ?? true
  const ollamaHasApiKey = options.ollamaHasApiKey ?? true
  const models = {
    list: vi.fn(list),
    refresh: vi.fn(async () => catalogue),
  }
  const accounts = {
    list: vi.fn(async () => ({
      accounts: githubAvailable
        ? [{
            key: 'octocat@github.com',
            login: 'octocat',
            host: 'github.com',
            added_via: 'device-code' as const,
            obtained_at: new Date(0).toISOString(),
            active: true,
            enabled: githubEnabled,
          }]
        : [],
      active_key: githubAvailable && githubEnabled
        ? 'octocat@github.com'
        : null,
    })),
    switchTo: vi.fn(async () => {}),
    setEnabled: vi.fn(async (_key: string, enabled: boolean) => {
      githubEnabled = enabled
    }),
    reorder: vi.fn(async () => {}),
  }
  const ollamaSettings = {
    get: vi.fn(async () => ({
      has_api_key: ollamaHasApiKey,
      api_key: ollamaHasApiKey ? 'saved-ollama-key' : null,
      credential_source: ollamaHasApiKey ? 'file' as const : null,
      cloud_enabled: ollamaCloudEnabled,
      local_enabled: true,
      local_endpoint: 'data:,ollama',
      prefer_local_models: true,
    })),
    update: vi.fn(async (input: { cloud_enabled?: boolean }) => {
      ollamaCloudEnabled = input.cloud_enabled ?? ollamaCloudEnabled
      return await ollamaSettings.get()
    }),
  }
  const ollamaRuntime = {
    preferences: vi.fn(async () => ({
      start_on_maximal_launch: false,
      cloud_disabled: ollamaCloudDisabled,
      restart_required: false,
    })),
    updatePreferences: vi.fn(async (input: { cloud_disabled?: boolean }) => {
      ollamaCloudDisabled = input.cloud_disabled ?? ollamaCloudDisabled
      return await ollamaRuntime.preferences()
    }),
  }
  return {
    capabilities: {
      models,
      accounts,
      subscribe: vi.fn(() => () => {}),
      ollamaAccounts: {
        list: vi.fn(async () => ({
          accounts: options.localOllamaAvailable
            ? [{
                type: 'ollama' as const,
                provider: 'ollama',
                endpoint: 'data:,ollama',
                scope: window.location.hostname as
                  OllamaAccountsListResponse['accounts'][number]['scope'],
                account_state: 'authenticated' as const,
                availability: 'available' as const,
                model_count: 1,
                error_code: null,
              }]
            : [],
        })),
      },
      ollamaSettings,
      ollamaRuntime,
    } as unknown as SettingsCapabilities,
    models,
    accounts,
    ollamaSettings,
    ollamaRuntime,
  }
}

async function renderModels(
  capabilities: SettingsCapabilities,
  navigate: (sectionId: SettingsSectionId) => void = () => undefined,
): Promise<HTMLElement> {
  if (root === null || container === null) throw new Error('test root not ready')
  await act(async () => {
    root?.render(
      <SettingsNavigationProvider value={navigate}>
        <Tooltip.Provider delayDuration={0}>
          <ModelsSection capabilities={capabilities} />
        </Tooltip.Provider>
      </SettingsNavigationProvider>,
    )
    await Promise.resolve()
  })
  return container
}

describe('ModelsSection', () => {
  it('renders the shared model-card grid grouped by model type', async () => {
    const { capabilities } = fakeCapabilities(async () => catalogue)
    const surface = await renderModels(capabilities)

    expect(surface.querySelector('h2')?.textContent).toBe('Cloud providers')
    expect([...surface.querySelectorAll('.settings__section-title')].map(
      (heading) => heading.textContent,
    )).toEqual(['Cloud providers', 'Chat models (2)', 'Image models (1)'])
    expect(surface.querySelectorAll('.model-card')).toHaveLength(3)
    expect(surface.textContent).toContain('Claude Opus 5')
    expect(surface.textContent).toContain('claude-opus-5')
    expect(surface.textContent).toContain('1.0M')
    expect(surface.textContent).toContain('Tools')
    expect(surface.textContent).toContain('Image generation')
    const anthropic = surface.querySelector('[data-testid="model-provider-anthropic"]')
    const github = surface.querySelector('[data-testid="model-provider-github-copilot"]')
    const ollama = surface.querySelector('[data-testid="model-provider-ollama"]')
    expect(anthropic?.querySelector('[data-testid="service-icon-anthropic"]')).not.toBeNull()
    expect(github?.querySelector('[data-testid="service-icon-github"]')).not.toBeNull()
    expect(ollama?.querySelector('[data-testid="service-icon-ollama"]')).not.toBeNull()
    expect(surface.querySelectorAll('[data-testid="service-icon-ollama"]')).toHaveLength(2)
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
    const refreshed = { ...catalogue, models: [catalogue.models[2]], count: 1 }
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

  it('keeps disabled provider models visible and offers to enable access', async () => {
    const { capabilities, accounts } = fakeCapabilities(async () => catalogue)
    const surface = await renderModels(capabilities)
    const toggle = surface.querySelector<HTMLButtonElement>(
      '[data-testid="cloud-provider-github-copilot"]',
    )
    if (toggle === null) throw new Error('GitHub Copilot toggle was not rendered')

    await act(async () => toggle.click())

    const model = surface.querySelector<HTMLElement>('[data-testid="model-gpt-5"]')
    expect(model?.dataset.disabled).toBe('true')
    await act(async () => model?.click())
    expect(document.body.textContent).toContain('Enable GitHub Copilot?')

    const enable = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Enable provider',
    )
    if (enable === undefined) throw new Error('Enable provider action was not rendered')
    await act(async () => enable.click())

    expect(accounts.setEnabled).toHaveBeenLastCalledWith(
      'octocat@github.com',
      true,
    )
    expect(accounts.switchTo).toHaveBeenCalledWith('octocat@github.com')
    expect(model?.dataset.disabled).toBeUndefined()
  })

  it('toggles direct Ollama Cloud access with an icon-only switch', async () => {
    const { capabilities, ollamaSettings, ollamaRuntime } =
      fakeCapabilities(async () => catalogue)
    const surface = await renderModels(capabilities)
    const toggle = surface.querySelector<HTMLButtonElement>(
      '[data-testid="cloud-provider-ollama"]',
    )
    if (toggle === null) throw new Error('Ollama Cloud toggle was not rendered')

    expect(toggle.textContent).toBe('')
    expect(toggle.getAttribute('aria-label')).toBe('Disable Ollama Cloud')
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    await act(async () => toggle.click())

    expect(ollamaSettings.update).toHaveBeenCalledWith({ cloud_enabled: false })
    expect(ollamaRuntime.updatePreferences).not.toHaveBeenCalled()
    expect(toggle.getAttribute('aria-label')).toBe('Enable Ollama Cloud')
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(surface.textContent).toContain('Disabled · API key')
  })

  it('toggles the local Ollama Cloud path with the inverse runtime preference', async () => {
    const localCloudCatalogue = {
      ...catalogue,
      models: catalogue.models.map((model) =>
        model.id === 'image-model'
          ? { ...model, provider: 'ollama' }
          : model,
      ),
    }
    const { capabilities, ollamaSettings, ollamaRuntime } = fakeCapabilities(
      async () => localCloudCatalogue,
      { localOllamaAvailable: true, ollamaHasApiKey: false },
    )
    const surface = await renderModels(capabilities)
    const toggle = surface.querySelector<HTMLButtonElement>(
      '[data-testid="cloud-provider-ollama"]',
    )
    if (toggle === null) throw new Error('Ollama Cloud toggle was not rendered')

    expect(toggle.getAttribute('aria-label')).toBe('Disable Ollama Cloud')
    expect(surface.textContent).toContain('Enabled · Local Ollama application')
    await act(async () => toggle.click())

    expect(ollamaRuntime.updatePreferences).toHaveBeenCalledWith({
      cloud_disabled: true,
    })
    expect(ollamaSettings.update).not.toHaveBeenCalled()
    expect(toggle.getAttribute('aria-label')).toBe('Enable Ollama Cloud')
    expect(surface.textContent).toContain('Disabled · Local Ollama application')
  })

  it('does not offer Ollama Cloud for an app with only local models', async () => {
    const localOnlyCatalogue = {
      ...catalogue,
      models: catalogue.models.map((model) =>
        model.id === 'image-model'
          ? { ...model, provider: 'ollama', location: 'local' as const }
          : model,
      ),
    }
    const { capabilities } = fakeCapabilities(
      async () => localOnlyCatalogue,
      { localOllamaAvailable: true, ollamaHasApiKey: false },
    )
    const surface = await renderModels(capabilities)
    const toggle = surface.querySelector<HTMLButtonElement>(
      '[data-testid="cloud-provider-ollama"]',
    )
    if (toggle === null) throw new Error('Ollama Cloud toggle was not rendered')

    expect(toggle.disabled).toBe(false)
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(surface.textContent).toContain(
      'Unavailable · Add an API key or sign in through the Ollama application',
    )
    await act(async () => toggle.click())
    expect(document.body.textContent).toContain('Set up Ollama?')
    expect(document.body.textContent).toContain(
      'Ollama Cloud needs an API key or a signed-in local Ollama application',
    )
  })

  it('offers account setup when an unavailable provider is enabled', async () => {
    const navigate = vi.fn()
    const { capabilities, accounts } = fakeCapabilities(
      async () => catalogue,
      { githubAvailable: false },
    )
    const surface = await renderModels(capabilities, navigate)
    const toggle = surface.querySelector<HTMLButtonElement>(
      '[data-testid="cloud-provider-github-copilot"]',
    )
    if (toggle === null) throw new Error('GitHub Copilot toggle was not rendered')

    expect(toggle.disabled).toBe(false)
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    await act(async () => toggle.click())

    expect(document.body.textContent).toContain('Set up GitHub Copilot?')
    expect(document.body.textContent).toContain(
      'GitHub Copilot needs a signed-in GitHub account',
    )
    const setup = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Go to Accounts',
    )
    if (setup === undefined) throw new Error('Account setup action was not rendered')
    await act(async () => setup.click())

    expect(navigate).toHaveBeenCalledWith('settings-account-heading')
    expect(accounts.setEnabled).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain('Set up GitHub Copilot?')
  })

  it('reuses the last successful catalogue when the page is reopened', async () => {
    const { capabilities, models } = fakeCapabilities(async () => catalogue)
    const surface = await renderModels(capabilities)
    expect(surface.textContent).toContain('Claude Opus 5')

    await act(async () => {
      root?.render(<Tooltip.Provider><div>Another settings page</div></Tooltip.Provider>)
      await Promise.resolve()
    })
    await renderModels(capabilities)

    expect(models.list).toHaveBeenCalledOnce()
    expect(surface.textContent).toContain('Claude Opus 5')
    expect(surface.textContent).not.toContain('Loading model catalogue…')
  })
})

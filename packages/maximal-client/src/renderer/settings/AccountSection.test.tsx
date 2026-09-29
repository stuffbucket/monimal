import * as Tooltip from '@radix-ui/react-tooltip'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthStatus, SettingsCapabilities } from './capabilities'
import { createMaximalQueryClient } from '../query-client'
import { AccountSection, copilotUsageQueryKey } from './AccountSection'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const OLLAMA_ENDPOINT = 'http://127.0.0.1:11434'

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
  let notify = () => {}
  let resolveStart: (status: AuthStatus) => void = () => {}
  const account = {
    status: vi.fn(async (): Promise<AuthStatus> => ({ state: 'unauthenticated' })),
    start: vi.fn(
      () =>
        new Promise<AuthStatus>((resolve) => {
          resolveStart = resolve
        }),
    ),
    cancel: vi.fn(),
    signOut: vi.fn(),
    usage: vi.fn(async () => ({ copilot_plan: 'individual' })),
  }
  const copyText = vi.fn(async () => {})
  const openExternal = vi.fn(async () => {})
  const capabilities = {
    account,
    copyText,
    openExternal,
    accounts: {
      list: vi.fn(async () => ({ accounts: [], active_key: null })),
      switchTo: vi.fn(),
    },
    ollamaAccounts: {
      list: vi.fn(async () => ({
        accounts: [
          {
            type: 'ollama' as const,
            provider: 'ollama',
            endpoint: OLLAMA_ENDPOINT,
            scope: 'localhost' as const,
            account_state: 'unauthenticated' as const,
            availability: 'unavailable' as const,
            model_count: null,
            error_code: 'ECONNREFUSED',
          },
        ],
      })),
    },
    ollamaSettings: {
      get: vi.fn(async () => ({
        has_api_key: false,
        cloud_enabled: true,
        api_key: null,
        credential_source: 'none' as const,
        local_enabled: true,
        local_endpoint: OLLAMA_ENDPOINT,
        prefer_local_models: true,
      })),
      update: vi.fn(),
      testApiKey: vi.fn(),
    },
    ollamaRuntime: {
      status: vi.fn(async (endpoint: string) => ({
        installation: 'application' as const,
        installed: true,
        running: false,
        can_launch: true,
        can_manage: true,
        application_path: '/Applications/Ollama.app',
        server_configuration_path: '/Users/test/.ollama/server.json',
        desktop_settings_path: '/Users/test/Ollama/db.sqlite',
        endpoint,
        process_id: null,
        process_endpoint: null,
        suggested_endpoint: null,
        context_length: 4096,
      })),
      launch: vi.fn(),
      preferences: vi.fn(async () => ({
        start_on_maximal_launch: false,
        cloud_disabled: false,
        restart_required: false,
      })),
      updatePreferences: vi.fn(),
    },
    subscribe: vi.fn((listener: () => void) => {
      notify = listener
      return () => {}
    }),
  } as unknown as SettingsCapabilities

  return {
    account,
    capabilities,
    copyText,
    notify: () => notify(),
    openExternal,
    resolveStart: (status: AuthStatus) => resolveStart(status),
  }
}

async function renderAccount(
  capabilities: SettingsCapabilities,
  queryClient: QueryClient = createMaximalQueryClient(),
): Promise<HTMLElement> {
  if (root === null || container === null) throw new Error('test root not ready')
  await act(async () => {
    root?.render(
      <QueryClientProvider client={queryClient}>
        <Tooltip.Provider>
          <AccountSection capabilities={capabilities} />
        </Tooltip.Provider>
      </QueryClientProvider>,
    )
    await Promise.resolve()
  })
  return container
}

describe('AccountSection refresh ownership', () => {
  it('renders stale account-keyed query data while refreshing it', async () => {
    const { account, capabilities } = fakeCapabilities()
    const activeKey = 'octocat@github.com'
    account.status.mockResolvedValue({
      state: 'authenticated',
      account_login: 'octocat',
      account_type: 'individual',
    })
    capabilities.accounts.list = vi.fn(async () => ({
      accounts: [
        {
          key: activeKey,
          login: 'octocat',
          host: 'github.com',
          added_via: 'device-code' as const,
          obtained_at: '2026-09-29T12:00:00.000Z',
          active: true,
          enabled: true,
        },
      ],
      active_key: activeKey,
    }))
    let resolveUsage: (value: {
      copilot_plan: string
      quota_snapshots: {
        premium_interactions: { percent_remaining: number }
      }
    }) => void = () => {}
    account.usage.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUsage = resolve
        }),
    )
    const queryClient = createMaximalQueryClient()
    queryClient.setQueryData(
      copilotUsageQueryKey(activeKey),
      {
        copilot_plan: 'enterprise',
        quota_snapshots: {
          premium_interactions: { percent_remaining: 63 },
        },
      },
      { updatedAt: Date.now() - 6 * 60_000 },
    )

    const surface = await renderAccount(capabilities, queryClient)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(surface.textContent).toContain('Enterprise')
    expect(surface.textContent).toContain('37% used')

    await act(async () => {
      resolveUsage({
        copilot_plan: 'enterprise',
        quota_snapshots: {
          premium_interactions: { percent_remaining: 50 },
        },
      })
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(surface.textContent).toContain('50% used')
    expect(queryClient.getQueryData(copilotUsageQueryKey(activeKey))).toEqual({
      copilot_plan: 'enterprise',
      quota_snapshots: {
        premium_interactions: { percent_remaining: 50 },
      },
    })
  })

  it('ignores capability refreshes while an account action is in flight', async () => {
    const { account, capabilities, notify, resolveStart } = fakeCapabilities()
    const surface = await renderAccount(capabilities)
    const signIn = [...surface.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === 'Sign in with GitHub',
    )
    if (signIn === undefined) throw new Error('sign-in button was not rendered')

    act(() => signIn.click())
    await act(async () => {
      notify()
      await Promise.resolve()
    })

    expect(account.status).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveStart({ state: 'unauthenticated' })
      await Promise.resolve()
    })
    await act(async () => {
      notify()
      await Promise.resolve()
    })

    expect(account.status).toHaveBeenCalledTimes(2)
  })

  it('shows unauthenticated localhost Ollama when no account is set', async () => {
    const { capabilities } = fakeCapabilities()
    const surface = await renderAccount(capabilities)

    expect(surface.textContent).toContain('Ollama')
    expect(surface.textContent).toContain('Ollama is not responding.')
    expect([...surface.querySelectorAll('h2')].map((heading) => heading.textContent)).toEqual([
      'GitHub Copilot',
      'Ollama',
    ])
    expect(surface.querySelector('h3')?.textContent).toBe('Saved accounts')
  })

  it('opens GitHub automatically after receiving a device code', async () => {
    const {
      capabilities,
      copyText,
      openExternal,
      resolveStart,
    } = fakeCapabilities()
    const surface = await renderAccount(capabilities)
    const signIn = [...surface.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === 'Sign in with GitHub',
    )
    if (signIn === undefined) throw new Error('sign-in button was not rendered')

    act(() => signIn.click())
    await act(async () => {
      resolveStart({
        state: 'device_code_issued',
        user_code: '9B26-5970',
        verification_uri: 'https://github.com/login/device',
        expires_at: '2099-01-01T00:00:00.000Z',
      })
      await Promise.resolve()
    })

    expect(copyText).toHaveBeenCalledWith('9B26-5970')
    expect(openExternal).toHaveBeenCalledWith(
      'https://github.com/login/device',
    )
    expect(surface.textContent).toContain(
      'Authenticate on GitHub, then paste in this device code. Click to copy to clipboard and open browser window.',
    )
    expect(surface.textContent).not.toContain('https://github.com/login/device')

    const codeButton = [...surface.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === '9B26-5970',
    )
    await act(async () => codeButton?.click())
    expect(copyText).toHaveBeenCalledTimes(2)
    expect(openExternal).toHaveBeenCalledTimes(2)
  })

  it('shows an internet banner below the GitHub account heading', async () => {
    const { account, capabilities } = fakeCapabilities()
    account.status.mockResolvedValue({
      state: 'unauthenticated',
      network_diagnosis: {
        kind: 'offline',
        scope: 'github-copilot-auth',
      },
    })

    const surface = await renderAccount(capabilities)
    const heading = [...surface.querySelectorAll('h2')].find(
      (candidate) => candidate.textContent === 'GitHub Copilot',
    )
    const banner = surface.querySelector('[data-status="failed"]')

    expect(banner?.textContent).toContain('No internet connection')
    if (!heading || !banner) throw new Error('network banner was not rendered')
    expect(heading.compareDocumentPosition(banner)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })
})
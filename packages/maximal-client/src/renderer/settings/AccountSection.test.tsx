import * as Tooltip from '@radix-ui/react-tooltip'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthStatus, SettingsCapabilities } from './capabilities'
import { AccountSection } from './AccountSection'

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
  }
  const capabilities = {
    account,
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
    notify: () => notify(),
    resolveStart: (status: AuthStatus) => resolveStart(status),
  }
}

async function renderAccount(capabilities: SettingsCapabilities): Promise<HTMLElement> {
  if (root === null || container === null) throw new Error('test root not ready')
  await act(async () => {
    root?.render(
      <Tooltip.Provider>
        <AccountSection capabilities={capabilities} />
      </Tooltip.Provider>,
    )
    await Promise.resolve()
  })
  return container
}

describe('AccountSection refresh ownership', () => {
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
    expect(surface.textContent).toContain(
      `Ollama is not responding at ${OLLAMA_ENDPOINT}.`,
    )
    expect(surface.textContent).toContain(OLLAMA_ENDPOINT)
    expect([...surface.querySelectorAll('h2')].map((heading) => heading.textContent)).toEqual([
      'GitHub Copilot',
      'Ollama',
    ])
    expect(surface.querySelector('h3')?.textContent).toBe('Saved accounts')
  })
})
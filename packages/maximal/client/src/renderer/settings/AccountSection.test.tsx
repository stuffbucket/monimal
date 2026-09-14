import * as Tooltip from '@radix-ui/react-tooltip'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthStatus, SettingsCapabilities } from './capabilities'
import { AccountSection } from './AccountSection'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

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
            endpoint: 'http://127.0.0.1:11434',
            scope: 'localhost' as const,
            account_state: 'unauthenticated' as const,
            availability: 'unavailable' as const,
            model_count: null,
          },
        ],
      })),
    },
    ollamaSettings: {
      get: vi.fn(async () => ({
        has_api_key: false,
        credential_source: 'none' as const,
        prefer_local_models: true,
      })),
      update: vi.fn(),
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
      'No account set. Local Ollama is not currently available.',
    )
    expect(surface.textContent).toContain('http://127.0.0.1:11434')
    expect([...surface.querySelectorAll('h2')].map((heading) => heading.textContent)).toEqual([
      'GitHub Copilot',
      'Ollama',
    ])
    expect(surface.querySelector('h3')?.textContent).toBe('Saved accounts')
  })
})
import * as Tooltip from '@radix-ui/react-tooltip'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AccountsListResponse, SettingsCapabilities } from './capabilities'
import { AccountsSection } from './AccountsSection'
import {
  AccountAvatar,
  registerService,
  resolveAccountAvatarUrl,
  resolveService,
} from './service-icons'

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

function fakeCapabilities(initialAccounts?: AccountsListResponse) {
  let notify = () => {}
  const accountsData: AccountsListResponse = initialAccounts ?? {
    accounts: [
      {
        key: 'octocat@github.com',
        login: 'octocat',
        host: 'github.com',
        added_via: 'device-code',
        obtained_at: '2025-01-01T00:00:00Z',
        active: true,
        enabled: true,
      },
      {
        key: 'enterprise-user@ghe.example.com',
        login: 'enterprise-user',
        host: 'ghe.example.com',
        added_via: 'gh-cli',
        obtained_at: '2025-01-02T00:00:00Z',
        active: false,
        enabled: true,
      },
      {
        key: 'local-ollama@127.0.0.1:11434',
        login: 'ollama-user',
        host: '127.0.0.1:11434',
        added_via: 'migration',
        obtained_at: '2025-01-03T00:00:00Z',
        active: false,
        enabled: true,
      },
    ],
    active_key: 'octocat@github.com',
  }

  const accounts = {
    list: vi.fn(async () => accountsData),
    switchTo: vi.fn(async (key: string) => {
      accountsData.active_key = key
      accountsData.accounts = accountsData.accounts.map((account) => ({
        ...account,
        active: account.key === key,
        enabled: account.key === key ? true : account.enabled,
      }))
    }),
    setEnabled: vi.fn(async (key: string, enabled: boolean) => {
      accountsData.accounts = accountsData.accounts.map((account) => ({
        ...account,
        enabled: account.key === key ? enabled : account.enabled,
        active: account.key === key && !enabled ? false : account.active,
      }))
      if (!enabled && accountsData.active_key === key) {
        accountsData.active_key = null
      }
    }),
    reorder: vi.fn(async (keys: string[]) => {
      const reordered = keys
        .map((k) => accountsData.accounts.find((a) => a.key === k))
        .filter((a): a is NonNullable<typeof a> => a !== undefined)
      accountsData.accounts = reordered
    }),
  }

  const capabilities = {
    accounts,
    subscribe: vi.fn((listener: () => void) => {
      notify = listener
      return () => {}
    }),
  } as unknown as SettingsCapabilities

  return {
    accounts,
    capabilities,
    notify: () => notify(),
  }
}

async function renderSection(capabilities: SettingsCapabilities): Promise<HTMLElement> {
  if (root === null || container === null) throw new Error('test root not ready')
  await act(async () => {
    root?.render(
      <Tooltip.Provider>
        <AccountsSection capabilities={capabilities} />
      </Tooltip.Provider>,
    )
    await Promise.resolve()
  })
  return container
}

describe('Service Icons & Avatar resolution', () => {
  it('resolves avatar URLs for github.com accounts', () => {
    const url = resolveAccountAvatarUrl({
      login: 'mona',
      host: 'github.com',
    })
    expect(url).toBe('https://github.com/mona.png?size=64')
  })

  it('respects explicit avatar_url or avatarUrl properties', () => {
    expect(
      resolveAccountAvatarUrl({
        login: 'custom',
        host: 'custom.host',
        avatar_url: 'https://example.com/avatar.jpg',
      }),
    ).toBe('https://example.com/avatar.jpg')

    expect(
      resolveAccountAvatarUrl({
        login: 'custom2',
        host: 'custom.host',
        avatarUrl: 'https://example.com/avatar2.png',
      }),
    ).toBe('https://example.com/avatar2.png')
  })

  it('returns null for non-github accounts without explicit avatar URL', () => {
    expect(
      resolveAccountAvatarUrl({
        login: 'local-user',
        host: '127.0.0.1:11434',
      }),
    ).toBeNull()
  })

  it('resolves service definitions for GitHub, Ollama, OpenAI, Anthropic, Gemini and generic', () => {
    expect(resolveService({ host: 'github.com' }).id).toBe('github')
    expect(resolveService({ host: 'ghe.corp.com' }).id).toBe('github')
    expect(resolveService({ provider: 'copilot' }).id).toBe('github')
    expect(resolveService({ provider: 'ollama' }).id).toBe('ollama')
    expect(resolveService({ host: '127.0.0.1:11434' }).id).toBe('ollama')
    expect(resolveService({ endpoint: 'http://localhost:11434' }).id).toBe('ollama')
    expect(resolveService({ provider: 'openai' }).id).toBe('openai')
    expect(resolveService({ provider: 'anthropic' }).id).toBe('anthropic')
    expect(resolveService({ provider: 'claude' }).id).toBe('anthropic')
    expect(resolveService({ provider: 'gemini' }).id).toBe('gemini')
    expect(resolveService({ provider: 'unknown-service' }).id).toBe('service')
  })

  it('supports extensible service registration without hardcoding', () => {
    registerService({
      id: 'custom-ai',
      name: 'Custom AI',
      match: (acc) => typeof acc === 'object' && acc?.host === 'custom.ai.internal',
      renderIcon: ({ testId }) => (
        <svg data-testid={testId ?? 'service-icon-custom-ai'} viewBox="0 0 10 10">
          <circle cx="5" cy="5" r="5" />
        </svg>
      ),
    })

    expect(resolveService({ host: 'custom.ai.internal' }).id).toBe('custom-ai')
  })

  it('renders service SVG icon fallback when avatarUrl is absent', async () => {
    if (root === null || container === null) throw new Error('test root not ready')
    await act(async () => {
      root?.render(<AccountAvatar account={{ host: '127.0.0.1:11434', login: 'ollama-user' }} />)
      await Promise.resolve()
    })

    const svg = container.querySelector('[data-testid="service-icon-ollama"]')
    expect(svg).not.toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })

  it('renders image when avatarUrl is present and falls back to service icon on error', async () => {
    if (root === null || container === null) throw new Error('test root not ready')
    await act(async () => {
      root?.render(<AccountAvatar account={{ host: 'github.com', login: 'octocat' }} />)
      await Promise.resolve()
    })

    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.src).toContain('https://github.com/octocat.png?size=64')

    // Simulate image error
    await act(async () => {
      img?.dispatchEvent(new Event('error'))
      await Promise.resolve()
    })

    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[data-testid="service-icon-github"]')).not.toBeNull()
  })
})

describe('AccountsSection UI & Actions', () => {
  it('renders accounts in person cards with avatars and metadata', async () => {
    const { capabilities } = fakeCapabilities()
    const surface = await renderSection(capabilities)

    expect(surface.textContent).toContain('Saved accounts')
    expect(surface.textContent).toContain('octocat')
    expect(surface.textContent).toContain('enterprise-user')
    expect(surface.textContent).toContain('ollama-user')

    // Active account has active chip
    expect(surface.textContent).toContain('Active')

    // Avatars / service icons are rendered
    const avatars = surface.querySelectorAll('.avatar')
    expect(avatars.length).toBe(3)

    // First account has GitHub img avatar
    const firstImg = avatars[0]?.querySelector('img')
    expect(firstImg?.src).toContain('https://github.com/octocat.png?size=64')

    // Second account (GHE without direct .png) falls back to GitHub service SVG icon
    expect(avatars[1]?.querySelector('[data-testid="service-icon-github"]')).not.toBeNull()

    // Third account (Ollama) falls back to Ollama service SVG icon
    expect(avatars[2]?.querySelector('[data-testid="service-icon-ollama"]')).not.toBeNull()
  })

  it('switches the active account when clicking Switch to account', async () => {
    const { capabilities, accounts } = fakeCapabilities()
    const surface = await renderSection(capabilities)

    const switchButtons = [...surface.querySelectorAll('button')].filter(
      (b) => b.textContent === 'Switch to account',
    )
    expect(switchButtons.length).toBe(2)

    await act(async () => {
      switchButtons[0]?.click()
      await Promise.resolve()
    })

    expect(accounts.switchTo).toHaveBeenCalledWith('enterprise-user@ghe.example.com')
  })

  it('disables a saved account without removing its card', async () => {
    const { capabilities, accounts } = fakeCapabilities()
    const surface = await renderSection(capabilities)
    const toggle = surface.querySelector<HTMLButtonElement>(
      '[data-testid="account-enabled-enterprise-user@ghe.example.com"]',
    )

    expect(toggle?.getAttribute('aria-checked')).toBe('true')
    await act(async () => {
      toggle?.click()
      await Promise.resolve()
    })

    expect(accounts.setEnabled).toHaveBeenCalledWith(
      'enterprise-user@ghe.example.com',
      false,
    )
    expect(
      surface.querySelector('[data-testid="account-card-enterprise-user"]'),
    ).not.toBeNull()
    expect(toggle?.getAttribute('aria-checked')).toBe('false')
    expect(surface.textContent).toContain('Disabled')
  })

  it('does not offer a disabled account as a switch target', async () => {
    const disabled: AccountsListResponse = {
      accounts: [
        {
          key: 'disabled@github.com',
          login: 'disabled',
          host: 'github.com',
          added_via: 'device-code',
          obtained_at: '2025-01-01T00:00:00Z',
          active: false,
          enabled: false,
        },
      ],
      active_key: null,
    }
    const { capabilities } = fakeCapabilities(disabled)
    const surface = await renderSection(capabilities)

    expect(surface.textContent).toContain('Disabled')
    expect(surface.textContent).not.toContain('Switch to account')
  })

  it('reorders accounts with up and down buttons', async () => {
    const { capabilities, accounts } = fakeCapabilities()
    const surface = await renderSection(capabilities)

    const upButtons = surface.querySelectorAll('button[aria-label^="Move"][aria-label$="up"]')
    const downButtons = surface.querySelectorAll('button[aria-label^="Move"][aria-label$="down"]')

    expect(upButtons.length).toBe(3)
    expect(downButtons.length).toBe(3)

    // First account cannot move up
    expect((upButtons[0] as HTMLButtonElement).disabled).toBe(true)
    // Last account cannot move down
    expect((downButtons[2] as HTMLButtonElement).disabled).toBe(true)

    // Move second account up
    await act(async () => {
      ;(upButtons[1] as HTMLButtonElement).click()
      await Promise.resolve()
    })

    expect(accounts.reorder).toHaveBeenCalledWith([
      'enterprise-user@ghe.example.com',
      'octocat@github.com',
      'local-ollama@127.0.0.1:11434',
    ])
  })

  it('greys out up/down buttons when fewer than two accounts are available', async () => {
    const singleAccount: AccountsListResponse = {
      accounts: [
        {
          key: 'single@github.com',
          login: 'single-user',
          host: 'github.com',
          added_via: 'device-code',
          obtained_at: '2025-01-01T00:00:00Z',
          active: true,
          enabled: true,
        },
      ],
      active_key: 'single@github.com',
    }
    const { capabilities } = fakeCapabilities(singleAccount)
    const surface = await renderSection(capabilities)

    const upButton = surface.querySelector<HTMLButtonElement>('button[aria-label="Move single-user up"]')
    const downButton = surface.querySelector<HTMLButtonElement>('button[aria-label="Move single-user down"]')

    expect(upButton).not.toBeNull()
    expect(downButton).not.toBeNull()
    expect(upButton?.disabled).toBe(true)
    expect(downButton?.disabled).toBe(true)
  })

  it('applies active glow attribute to the active account avatar', async () => {
    const { capabilities } = fakeCapabilities()
    const surface = await renderSection(capabilities)

    const avatars = surface.querySelectorAll('.avatar')
    expect(avatars[0]?.getAttribute('data-active')).toBe('true')
    expect(avatars[1]?.getAttribute('data-active')).toBeNull()
    expect(avatars[2]?.getAttribute('data-active')).toBeNull()
  })

  it('renders and dismisses error banner on failure', async () => {
    const { capabilities, accounts } = fakeCapabilities()
    accounts.switchTo.mockRejectedValueOnce(new Error('Connection lost to daemon'))

    const surface = await renderSection(capabilities)
    const switchButton = [...surface.querySelectorAll('button')].find(
      (b) => b.textContent === 'Switch to account',
    )

    await act(async () => {
      switchButton?.click()
      await Promise.resolve()
    })

    expect(surface.textContent).toContain('Connection lost to daemon')

    // Banner dismiss button
    const dismissButton = surface.querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]')
    if (dismissButton) {
      await act(async () => {
        dismissButton.click()
        await Promise.resolve()
      })
      expect(surface.textContent).not.toContain('Connection lost to daemon')
    }
  })
})

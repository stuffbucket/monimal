import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SettingsCapabilities } from './settings/capabilities'

vi.mock('stuffbucket-electron/renderer', () => ({
  Button: ({ children, ...props }: { children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  Checkbox: ({ label, checked, onChange }: {
    label: string
    checked: boolean
    onChange: (checked: boolean) => void
  }) => (
    <label>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  ),
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => open
    ? <div data-testid="provider-onboarding">{children}</div>
    : null,
}))

const { ProviderOnboarding } = await import('./ProviderOnboarding')

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | null = null
let container: HTMLElement | null = null

afterEach(() => {
  if (root !== null) act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

function capabilities({ configured = false, dismissed = false, ollama = false } = {}) {
  const setDismissed = vi.fn(async (next: boolean) => ({ dismissed: next }))
  return {
    value: {
      subscribe: vi.fn(() => vi.fn()),
      providerOnboarding: {
        get: vi.fn(async () => ({ dismissed })),
        setDismissed,
      },
      accounts: {
        list: vi.fn(async () => ({
          accounts: configured ? [{ enabled: true }] : [],
          active_key: null,
        })),
      },
      ollamaAccounts: {
        list: vi.fn(async () => ({
          accounts: ollama ? [{ id: 'local', name: 'Local Ollama' }] : [],
        })),
      },
    } as unknown as SettingsCapabilities,
    setDismissed,
  }
}

async function render(capability: SettingsCapabilities, onSetup = vi.fn()): Promise<HTMLElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(<ProviderOnboarding capabilities={capability} onSetup={onSetup} />)
    await Promise.resolve()
  })
  return container
}

describe('ProviderOnboarding', () => {
  it('offers setup only when no provider is configured and the prompt is not dismissed', async () => {
    const empty = capabilities()
    const shell = await render(empty.value)
    expect(shell.querySelector('[data-testid="provider-onboarding"]')).not.toBeNull()

    act(() => root?.unmount())
    root = null
    const configured = capabilities({ configured: true })
    await render(configured.value)
    expect(container?.querySelector('[data-testid="provider-onboarding"]')).toBeNull()
  })

  it.each([
    ['a saved dismissal', { dismissed: true }],
    ['an Ollama provider', { ollama: true }],
  ])('stays closed for %s', async (_reason, options) => {
    const capability = capabilities(options)
    await render(capability.value)
    expect(container?.querySelector('[data-testid="provider-onboarding"]')).toBeNull()
  })

  it('closes without persisting when the user declines', async () => {
    const capability = capabilities()
    const shell = await render(capability.value)
    const decline = [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'Not now',
    )
    if (decline === undefined) throw new Error('decline control missing')

    await act(async () => decline.click())

    expect(capability.setDismissed).not.toHaveBeenCalled()
    expect(shell.querySelector('[data-testid="provider-onboarding"]')).toBeNull()
  })

  it('persists do-not-ask before navigating to provider setup', async () => {
    const capability = capabilities()
    const onSetup = vi.fn()
    const shell = await render(capability.value, onSetup)
    const checkbox = shell.querySelector<HTMLInputElement>('input[type="checkbox"]')
    const setup = [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'Set up a provider',
    )
    if (checkbox === null || setup === undefined) throw new Error('onboarding controls missing')

    act(() => checkbox.click())
    await act(async () => setup.click())

    expect(capability.setDismissed).toHaveBeenCalledWith(true)
    expect(onSetup).toHaveBeenCalledOnce()
    expect(shell.querySelector('[data-testid="provider-onboarding"]')).toBeNull()
  })
})
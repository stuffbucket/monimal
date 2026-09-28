import * as Tooltip from '@radix-ui/react-tooltip'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SettingsCapabilities } from './capabilities'
import { OllamaAccountsSection } from './OllamaAccountsSection'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const settings = {
  has_api_key: false,
  credential_source: 'none' as const,
  local_enabled: true,
  prefer_local_models: true,
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
}) {
  const current = {
    ...settings,
    has_api_key: options?.configured ?? false,
    credential_source: options?.configured ? 'file' as const : 'none' as const,
  }
  const update = options?.update
    ?? vi.fn(async () => ({ ...settings, has_api_key: true }))
  return {
    update,
    capabilities: {
      ollamaAccounts: {
        list: vi.fn(async () => ({ accounts: [] })),
      },
      ollamaSettings: {
        get: vi.fn(async () => current),
        update,
      },
      openExternal: vi.fn(),
    } as unknown as SettingsCapabilities,
  }
}

async function renderSection(
  capabilities: SettingsCapabilities,
): Promise<HTMLElement> {
  if (root === null || container === null) throw new Error('test root not ready')
  await act(async () => {
    root?.render(
      <Tooltip.Provider>
        <OllamaAccountsSection capabilities={capabilities} />
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

function triggerBlur(input: HTMLInputElement): void {
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  input.dispatchEvent(new FocusEvent('blur', { bubbles: false }))
}

describe('OllamaAccountsSection API key validation', () => {
  it('renders helper text as input placeholder and does not render save action', async () => {
    const { capabilities } = fakeCapabilities()
    const surface = await renderSection(capabilities)
    const input = surface.querySelector<HTMLInputElement>(
      '[data-testid="ollama-api-key"]',
    )

    expect(input?.closest('.settings-credential-field')).not.toBeNull()
    expect(input?.placeholder).toBe(
      'Enter an Ollama API key to use Ollama Cloud models.',
    )
    expect(
      [...surface.querySelectorAll('button')].some(
        (button) => button.textContent === 'Save',
      ),
    ).toBe(false)
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

  it('prompts with a confirmation dialog on blur and saves when accepted', async () => {
    const { capabilities, update } = fakeCapabilities()
    const surface = await renderSection(capabilities)
    const input = surface.querySelector<HTMLInputElement>(
      '[data-testid="ollama-api-key"]',
    )
    if (input === null) throw new Error('API key input was not rendered')

    act(() => enter(input, 'ollama-secret-key'))
    await act(async () => {
      triggerBlur(input)
      await Promise.resolve()
    })

    const dialog = document.querySelector('[data-testid="ollama-key-dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.textContent).toContain('Update Ollama API key?')

    const confirmButton = [...(dialog?.querySelectorAll('button') ?? [])].find(
      (btn) => btn.textContent === 'Yes, update key',
    )
    if (!confirmButton) throw new Error('confirm button not found')

    await act(async () => {
      confirmButton.click()
      await Promise.resolve()
    })

    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith({ api_key: 'ollama-secret-key' })
    expect(surface.textContent).toContain('Ollama API key verified and saved.')
  })

  it('discards the entered key without updating when rejected in dialog', async () => {
    const { capabilities, update } = fakeCapabilities()
    const surface = await renderSection(capabilities)
    const input = surface.querySelector<HTMLInputElement>(
      '[data-testid="ollama-api-key"]',
    )
    if (input === null) throw new Error('API key input was not rendered')

    act(() => enter(input, 'ollama-secret-key'))
    await act(async () => {
      triggerBlur(input)
      await Promise.resolve()
    })

    const dialog = document.querySelector('[data-testid="ollama-key-dialog"]')
    expect(dialog).not.toBeNull()

    const discardButton = [...(dialog?.querySelectorAll('button') ?? [])].find(
      (btn) => btn.textContent === 'No, discard',
    )
    if (!discardButton) throw new Error('discard button not found')

    await act(async () => {
      discardButton.click()
      await Promise.resolve()
    })

    expect(update).not.toHaveBeenCalled()
    expect(input.value).toBe('')
    expect(document.querySelector('[data-testid="ollama-key-dialog"]')).toBeNull()
  })

  it('rejects keys that are too short before making network calls', async () => {
    const { capabilities, update } = fakeCapabilities()
    const surface = await renderSection(capabilities)
    const input = surface.querySelector<HTMLInputElement>(
      '[data-testid="ollama-api-key"]',
    )
    if (input === null) throw new Error('API key input was not rendered')

    act(() => enter(input, 'short'))
    await act(async () => {
      triggerBlur(input)
      await Promise.resolve()
    })

    const dialog = document.querySelector('[data-testid="ollama-key-dialog"]')
    expect(dialog).not.toBeNull()

    const confirmButton = [...(dialog?.querySelectorAll('button') ?? [])].find(
      (btn) => btn.textContent === 'Yes, update key',
    )
    if (!confirmButton) throw new Error('confirm button not found')

    await act(async () => {
      confirmButton.click()
      await Promise.resolve()
    })

    expect(update).not.toHaveBeenCalled()
    expect(dialog?.textContent).toContain('API key is too short to be valid.')
  })

  it('handles server rejection once without repeating', async () => {
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
    await act(async () => {
      triggerBlur(input)
      await Promise.resolve()
    })

    const dialog = document.querySelector('[data-testid="ollama-key-dialog"]')
    const confirmButton = [...(dialog?.querySelectorAll('button') ?? [])].find(
      (btn) => btn.textContent === 'Yes, update key',
    )
    if (!confirmButton) throw new Error('confirm button not found')

    await act(async () => {
      confirmButton.click()
      await Promise.resolve()
    })

    expect(update).toHaveBeenCalledTimes(1)
    expect(dialog?.textContent).toContain('Ollama rejected this API key.')
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


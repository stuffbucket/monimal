import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SettingsCapabilities } from './capabilities'
import { GeneralSection } from './GeneralSection'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | null = null
let container: HTMLElement | null = null

function fakeCapabilities() {
  const general = {
    menuBarMode: vi.fn(async () => ({ enabled: false, pending: false })),
    beginMenuBarOnly: vi.fn(async () => ({
      attemptId: 'attempt-1',
      deadlineMs: Date.now() + 15_000,
    })),
    confirmMenuBarOnly: vi.fn(async () => ({ enabled: true, pending: false })),
    cancelMenuBarOnly: vi.fn(async () => ({ enabled: false, pending: false })),
    disableMenuBarOnly: vi.fn(async () => ({ enabled: false, pending: false })),
    assistantOverlay: vi.fn(async () => ({
      candy: true,
      approval: 'writes' as const,
      hotkey: 'CommandOrControl+Shift+Space',
    })),
    updateAssistantOverlay: vi.fn(async (update: {
      candy?: boolean
      approval?: 'all' | 'writes' | 'none'
    }) => ({
      candy: update.candy ?? true,
      approval: update.approval ?? 'writes',
      hotkey: 'CommandOrControl+Shift+Space',
    })),
  }
  return {
    capabilities: { general } as unknown as SettingsCapabilities,
    general,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-08T12:00:00Z'))
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  if (root !== null) act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.useRealTimers()
})

async function renderGeneral(capabilities: SettingsCapabilities): Promise<HTMLElement> {
  if (root === null || container === null) throw new Error('test root not ready')
  await act(async () => {
    root?.render(<GeneralSection capabilities={capabilities} />)
    await Promise.resolve()
  })
  return container
}

function switchControl(surface: HTMLElement): HTMLButtonElement {
  const control = surface.querySelector<HTMLButtonElement>(
    '[data-testid="menu-bar-only-switch"]',
  )
  if (control === null) throw new Error('menu-bar-only switch was not rendered')
  return control
}

function button(label: string): HTMLButtonElement {
  const control = [...document.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === label,
  )
  if (control === undefined) throw new Error(`${label} button was not rendered`)
  return control
}

describe('GeneralSection menu-bar-only confirmation', () => {
  it('presents the control as an Appearance setting', async () => {
    const { capabilities } = fakeCapabilities()
    const surface = await renderGeneral(capabilities)

    expect(surface.querySelector('h1')).toBeNull()
    expect(surface.querySelector('h2')?.textContent).toBe('Desktop presence')
    expect(surface.textContent).toContain('Assistant overlay')
    expect(surface.querySelector('[data-testid="assistant-candy-switch"]'))
      .not.toBeNull()
    const section = surface.querySelector('.settings__section')
    const group = surface.querySelector('.settings__group')
    expect(surface.firstElementChild).toBe(section)
    expect(group?.parentElement).toBe(section)
    expect(surface.querySelector('.settings__item-title')?.textContent).toBe(
      'Show Maximal in the menu bar only',
    )
    expect(switchControl(surface).getAttribute('role')).toBe('switch')
    expect(switchControl(surface).getAttribute('data-layout')).toBe('compact')
  })

  it('persists the candy-coated assistant preference', async () => {
    const { capabilities, general } = fakeCapabilities()
    const surface = await renderGeneral(capabilities)
    const control = surface.querySelector<HTMLButtonElement>(
      '[data-testid="assistant-candy-switch"]',
    )
    if (control === null) throw new Error('assistant candy switch was not rendered')

    await act(async () => control.click())

    expect(general.updateAssistantOverlay).toHaveBeenCalledWith({ candy: false })
  })

  it('counts down and closes when main reaches its automatic rollback deadline', async () => {
    const { capabilities } = fakeCapabilities()
    const surface = await renderGeneral(capabilities)

    await act(async () => switchControl(surface).click())

    expect(document.body.textContent).toContain('15 seconds')
    expect(switchControl(surface).getAttribute('aria-checked')).toBe('true')
    await act(async () => vi.advanceTimersByTimeAsync(1_000))
    expect(document.body.textContent).toContain('14 seconds')

    await act(async () => vi.advanceTimersByTimeAsync(14_000))
    expect(document.body.textContent).not.toContain('Keep menu bar only?')
    expect(switchControl(surface).getAttribute('aria-checked')).toBe('false')
  })

  it('confirms the matching attempt and keeps the enabled state', async () => {
    const { capabilities, general } = fakeCapabilities()
    const surface = await renderGeneral(capabilities)
    await act(async () => switchControl(surface).click())

    await act(async () => button('Keep menu bar only').click())

    expect(general.confirmMenuBarOnly).toHaveBeenCalledWith('attempt-1')
    expect(document.body.textContent).not.toContain('Keep menu bar only?')
    expect(switchControl(surface).getAttribute('aria-checked')).toBe('true')
  })

  it('cancels the matching attempt when the user explicitly reverts', async () => {
    const { capabilities, general } = fakeCapabilities()
    const surface = await renderGeneral(capabilities)
    await act(async () => switchControl(surface).click())

    await act(async () => button('Revert').click())

    expect(general.cancelMenuBarOnly).toHaveBeenCalledWith('attempt-1')
    expect(switchControl(surface).getAttribute('aria-checked')).toBe('false')
  })
})

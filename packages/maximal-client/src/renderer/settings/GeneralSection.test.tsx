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
    appearance: vi.fn(async () => ({
      vibrancyEnabled: false,
      vibrancySupported: true,
      backgroundEffectsEnabled: false,
      reducedMotionEnabled: false,
    })),
    setVibrancyEnabled: vi.fn(async (enabled: boolean) => ({
      vibrancyEnabled: enabled,
      vibrancySupported: true,
      backgroundEffectsEnabled: false,
      reducedMotionEnabled: false,
    })),
    setBackgroundEffectsEnabled: vi.fn(async (enabled: boolean) => ({
      vibrancyEnabled: false,
      vibrancySupported: true,
      backgroundEffectsEnabled: enabled,
      reducedMotionEnabled: false,
    })),
    setReducedMotionEnabled: vi.fn(async (enabled: boolean) => ({
      vibrancyEnabled: false,
      vibrancySupported: true,
      backgroundEffectsEnabled: false,
      reducedMotionEnabled: enabled,
    })),
    onAppearanceChange: vi.fn(() => () => {}),
    menuBarMode: vi.fn(async () => ({ enabled: false, pending: false })),
    beginMenuBarOnly: vi.fn(async () => ({
      attemptId: 'attempt-1',
      deadlineMs: Date.now() + 15_000,
    })),
    confirmMenuBarOnly: vi.fn(async () => ({ enabled: true, pending: false })),
    cancelMenuBarOnly: vi.fn(async () => ({ enabled: false, pending: false })),
    disableMenuBarOnly: vi.fn(async () => ({ enabled: false, pending: false })),
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

function vibrancyControl(surface: HTMLElement): HTMLButtonElement {
  const control = surface.querySelector<HTMLButtonElement>(
    '[data-testid="vibrancy-switch"]',
  )
  if (control === null) throw new Error('vibrancy switch was not rendered')
  return control
}

function effectControl(
  surface: HTMLElement,
  testId: string,
): HTMLButtonElement {
  const control = surface.querySelector<HTMLButtonElement>(
    `[data-testid="${testId}"]`,
  )
  if (control === null) throw new Error(`${testId} was not rendered`)
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
  it('enables native vibrancy from Appearance settings', async () => {
    const { capabilities, general } = fakeCapabilities()
    const surface = await renderGeneral(capabilities)

    expect(surface.textContent).toContain('Window materials')
    expect(surface.textContent).toContain(
      'Show the macOS desktop vibrancy material through Maximal surfaces.',
    )
    expect(vibrancyControl(surface).getAttribute('aria-checked')).toBe('false')

    await act(async () => vibrancyControl(surface).click())

    expect(general.setVibrancyEnabled).toHaveBeenCalledWith(true)
    expect(vibrancyControl(surface).getAttribute('aria-checked')).toBe('true')
  })

  it('disables native vibrancy with unsupported-platform guidance', async () => {
    const { capabilities, general } = fakeCapabilities()
    general.appearance.mockResolvedValueOnce({
      vibrancyEnabled: false,
      vibrancySupported: false,
      backgroundEffectsEnabled: false,
      reducedMotionEnabled: false,
    })
    const surface = await renderGeneral(capabilities)

    expect(surface.textContent).toContain('Native vibrancy is available on macOS.')
    expect(vibrancyControl(surface).disabled).toBe(true)
  })

  it('updates background and reduced-motion preferences', async () => {
    const { capabilities, general } = fakeCapabilities()
    const surface = await renderGeneral(capabilities)

    await act(async () =>
      effectControl(surface, 'background-effects-switch').click(),
    )
    expect(general.setBackgroundEffectsEnabled).toHaveBeenCalledWith(true)

    await act(async () =>
      effectControl(surface, 'reduced-motion-switch').click(),
    )
    expect(general.setReducedMotionEnabled).toHaveBeenCalledWith(true)
  })

  it('disables visual controls while an appearance update is pending', async () => {
    const { capabilities, general } = fakeCapabilities()
    let finish!: (value: Awaited<ReturnType<typeof general.setBackgroundEffectsEnabled>>) => void
    general.setBackgroundEffectsEnabled.mockImplementationOnce(
      () => new Promise((resolve) => {
        finish = resolve
      }),
    )
    const surface = await renderGeneral(capabilities)

    act(() => effectControl(surface, 'background-effects-switch').click())
    expect(effectControl(surface, 'background-effects-switch').disabled).toBe(true)
    expect(effectControl(surface, 'reduced-motion-switch').disabled).toBe(true)
    expect(vibrancyControl(surface).disabled).toBe(true)

    await act(async () => finish({
      vibrancyEnabled: false,
      vibrancySupported: true,
      backgroundEffectsEnabled: true,
      reducedMotionEnabled: false,
    }))
    expect(effectControl(surface, 'background-effects-switch').disabled).toBe(false)
  })

  it('presents the control as an Appearance setting', async () => {
    const { capabilities } = fakeCapabilities()
    const surface = await renderGeneral(capabilities)

    expect(surface.querySelector('h1')).toBeNull()
    expect([...surface.querySelectorAll('h2')].map(({ textContent }) => textContent))
      .toContain('Desktop presence')
    expect(surface.querySelector('.settings__group')).not.toBeNull()
    expect(
      [...surface.querySelectorAll('.settings__item-title')]
        .map(({ textContent }) => textContent),
    ).toContain('Show Maximal in the menu bar only')
    expect(switchControl(surface).getAttribute('role')).toBe('switch')
    expect(switchControl(surface).getAttribute('data-layout')).toBe('compact')
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

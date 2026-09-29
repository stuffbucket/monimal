import { act } from 'react'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createMaximalQueryClient } from '../query-client'
import type { SettingsCapabilities } from './capabilities'
import { GeneralSection } from './GeneralSection'
import { appearancePreferenceQueryKey } from './general/useAppearancePreference'
import { menuBarModeQueryKey } from './general/useMenuBarPresence'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | null = null
let container: HTMLElement | null = null
let queryClient: QueryClient | null = null

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function fakeCapabilities(options?: {
  version?: string
  startOnLogin?: boolean
  notificationSupported?: boolean
  canOpenNotificationSettings?: boolean
}) {
  const version = options?.version ?? '1.2.3'
  const startOnLogin = options?.startOnLogin ?? false
  const general = {
    desktopSettings: vi.fn(async () => ({
      version,
      startOnLogin,
      quickAccessShortcut: 'control-control' as const,
    })),
    setStartOnLogin: vi.fn(async (enabled: boolean) => ({
      version,
      startOnLogin: enabled,
      quickAccessShortcut: 'control-control' as const,
    })),
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
    systemNotificationStatus: vi.fn(async () => ({
      supported: options?.notificationSupported ?? true,
      canOpenSettings: options?.canOpenNotificationSettings ?? true,
    })),
    openSystemNotificationSettings: vi.fn(async () => undefined),
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
  localStorage.clear()
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })))
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  })
})

afterEach(() => {
  if (root !== null) act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  queryClient = null
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function renderGeneral(
  capabilities: SettingsCapabilities,
  options: { seedMenuBar?: boolean } = {},
): Promise<HTMLElement> {
  if (root === null || container === null) throw new Error('test root not ready')
  const client = createMaximalQueryClient()
  queryClient = client
  client.setQueryData(
    appearancePreferenceQueryKey,
    await capabilities.general.appearance(),
  )
  if (options.seedMenuBar !== false) {
    client.setQueryData(
      menuBarModeQueryKey,
      await capabilities.general.menuBarMode(),
    )
  }
  await act(async () => {
    root?.render(
      <QueryClientProvider client={client}>
        <GeneralSection capabilities={capabilities} />
      </QueryClientProvider>,
    )
  })
  return container
}

function rerenderGeneral(capabilities: SettingsCapabilities): void {
  if (root === null || queryClient === null) throw new Error('test root not ready')
  root.render(
    <QueryClientProvider client={queryClient}>
      <GeneralSection capabilities={capabilities} />
    </QueryClientProvider>,
  )
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

describe('GeneralSection', () => {
  it('offers auto, light, dark, sourced palettes, and portable theme actions', async () => {
    const { capabilities } = fakeCapabilities()
    const surface = await renderGeneral(capabilities)

    expect(surface.querySelector('[data-testid="appearance-mode"]')).not.toBeNull()
    expect(surface.querySelector('[data-testid="appearance-preset"]')?.textContent).toContain(
      'Mocha Mousse',
    )
    expect(surface.querySelector('[data-testid="appearance-preset"]')?.textContent).toContain(
      'Apple System',
    )
    expect(surface.querySelector('[data-testid="appearance-preset"]')?.textContent).toContain(
      'Very Peri',
    )
    expect(surface.querySelector('[data-testid="appearance-preset"]')?.textContent).toContain(
      'Viva Magenta',
    )
    const preset = surface.querySelector<HTMLSelectElement>(
      '[data-testid="appearance-preset"]',
    )
    if (preset === null) throw new Error('appearance preset was not rendered')
    await act(async () => {
      preset.value = 'mocha-mousse-2025'
      preset.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(surface.textContent).toContain('PANTONE 17-1230')
    expect(surface.textContent).toContain('Import')
    expect(surface.textContent).toContain('Export')
  })

  it('enables native vibrancy from Appearance settings', async () => {
    const { capabilities, general } = fakeCapabilities()
    const surface = await renderGeneral(capabilities)

    expect(surface.textContent).toContain('Window materials')
    expect(surface.textContent).toContain(
      'Show the macOS desktop vibrancy material through Maximal surfaces.',
    )
    expect(vibrancyControl(surface).getAttribute('aria-checked')).toBe('false')

    await act(async () => {
      vibrancyControl(surface).click()
      await vi.advanceTimersByTimeAsync(0)
    })

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

  it('persists bounded material, quality, motion, and solar controls', async () => {
    const { capabilities } = fakeCapabilities()
    const surface = await renderGeneral(capabilities)

    expect(
      surface.querySelector<HTMLSelectElement>('[data-testid="material-preset"]')
        ?.disabled,
    ).toBe(true)
    await act(async () =>
      effectControl(surface, 'background-effects-switch').click(),
    )
    const preset = surface.querySelector<HTMLSelectElement>(
      '[data-testid="material-preset"]',
    )
    const lighting = surface.querySelector<HTMLSelectElement>(
      '[data-testid="material-lighting"]',
    )
    if (preset === null || lighting === null) {
      throw new Error('material controls were not rendered')
    }
    expect(preset.disabled).toBe(false)

    await act(async () => {
      preset.value = 'water'
      preset.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => {
      lighting.value = 'timezone'
      lighting.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(surface.querySelector('[data-testid="material-timezone"]')).not.toBeNull()
    expect(surface.querySelector('[data-testid="material-latitude"]')).not.toBeNull()
    expect(surface.querySelector('[data-testid="material-longitude"]')).not.toBeNull()
    expect(JSON.parse(localStorage.getItem('maximal.material-preference.v1') ?? '{}'))
      .toMatchObject({ preset: 'water', lighting: 'timezone' })
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

    await act(async () => {
      effectControl(surface, 'background-effects-switch').click()
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(effectControl(surface, 'background-effects-switch').disabled).toBe(true)
    expect(effectControl(surface, 'reduced-motion-switch').disabled).toBe(true)
    expect(vibrancyControl(surface).disabled).toBe(true)

    await act(async () => {
      finish({
        vibrancyEnabled: false,
        vibrancySupported: true,
        backgroundEffectsEnabled: true,
        reducedMotionEnabled: false,
      })
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(effectControl(surface, 'background-effects-switch').disabled).toBe(false)
  })

  it('groups appearance and desktop behavior as General settings', async () => {
    const { capabilities } = fakeCapabilities()
    const surface = await renderGeneral(capabilities)

    expect(surface.querySelector('h1')).toBeNull()
    expect([...surface.querySelectorAll('h2')].map(({ textContent }) => textContent)).toEqual([
      'Theme',
      'Window materials',
      'Visual effects',
      'Desktop app',
      'Notifications',
    ])
    expect(surface.querySelectorAll('.settings__group')).toHaveLength(5)
    expect([
      ...surface.querySelectorAll(
        '.settings__group .settings__item + .settings__item',
      ),
    ].every((item) => item.getAttribute('data-divider') === 'false')).toBe(true)
    expect(surface.textContent).toContain('Desktop app version')
    expect(surface.textContent).toContain('1.2.3')
    expect(surface.textContent).toContain('Run on startup')
    expect(surface.textContent).toContain('Quick access shortcut')
    expect(surface.textContent).toContain('Ctrl Ctrl')
    expect(surface.textContent).toContain('Menu bar')
    expect(surface.textContent).toContain(
      'Manage notification permission, alerts, and sounds in system settings.',
    )
    expect(switchControl(surface).getAttribute('role')).toBe('switch')
    expect(switchControl(surface).getAttribute('data-layout')).toBe('compact')
    expect(surface.querySelector('[aria-live="assertive"]')).toBeNull()
  })

  it('updates Electron login-item startup behavior', async () => {
    const { capabilities, general } = fakeCapabilities()
    const surface = await renderGeneral(capabilities)
    const startup = surface.querySelector<HTMLButtonElement>(
      '[data-testid="start-on-login-switch"]',
    )
    if (startup === null) throw new Error('startup switch was not rendered')

    await act(async () => startup.click())

    expect(general.setStartOnLogin).toHaveBeenCalledWith(true)
    expect(startup.getAttribute('aria-checked')).toBe('true')
  })

  it('shows loading and unsupported notification states', async () => {
    const pendingDesktop = deferred<Awaited<
      ReturnType<SettingsCapabilities['general']['desktopSettings']>
    >>()
    const { capabilities, general } = fakeCapabilities({
      notificationSupported: false,
      canOpenNotificationSettings: false,
    })
    general.desktopSettings.mockReturnValueOnce(pendingDesktop.promise)

    const surface = await renderGeneral(capabilities)

    expect(surface.textContent).toContain('Loading general desktop settings…')
    expect(surface.textContent).toContain('Checking system notification support…')

    await act(async () =>
      pendingDesktop.resolve({
        version: '1.2.3',
        startOnLogin: false,
        quickAccessShortcut: 'control-control',
      }),
    )
    expect(surface.textContent).toContain(
      'System notifications are not supported on this device.',
    )
    expect(surface.textContent).not.toContain('Open settings')
  })

  it('opens the operating system notification settings', async () => {
    const { capabilities, general } = fakeCapabilities()
    const surface = await renderGeneral(capabilities)
    const openSettings = [...surface.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === 'Open settings',
    )
    if (openSettings === undefined) {
      throw new Error('Open settings button was not rendered')
    }

    await act(async () => openSettings.click())

    expect(general.openSystemNotificationSettings).toHaveBeenCalledOnce()
  })

  it('disables asynchronous controls while saving and reports failures', async () => {
    const startupAttempt = deferred<Awaited<
      ReturnType<SettingsCapabilities['general']['setStartOnLogin']>
    >>()
    const notificationAttempt = deferred<undefined>()
    const { capabilities, general } = fakeCapabilities()
    general.setStartOnLogin.mockReturnValueOnce(startupAttempt.promise)
    general.openSystemNotificationSettings.mockReturnValueOnce(
      notificationAttempt.promise,
    )
    const surface = await renderGeneral(capabilities)
    const startup = surface.querySelector<HTMLButtonElement>(
      '[data-testid="start-on-login-switch"]',
    )
    if (startup === null) throw new Error('startup switch was not rendered')

    await act(async () => startup.click())
    expect(startup.disabled).toBe(true)

    await act(async () => startupAttempt.reject(new Error('Startup failed')))
    expect(startup.disabled).toBe(false)
    expect(surface.textContent).toContain('Startup failed')

    const openSettings = button('Open settings')
    await act(async () => openSettings.click())
    expect(button('Opening…').disabled).toBe(true)
    expect(surface.textContent).not.toContain('Startup failed')

    await act(async () =>
      notificationAttempt.reject(new Error('Notifications failed')),
    )
    expect(button('Open settings').disabled).toBe(false)
    expect(surface.textContent).toContain('Notifications failed')

    const retryStartup = deferred<Awaited<
      ReturnType<SettingsCapabilities['general']['setStartOnLogin']>
    >>()
    general.setStartOnLogin.mockReturnValueOnce(retryStartup.promise)
    await act(async () => startup.click())
    expect(surface.textContent).not.toContain('Notifications failed')
    await act(async () =>
      retryStartup.resolve({
        version: '1.2.3',
        startOnLogin: true,
        quickAccessShortcut: 'control-control',
      }),
    )
  })

  it('reports initial loading failures', async () => {
    const { capabilities, general } = fakeCapabilities()
    general.systemNotificationStatus.mockRejectedValueOnce(
      new Error('Status unavailable'),
    )

    const surface = await renderGeneral(capabilities)

    expect(surface.textContent).toContain('Status unavailable')
  })

  it('ignores a loading failure after capabilities are replaced', async () => {
    const staleStatus = deferred<Awaited<
      ReturnType<SettingsCapabilities['general']['systemNotificationStatus']>
    >>()
    const first = fakeCapabilities()
    first.general.systemNotificationStatus.mockReturnValueOnce(
      staleStatus.promise,
    )
    const surface = await renderGeneral(first.capabilities)
    const second = fakeCapabilities({ version: '2.0.0' })

    await act(async () => {
      rerenderGeneral(second.capabilities)
      await Promise.resolve()
    })
    await act(async () => {
      staleStatus.reject(new Error('stale status failure'))
      await Promise.resolve()
    })

    expect(surface.textContent).toContain('2.0.0')
    expect(surface.textContent).not.toContain('stale status failure')
  })

  it('ignores stale loads and uses replacement capabilities for actions', async () => {
    const staleDesktop = deferred<Awaited<
      ReturnType<SettingsCapabilities['general']['desktopSettings']>
    >>()
    const first = fakeCapabilities({ version: '1.0.0' })
    first.general.desktopSettings.mockReturnValueOnce(staleDesktop.promise)
    const surface = await renderGeneral(first.capabilities)
    const second = fakeCapabilities({ version: '2.0.0' })

    await act(async () => {
      rerenderGeneral(second.capabilities)
      await Promise.resolve()
    })
    expect(surface.textContent).toContain('2.0.0')

    await act(async () =>
      staleDesktop.resolve({
        version: 'stale',
        startOnLogin: false,
        quickAccessShortcut: 'control-control',
      }),
    )
    expect(surface.textContent).not.toContain('stale')

    await act(async () => {
      first.general.systemNotificationStatus.mockRejectedValueOnce(
        new Error('stale error'),
      )
      rerenderGeneral(first.capabilities)
      await Promise.resolve()
      rerenderGeneral(second.capabilities)
      await Promise.resolve()
    })
    expect(surface.textContent).not.toContain('stale error')

    const startup = surface.querySelector<HTMLButtonElement>(
      '[data-testid="start-on-login-switch"]',
    )
    if (startup === null) throw new Error('startup switch was not rendered')
    await act(async () => startup.click())
    await act(async () => button('Open settings').click())

    expect(first.general.setStartOnLogin).not.toHaveBeenCalled()
    expect(first.general.openSystemNotificationSettings).not.toHaveBeenCalled()
    expect(second.general.setStartOnLogin).toHaveBeenCalledWith(true)
    expect(second.general.openSystemNotificationSettings).toHaveBeenCalledOnce()
  })

  it('waits for menu-bar state and disables its switch while changes are pending', async () => {
    const loadingMenuBar = deferred<{ enabled: boolean; pending: boolean }>()
    const { capabilities, general } = fakeCapabilities()
    general.menuBarMode.mockReturnValueOnce(loadingMenuBar.promise)
    const surface = await renderGeneral(capabilities, { seedMenuBar: false })

    expect(surface.textContent).toContain('Loading general desktop settings…')

    await act(async () =>
      loadingMenuBar.resolve({ enabled: false, pending: true }),
    )
    await vi.waitFor(() => {
      expect(switchControl(surface).disabled).toBe(true)
    })

    general.menuBarMode.mockResolvedValueOnce({ enabled: false, pending: false })
    await act(async () => {
      rerenderGeneral(fakeCapabilities().capabilities)
      await Promise.resolve()
    })
    const beginAttempt = deferred<{
      attemptId: string
      deadlineMs: number
    }>()
    const active = fakeCapabilities()
    active.general.beginMenuBarOnly.mockReturnValueOnce(beginAttempt.promise)
    await act(async () => {
      rerenderGeneral(active.capabilities)
      await Promise.resolve()
    })
    await act(async () => switchControl(surface).click())
    expect(switchControl(surface).disabled).toBe(true)
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

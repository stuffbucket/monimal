import { act } from 'react'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PersistedMaterialPreference } from '../../shared/host'
import { createMaximalQueryClient } from '../query-client'
import type {
  SettingsCapabilities,
  TerminalTypographySettings,
} from './capabilities'
import {
  ShadersSection,
  ThemesSection,
} from './AppearanceSections'
import { GeneralSection } from './GeneralSection'
import { TerminalTypographySettings as TerminalAppearanceSettings } from './general/TerminalTypographySettings'
import { appearancePreferenceQueryKey } from './general/useAppearancePreference'
import { menuBarModeQueryKey } from './general/useMenuBarPresence'
import { materialPreferenceQueryKey } from '../useMaterialPreference'

vi.mock('./general/TerminalTypographyPreview', () => ({
  TerminalTypographyPreview: () => (
    <div aria-label="Live terminal typography preview" />
  ),
}))

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

class NoopResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = NoopResizeObserver

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
    material: vi.fn(async () => ({
      preset: 'clouds' as const,
      quality: 'balanced' as const,
      strength: 0.75,
      motion: 0.5,
      lighting: 'fixed' as const,
      timezone: 'UTC',
    })),
    setMaterial: vi.fn(
      async (preference: PersistedMaterialPreference) => preference,
    ),
    onMaterialChange: vi.fn(() => () => {}),
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
  const initialTypography = {
    fontFamily: 'JetBrainsMono Nerd Font',
    fontSize: 13,
    fontWeight: 400 as const,
    fontVariations: {},
    cellHeight: 0,
    tracking: 0,
    baseline: 0,
    thicken: false,
    thickenStrength: 50,
    ligatures: true,
    fontFeatures: {},
  }
  const terminalTypography = {
    get: vi.fn(async () => initialTypography),
    update: vi.fn(async (settings: TerminalTypographySettings) => settings),
    fonts: vi.fn(async () => ({
      status: 'available' as const,
      fonts: ['FiraCode Nerd Font', 'JetBrainsMono Nerd Font'],
      fontWeights: {
        'FiraCode Nerd Font': [300, 400, 500, 600, 700],
        'JetBrainsMono Nerd Font': [400, 700],
      },
      fontAxes: {
        'JetBrainsMono Nerd Font': [
          { tag: 'wght', minimum: 100, default: 400, maximum: 900 },
          { tag: 'WONK', minimum: 0, default: 0, maximum: 1 },
          { tag: 'GRAD', minimum: -100, default: 0, maximum: 150 },
        ],
      },
      downloads: [{
        id: 'intel-one-mono',
        label: 'Intel One Mono',
        family: 'IntoneMono Nerd Font Mono',
        installed: false,
        downloadSize: 32_279_622,
        license: 'OFL-1.1',
        sourceUrl: 'https://github.com/intel/intel-one-mono',
      }],
      ghosttyPath: '/Applications/Ghostty.app/Contents/MacOS/ghostty',
    })),
    installFont: vi.fn(async () => ({
      status: 'available' as const,
      fonts: [
        'FiraCode Nerd Font',
        'IntoneMono Nerd Font Mono',
        'JetBrainsMono Nerd Font',
      ],
      fontWeights: {
        'FiraCode Nerd Font': [300, 400, 500, 600, 700],
        'IntoneMono Nerd Font Mono': [300, 400, 500, 600, 700],
        'JetBrainsMono Nerd Font': [400, 700],
      },
      downloads: [{
        id: 'intel-one-mono',
        label: 'Intel One Mono',
        family: 'IntoneMono Nerd Font Mono',
        installed: true,
        downloadSize: 32_279_622,
        license: 'OFL-1.1',
        sourceUrl: 'https://github.com/intel/intel-one-mono',
      }],
      ghosttyPath: '/Applications/Ghostty.app/Contents/MacOS/ghostty',
    })),
    openPreview: vi.fn(async () => {}),
    subscribe: vi.fn(() => () => {}),
  }
  return {
    capabilities: {
      general,
      terminalTypography,
    } as unknown as SettingsCapabilities,
    general,
    terminalTypography,
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
  optionsOrSurface:
    | { seedMenuBar?: boolean }
    | 'interaction'
    | 'shaders'
    | 'themes'
    | 'typography'
    | 'palette' = 'interaction',
): Promise<HTMLElement> {
  if (root === null || container === null) throw new Error('test root not ready')
  const client = createMaximalQueryClient()
  queryClient = client
  client.setQueryData(
    appearancePreferenceQueryKey,
    await capabilities.general.appearance(),
  )
  client.setQueryData(
    materialPreferenceQueryKey,
    await capabilities.general.material(),
  )
  const surface = typeof optionsOrSurface === 'string'
    ? optionsOrSurface
    : 'interaction'
  const options = typeof optionsOrSurface === 'string'
    ? {}
    : optionsOrSurface
  if (options.seedMenuBar !== false) {
    client.setQueryData(
      menuBarModeQueryKey,
      await capabilities.general.menuBarMode(),
    )
  }
  await act(async () => {
    root?.render(
      <QueryClientProvider client={client}>
        {surface === 'interaction'
          ? <GeneralSection capabilities={capabilities} />
          : surface === 'shaders'
            ? <ShadersSection capabilities={capabilities} />
            : surface === 'themes'
              ? <ThemesSection />
              : (
              <TerminalAppearanceSettings
                capabilities={capabilities.terminalTypography}
                surface={surface}
              />
                )}
      </QueryClientProvider>,
    )
    await Promise.resolve()
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

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function setSelectValue(select: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    'value',
  )?.set
  setter?.call(select, value)
  select.dispatchEvent(new Event('change', { bubbles: true }))
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
    const surface = await renderGeneral(capabilities, 'themes')

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
    const surface = await renderGeneral(capabilities, 'shaders')

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
    const surface = await renderGeneral(capabilities, 'shaders')

    expect(surface.textContent).toContain('Native vibrancy is available on macOS.')
    expect(vibrancyControl(surface).disabled).toBe(true)
  })

  it('updates background and reduced-motion preferences', async () => {
    const { capabilities, general } = fakeCapabilities()
    const surface = await renderGeneral(capabilities, 'shaders')

    await act(async () => {
      effectControl(surface, 'background-effects-switch').click()
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(general.setBackgroundEffectsEnabled).toHaveBeenCalledWith(true)

    await act(async () =>
      effectControl(surface, 'reduced-motion-switch').click(),
    )
    expect(general.setReducedMotionEnabled).toHaveBeenCalledWith(true)
  })

  it('persists bounded material, quality, motion, and solar controls', async () => {
    const { capabilities, general } = fakeCapabilities()
    const surface = await renderGeneral(capabilities, 'shaders')

    expect(
      surface.querySelector<HTMLSelectElement>('[data-testid="material-preset"]')
        ?.disabled,
    ).toBe(true)
    await act(async () => {
      effectControl(surface, 'background-effects-switch').click()
      await vi.advanceTimersByTimeAsync(0)
    })
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
      await vi.advanceTimersByTimeAsync(0)
    })
    await act(async () => {
      lighting.value = 'timezone'
      lighting.dispatchEvent(new Event('change', { bubbles: true }))
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(surface.querySelector('[data-testid="material-timezone"]')).not.toBeNull()
    expect(surface.querySelector('[data-testid="material-latitude"]')).not.toBeNull()
    expect(surface.querySelector('[data-testid="material-longitude"]')).not.toBeNull()
    expect(general.setMaterial).toHaveBeenLastCalledWith(
      expect.objectContaining({ preset: 'water', lighting: 'timezone' }),
    )
  })

  it('disables visual controls while an appearance update is pending', async () => {
    const { capabilities, general } = fakeCapabilities()
    let finish!: (value: Awaited<ReturnType<typeof general.setBackgroundEffectsEnabled>>) => void
    general.setBackgroundEffectsEnabled.mockImplementationOnce(
      () => new Promise((resolve) => {
        finish = resolve
      }),
    )
    const surface = await renderGeneral(capabilities, 'shaders')

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

  it('keeps desktop behavior in Interaction settings', async () => {
    const { capabilities } = fakeCapabilities()
    const surface = await renderGeneral(capabilities)

    expect(surface.querySelector('h1')).toBeNull()
    expect([...surface.querySelectorAll('h2')].map(({ textContent }) => textContent)).toEqual([
      'Desktop app',
      'Notifications',
    ])
    expect(surface.querySelectorAll('.settings__group')).toHaveLength(2)
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

  it('offers Ghostty-discovered Nerd Fonts and persists typography changes', async () => {
    const { capabilities, terminalTypography } = fakeCapabilities()
    const surface = await renderGeneral(capabilities, 'typography')
    const family = surface.querySelector<HTMLSelectElement>(
      '[data-testid="terminal-font-family"]',
    )
    const spacingSection = surface.querySelector<HTMLButtonElement>(
      '[data-testid="terminal-typography-section-spacing"]',
    )

    expect(surface.textContent).toContain('Terminal Typography')
    expect(surface.querySelector('[data-testid="terminal-font-size-slider"]')).toBeNull()
    expect(surface.querySelector<HTMLInputElement>('[data-testid="terminal-font-size"]')?.value)
      .toBe('13')
    const weight = surface.querySelector<HTMLInputElement>(
      '[data-testid="terminal-font-weight"]',
    )
    const style = surface.querySelector<HTMLSelectElement>(
      '[data-testid="terminal-font-style"]',
    )
    expect(weight?.min).toBe('50')
    expect(weight?.max).toBe('1000')
    expect(weight?.step).toBe('25')
    expect([...style?.options ?? []].map(({ text }) => text)).toEqual([
      'Regular',
      'Bold',
    ])
    expect(surface.textContent).not.toContain('Apply variable')
    expect(surface.querySelector<HTMLInputElement>(
      '[data-testid="terminal-cell-height"]',
    )).not.toBeNull()
    expect(surface.querySelector<HTMLInputElement>(
      '[data-testid="terminal-tracking"]',
    )).not.toBeNull()
    const lineHeight = surface.querySelector<HTMLInputElement>(
      '[data-testid="terminal-cell-height"]',
    )
    const lineHeightUnit = surface.querySelector<HTMLSelectElement>(
      '[data-testid="terminal-cell-height-unit"]',
    )
    expect(lineHeight?.value).toBe('')
    expect(lineHeight?.placeholder).toBe('Auto')
    expect(lineHeightUnit?.value).toBe('percent')
    expect(spacingSection).not.toBeNull()
    expect(surface.querySelector('[data-testid="terminal-color-mode"]'))
      .toBeNull()
    expect(surface.querySelector('[data-testid="terminal-background-opacity"]'))
      .toBeNull()
    expect(surface.querySelector('[data-testid="terminal-background-blur"]'))
      .toBeNull()
    expect(surface.querySelector('[data-testid="terminal-window-tint"]'))
      .toBeNull()
    expect(surface.querySelector('[data-testid="terminal-tint-blend-mode"]'))
      .toBeNull()
    expect(surface.querySelector('[data-testid="terminal-tone"]'))
      .toBeNull()
    expect(surface.querySelector('[data-testid="terminal-palette-stamp"]'))
      .toBeNull()
    expect(surface.querySelector('[data-testid="terminal-font-axis-WONK"]'))
      .not.toBeNull()
    expect(surface.querySelector('[data-testid="terminal-font-axis-GRAD"]'))
      .not.toBeNull()
    expect(surface.querySelector('[data-testid="terminal-font-axis-wght"]'))
      .toBeNull()
    expect(surface.textContent).toContain('Wonky')
    expect(surface.querySelector('[data-testid="terminal-thicken"]')).toBeNull()
    expect(surface.textContent).not.toContain('Open live preview')
    expect(surface.querySelector('[aria-label="Live terminal typography preview"]'))
      .not.toBeNull()
    expect(surface.querySelector('.terminal-typography-group__fields--font'))
      .not.toBeNull()
    expect([...family?.options ?? []].map(({ text }) => text)).toEqual([
      'System monospace (recommended)',
      'FiraCode Nerd Font',
      'JetBrainsMono Nerd Font',
    ])
    await act(async () => {
      if (style !== null) setSelectValue(style, '700')
      await Promise.resolve()
    })
    expect(terminalTypography.update.mock.lastCall?.[0]).toMatchObject({
      fontWeight: 700,
    })
    await act(async () => {
      if (weight !== null) {
        weight.focus()
        setInputValue(weight, '525')
        weight.blur()
        await Promise.resolve()
      }
    })
    expect(terminalTypography.update.mock.lastCall?.[0]).toMatchObject({
      fontWeight: 525,
    })
    await act(async () => {
      if (lineHeight !== null) {
        lineHeight.focus()
        setInputValue(lineHeight, '1.2em')
        lineHeight.blur()
        await Promise.resolve()
      }
    })
    expect(terminalTypography.update.mock.lastCall?.[0].cellHeight)
      .toBeCloseTo(20)
    expect(lineHeightUnit?.value).toBe('em')
    expect(localStorage.getItem('maximal.typeface.terminal.line-height'))
      .toBe('em|manual')
    await act(async () => {
      if (lineHeight !== null) {
        lineHeight.focus()
        setInputValue(lineHeight, '')
        lineHeight.blur()
        await Promise.resolve()
      }
    })
    expect(terminalTypography.update.mock.lastCall?.[0].cellHeight).toBe(0)
    expect(lineHeight?.placeholder).toBe('Auto')
    act(() => {
      spacingSection?.click()
    })
    expect(surface.querySelector('.terminal-typography-group__fields--spacing'))
      .not.toBeNull()
    expect(surface.querySelector('[data-testid="terminal-tracking"]')).toBeNull()
    expect(surface.querySelector('[data-testid="terminal-baseline"]')).not.toBeNull()
    act(() => {
      surface.querySelector<HTMLButtonElement>(
        '[data-testid="terminal-typography-section-rendering"]',
      )?.click()
    })
    expect(surface.querySelector(
      '[data-testid="terminal-thicken-strength"] [role="slider"]',
    )?.getAttribute('aria-valuenow')).toBe('0')
    act(() => {
      surface.querySelector<HTMLButtonElement>(
        '[data-testid="terminal-typography-section-features"]',
      )?.click()
    })
    const standardLigatures = surface.querySelector<HTMLButtonElement>(
      '[data-testid="terminal-font-feature-liga"]',
    )
    const contextualAlternates = surface.querySelector<HTMLButtonElement>(
      '[data-testid="terminal-font-feature-calt"]',
    )
    expect(surface.querySelectorAll('.terminal-typography-features [role="switch"]'))
      .toHaveLength(18)
    await act(async () => standardLigatures?.click())
    expect(terminalTypography.update.mock.lastCall?.[0]).toMatchObject({
      ligatures: true,
      fontFeatures: { liga: false },
    })
    await act(async () => contextualAlternates?.click())
    expect(terminalTypography.update.mock.lastCall?.[0]).toMatchObject({
      ligatures: false,
      fontFeatures: { liga: false, calt: false },
    })
  })

  it('persists terminal palette modes, colors, and effect switches', async () => {
    const { capabilities, terminalTypography } = fakeCapabilities()
    const surface = await renderGeneral(capabilities, 'palette')
    const mode = surface.querySelector<HTMLSelectElement>(
      '[data-testid="terminal-color-mode"]',
    )
    const compensate = surface.querySelector<HTMLButtonElement>(
      '[data-testid="terminal-palette-compensate"]',
    )
    const stamp = surface.querySelector<HTMLButtonElement>(
      '[data-testid="terminal-palette-stamp"]',
    )
    const minimumContrast = surface.querySelector<HTMLElement>(
      '[data-testid="terminal-minimum-contrast"] [role="slider"]',
    )

    expect(mode).not.toBeNull()
    expect(compensate).not.toBeNull()
    expect(stamp).not.toBeNull()
    expect(minimumContrast?.hasAttribute('data-disabled')).toBe(false)

    await act(async () => {
      if (mode !== null) {
        mode.value = 'dark'
        mode.dispatchEvent(new Event('change', { bubbles: true }))
      }
      await Promise.resolve()
    })
    expect(terminalTypography.update.mock.lastCall?.[0].palette?.mode).toBe('dark')

    const editing = surface.querySelector<HTMLSelectElement>(
      '[data-testid="terminal-palette-editing"]',
    )
    await act(async () => {
      if (editing !== null) setSelectValue(editing, 'light')
      await Promise.resolve()
    })
    const background = surface.querySelector<HTMLButtonElement>(
      '[data-testid="terminal-palette-light-background"]',
    )
    expect(background).not.toBeNull()
    await act(async () => background?.click())
    const backgroundHex = document.querySelector<HTMLInputElement>(
      '[data-testid="terminal-palette-light-background-hex"]',
    )
    expect(backgroundHex).not.toBeNull()
    expect(document.querySelector(
      '[data-testid="terminal-palette-light-background-close"]',
    )).not.toBeNull()
    await act(async () => {
      if (backgroundHex !== null) setInputValue(backgroundHex, '#123456')
      await Promise.resolve()
    })
    await act(async () => {
      backgroundHex?.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
      }))
      await Promise.resolve()
    })
    expect(
      terminalTypography.update.mock.lastCall?.[0].palette?.light.background,
    ).toBe('#123456')

    await act(async () => {
      document.querySelector<HTMLButtonElement>(
        '[data-testid="terminal-palette-light-background-close"]',
      )?.click()
      await Promise.resolve()
    })
    expect(document.querySelector(
      '[data-testid="terminal-palette-light-background-dialog"]',
    )).toBeNull()

    await act(async () => background?.click())
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }))
      await Promise.resolve()
    })
    expect(document.querySelector(
      '[data-testid="terminal-palette-light-background-dialog"]',
    )).toBeNull()

    await act(async () => {
      compensate?.click()
      await Promise.resolve()
    })
    expect(terminalTypography.update.mock.lastCall?.[0].palette?.effects.compensate)
      .toBe(false)
    expect(minimumContrast?.hasAttribute('data-disabled')).toBe(true)

    await act(async () => {
      stamp?.click()
      await Promise.resolve()
    })
    expect(terminalTypography.update.mock.lastCall?.[0].palette?.effects.stamp)
      .toBe(true)
  })

  it('keeps controls interactive while serializing typography saves', async () => {
    const { capabilities, terminalTypography } = fakeCapabilities()
    let finishFirst: ((settings: TerminalTypographySettings) => void) | undefined
    terminalTypography.update.mockImplementationOnce((settings) =>
      new Promise<TerminalTypographySettings>((resolve) => {
        finishFirst = () => resolve(settings)
      }))
    const surface = await renderGeneral(capabilities, 'typography')
    const section = surface.querySelector<HTMLButtonElement>(
      '[data-testid="terminal-typography-section-features"]',
    )
    act(() => {
      section?.click()
    })
    const standardLigatures = surface.querySelector<HTMLButtonElement>(
      '[data-testid="terminal-font-feature-liga"]',
    )
    const contextualAlternates = surface.querySelector<HTMLButtonElement>(
      '[data-testid="terminal-font-feature-calt"]',
    )

    act(() => standardLigatures?.click())
    act(() => contextualAlternates?.click())
    await act(async () => Promise.resolve())

    expect(section?.disabled).toBe(false)
    expect(standardLigatures?.getAttribute('aria-checked')).toBe('false')
    expect(contextualAlternates?.getAttribute('aria-checked')).toBe('false')
    expect(terminalTypography.update).toHaveBeenCalledTimes(1)

    await act(async () => {
      finishFirst?.(terminalTypography.update.mock.calls[0][0])
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(terminalTypography.update).toHaveBeenCalledTimes(2)
    expect(terminalTypography.update.mock.calls[1]?.[0]).toMatchObject({
      ligatures: false,
      fontFeatures: { liga: false, calt: false },
    })
  })

  it('installs curated Nerd Fonts and refreshes the family options', async () => {
    const { capabilities, terminalTypography } = fakeCapabilities()
    const surface = await renderGeneral(capabilities, 'typography')

    await act(async () => button('Install').click())

    expect(terminalTypography.installFont).toHaveBeenCalledWith('intel-one-mono')
    const family = surface.querySelector<HTMLSelectElement>(
      '[data-testid="terminal-font-family"]',
    )
    expect([...family?.options ?? []].map(({ text }) => text)).toContain(
      'Intel One Mono',
    )
    expect(button('Installed').disabled).toBe(true)
    expect(surface.textContent)
      .toContain('Intel One Mono is installed and available in Family.')
  })

  it('collapses undivided font specimens and reports installation failures above them', async () => {
    const { capabilities, terminalTypography } = fakeCapabilities()
    terminalTypography.installFont.mockRejectedValueOnce(
      new Error(
        "Error invoking remote method 'maximal:native/terminal-typography-install-font': Error: Download failed.",
      ),
    )
    const surface = await renderGeneral(capabilities, 'typography')
    const disclosure = surface.querySelector<HTMLDetailsElement>(
      '.terminal-font-downloads details',
    )

    expect(disclosure?.open).toBe(false)
    expect(surface.querySelectorAll('.terminal-font-specimen')).toHaveLength(1)
    expect(surface.querySelectorAll('.terminal-font-ramp')).toHaveLength(0)
    expect(surface.querySelector('.terminal-font-downloads .settings__group')
      ?.getAttribute('data-dividers')).toBe('false')

    await act(async () => button('Install').click())

    const banner = [...surface.querySelectorAll('.banner')].find(
      (candidate) => candidate.textContent?.includes('Font installation failed'),
    )
    const downloads = surface.querySelector('.terminal-font-downloads')
    expect(banner?.textContent).toContain('Download failed.')
    expect(banner?.textContent).not.toContain('Error invoking remote method')
    expect(
      banner !== undefined
      && downloads !== null
      && (banner.compareDocumentPosition(downloads) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    ).toBe(true)
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

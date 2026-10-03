import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TERMINAL_PALETTE_SETTINGS } from '@maximal/maximal-terminal/renderer'

import { readAppearance } from './appearance'
import type { SettingsCapabilities } from './settings/capabilities'
import { createPreviewSettingsCapabilities } from './settings/ui-preview-capabilities'
import {
  previewTheme,
  restoreTheme,
} from './theme-application'
import { builtInTheme } from './themes/catalog'

function requiredTheme(id: string) {
  const theme = builtInTheme(id)
  if (theme === undefined) throw new Error(`Missing test theme: ${id}`)
  return theme
}

async function initializePalette(
  capabilities: SettingsCapabilities,
) {
  const typography = await capabilities.terminalTypography.get()
  await capabilities.terminalTypography.update({
    ...typography,
    palette: DEFAULT_TERMINAL_PALETTE_SETTINGS,
  })
  return capabilities.terminalTypography.get()
}

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
  } catch (error) {
    if (error instanceof Error) return error
    throw new Error('Expected the operation to reject with an Error.', {
      cause: error,
    })
  }
  throw new Error('Expected the operation to reject.')
}

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('theme application', () => {
  it('previews shader themes and returns the complete previous snapshot', async () => {
    const capabilities = createPreviewSettingsCapabilities()
    const current = requiredTheme('maximal')
    const next = requiredTheme('maximized')
    const typography = await initializePalette(capabilities)
    const appearance = await capabilities.general.appearance()
    const material = await capabilities.general.material()
    const updateTypography = vi.spyOn(capabilities.terminalTypography, 'update')
    const setMaterial = vi.spyOn(capabilities.general, 'setMaterial')
    const setEffects = vi.spyOn(capabilities.general, 'setBackgroundEffectsEnabled')

    const previous = await previewTheme(capabilities, current, next)

    expect(previous).toMatchObject({
      theme: current,
      appearance: {
        vibrancyEnabled: appearance.vibrancyEnabled,
        backgroundEffectsEnabled: appearance.backgroundEffectsEnabled,
        reducedMotionEnabled: appearance.reducedMotionEnabled,
      },
      material,
      terminalPalette: typography.palette,
    })
    expect(new Date(previous.selectedAt).toISOString()).toBe(previous.selectedAt)
    expect(readAppearance().theme).toEqual(next)
    expect(updateTypography.mock.calls[0]?.[0].palette?.dark).toMatchObject({
      background: next.colors.dark.background,
      foreground: next.colors.dark.text,
      cursor: next.colors.dark.accent,
    })
    expect(setMaterial).toHaveBeenCalledWith({
      ...material,
      preset: 'candy-paint',
      strength: 0.82,
      motion: 0.35,
    })
    expect(setEffects).toHaveBeenCalledWith(true)
  })

  it('turns effects off for themes without shaders', async () => {
    const capabilities = createPreviewSettingsCapabilities()
    const setMaterial = vi.spyOn(capabilities.general, 'setMaterial')
    const setEffects = vi.spyOn(capabilities.general, 'setBackgroundEffectsEnabled')

    await previewTheme(
      capabilities,
      requiredTheme('maximized'),
      requiredTheme('maximal'),
    )

    expect(setMaterial).not.toHaveBeenCalled()
    expect(setEffects).toHaveBeenCalledExactlyOnceWith(false)
  })

  it('rolls back every captured setting when preview fails', async () => {
    const capabilities = createPreviewSettingsCapabilities()
    const current = requiredTheme('maximal')
    const typography = await initializePalette(capabilities)
    const updateTypography = vi.spyOn(capabilities.terminalTypography, 'update')
      .mockRejectedValueOnce(new Error('terminal unavailable'))
      .mockResolvedValueOnce(typography)
    const setMaterial = vi.spyOn(capabilities.general, 'setMaterial')
    const setVibrancy = vi.spyOn(capabilities.general, 'setVibrancyEnabled')
    const setEffects = vi.spyOn(capabilities.general, 'setBackgroundEffectsEnabled')
    const setReducedMotion = vi.spyOn(capabilities.general, 'setReducedMotionEnabled')

    const error = await rejection(previewTheme(
      capabilities,
      current,
      requiredTheme('maximized'),
    ))

    expect(error.message).toBe('Theme preview failed: terminal unavailable')
    expect(error.cause).toEqual(new Error('terminal unavailable'))
    expect(readAppearance().theme).toEqual(current)
    expect(updateTypography).toHaveBeenCalledTimes(2)
    expect(setMaterial).toHaveBeenCalledOnce()
    expect(setVibrancy).toHaveBeenCalledWith(false)
    expect(setEffects).toHaveBeenCalledWith(false)
    expect(setReducedMotion).toHaveBeenCalledWith(false)
  })

  it('reports both failures when preview rollback also fails', async () => {
    const capabilities = createPreviewSettingsCapabilities()
    await initializePalette(capabilities)
    vi.spyOn(capabilities.terminalTypography, 'update')
      .mockRejectedValueOnce(new Error('preview failed'))
      .mockRejectedValueOnce(new Error('rollback failed'))

    const error = await rejection(previewTheme(
      capabilities,
      requiredTheme('maximal'),
      requiredTheme('maximized'),
    ))

    expect(error.message).toBe(
      'Theme preview failed and rollback could not be completed: rollback failed. Original failure: preview failed',
    )
    expect(error.cause).toEqual(new Error('rollback failed'))
  })

  it('reports non-Error preview and rollback failures explicitly', async () => {
    const capabilities = createPreviewSettingsCapabilities()
    await initializePalette(capabilities)
    vi.spyOn(capabilities.terminalTypography, 'update')
      .mockRejectedValueOnce('preview value')
      .mockRejectedValueOnce('rollback value')

    const error = await rejection(previewTheme(
      capabilities,
      requiredTheme('maximal'),
      requiredTheme('maximized'),
    ))

    expect(error.message).toBe(
      'Theme preview failed and rollback could not be completed: unknown rollback error. Original failure: unknown theme preview error',
    )
    expect(error.cause).toBe('rollback value')
  })

  it('retains a non-Error preview failure as the cause after rollback', async () => {
    const capabilities = createPreviewSettingsCapabilities()
    const typography = await initializePalette(capabilities)
    vi.spyOn(capabilities.terminalTypography, 'update')
      .mockRejectedValueOnce('preview value')
      .mockResolvedValueOnce(typography)

    const error = await rejection(previewTheme(
      capabilities,
      requiredTheme('maximal'),
      requiredTheme('maximized'),
    ))

    expect(error.message).toBe('The theme could not be previewed.')
    expect(error.cause).toBe('preview value')
  })

  it('restores a complete snapshot and returns the displaced settings', async () => {
    const capabilities = createPreviewSettingsCapabilities()
    const current = requiredTheme('maximized')
    const restored = requiredTheme('maximal')
    const typography = await capabilities.terminalTypography.get()
    const material = await capabilities.general.material()
    const snapshot = {
      theme: restored,
      terminalPalette: typography.palette,
      appearance: {
        vibrancyEnabled: true,
        backgroundEffectsEnabled: true,
        reducedMotionEnabled: true,
      },
      material: {
        ...material,
        preset: 'candy-paint' as const,
      },
      selectedAt: '2026-01-01T00:00:00.000Z',
    }
    const setMaterial = vi.spyOn(capabilities.general, 'setMaterial')
    const setVibrancy = vi.spyOn(capabilities.general, 'setVibrancyEnabled')
    const setEffects = vi.spyOn(capabilities.general, 'setBackgroundEffectsEnabled')
    const setReducedMotion = vi.spyOn(capabilities.general, 'setReducedMotionEnabled')

    const displaced = await restoreTheme(capabilities, current, snapshot)

    expect(displaced.theme).toEqual(current)
    expect(readAppearance().theme).toEqual(restored)
    expect(setMaterial).toHaveBeenCalledWith(snapshot.material)
    expect(setVibrancy).toHaveBeenCalledWith(true)
    expect(setEffects).toHaveBeenCalledWith(true)
    expect(setReducedMotion).toHaveBeenCalledWith(true)
  })

  it('rolls back a failed restore and reports the original failure', async () => {
    const capabilities = createPreviewSettingsCapabilities()
    const current = requiredTheme('maximized')
    const setMaterial = vi.spyOn(capabilities.general, 'setMaterial')
      .mockRejectedValueOnce(new Error('material unavailable'))
      .mockResolvedValueOnce(await capabilities.general.material())

    const error = await rejection(restoreTheme(capabilities, current, {
      theme: requiredTheme('maximal'),
      material: {
        ...await capabilities.general.material(),
        preset: 'candy-paint',
      },
      selectedAt: '2026-01-01T00:00:00.000Z',
    }))

    expect(error.message).toBe('Theme restore failed: material unavailable')
    expect(error.cause).toEqual(new Error('material unavailable'))
    expect(readAppearance().theme).toEqual(current)
    expect(setMaterial).toHaveBeenCalledTimes(2)
  })

  it('reports both restore and rollback failures', async () => {
    const capabilities = createPreviewSettingsCapabilities()
    vi.spyOn(capabilities.general, 'setMaterial')
      .mockRejectedValueOnce(new Error('restore failed'))
      .mockRejectedValueOnce(new Error('rollback failed'))

    const error = await rejection(restoreTheme(
      capabilities,
      requiredTheme('maximized'),
      {
        theme: requiredTheme('maximal'),
        material: {
          ...await capabilities.general.material(),
          preset: 'candy-paint',
        },
        selectedAt: '2026-01-01T00:00:00.000Z',
      },
    ))

    expect(error.message).toBe(
      'Theme restore failed and rollback could not be completed: rollback failed. Original failure: restore failed',
    )
    expect(error.cause).toEqual(new Error('rollback failed'))
  })

  it('reports non-Error restore and rollback failures explicitly', async () => {
    const capabilities = createPreviewSettingsCapabilities()
    vi.spyOn(capabilities.general, 'setMaterial')
      .mockRejectedValueOnce('restore value')
      .mockRejectedValueOnce('rollback value')

    const error = await rejection(restoreTheme(
      capabilities,
      requiredTheme('maximized'),
      {
        theme: requiredTheme('maximal'),
        material: {
          ...await capabilities.general.material(),
          preset: 'candy-paint',
        },
        selectedAt: '2026-01-01T00:00:00.000Z',
      },
    ))

    expect(error.message).toBe(
      'Theme restore failed and rollback could not be completed: unknown rollback error. Original failure: unknown theme restore error',
    )
    expect(error.cause).toBe('rollback value')
  })

  it('retains a non-Error restore failure as the cause after rollback', async () => {
    const capabilities = createPreviewSettingsCapabilities()
    vi.spyOn(capabilities.general, 'setMaterial')
      .mockRejectedValueOnce('restore value')
      .mockResolvedValueOnce(await capabilities.general.material())

    const error = await rejection(restoreTheme(
      capabilities,
      requiredTheme('maximized'),
      {
        theme: requiredTheme('maximal'),
        material: {
          ...await capabilities.general.material(),
          preset: 'candy-paint',
        },
        selectedAt: '2026-01-01T00:00:00.000Z',
      },
    ))

    expect(error.message).toBe('The earlier theme could not be restored.')
    expect(error.cause).toBe('restore value')
  })
})

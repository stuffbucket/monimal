import {
  DEFAULT_TERMINAL_PALETTE_SETTINGS,
} from '@maximal/maximal-terminal/renderer'

import type { SettingsCapabilities } from './settings/capabilities'
import {
  saveAppearance,
  terminalPaletteForTheme,
  type AppearanceThemeFile,
  type ThemeableSettingsSnapshot,
} from './appearance'
import { snapshotAppearance } from './theme-history'

type TerminalTypography = Awaited<
  ReturnType<SettingsCapabilities['terminalTypography']['get']>
>

interface CapturedThemeSettings {
  snapshot: ThemeableSettingsSnapshot
  typography: TerminalTypography
  material: Awaited<ReturnType<SettingsCapabilities['general']['material']>>
}

async function captureThemeSettings(
  capabilities: SettingsCapabilities,
  theme: AppearanceThemeFile,
): Promise<CapturedThemeSettings> {
  const [typography, appearancePreference, material] = await Promise.all([
    capabilities.terminalTypography.get(),
    capabilities.general.appearance(),
    capabilities.general.material(),
  ])
  return {
    typography,
    material,
    snapshot: {
      theme,
      ...(typography.palette === undefined
        ? {}
        : { terminalPalette: typography.palette }),
      appearance: snapshotAppearance(appearancePreference),
      material,
      selectedAt: new Date().toISOString(),
    },
  }
}

async function applyThemeSnapshot(
  capabilities: SettingsCapabilities,
  snapshot: ThemeableSettingsSnapshot,
  typography: TerminalTypography,
): Promise<void> {
  saveAppearance(snapshot.theme)
  if (snapshot.terminalPalette !== undefined) {
    await capabilities.terminalTypography.update({
      ...typography,
      palette: snapshot.terminalPalette,
    })
  }
  if (snapshot.material !== undefined) {
    await capabilities.general.setMaterial(snapshot.material)
  }
  if (snapshot.appearance !== undefined) {
    await capabilities.general.setVibrancyEnabled(
      snapshot.appearance.vibrancyEnabled,
    )
    await capabilities.general.setBackgroundEffectsEnabled(
      snapshot.appearance.backgroundEffectsEnabled,
    )
    await capabilities.general.setReducedMotionEnabled(
      snapshot.appearance.reducedMotionEnabled,
    )
  }
}

export async function previewTheme(
  capabilities: SettingsCapabilities,
  currentTheme: AppearanceThemeFile,
  nextTheme: AppearanceThemeFile,
): Promise<ThemeableSettingsSnapshot> {
  const previous = await captureThemeSettings(capabilities, currentTheme)
  try {
    saveAppearance(nextTheme)
    const palette = terminalPaletteForTheme(
      nextTheme,
      previous.typography.palette ?? DEFAULT_TERMINAL_PALETTE_SETTINGS,
    )
    await capabilities.terminalTypography.update({
      ...previous.typography,
      palette,
    })
    if (nextTheme.shader === undefined) {
      await capabilities.general.setBackgroundEffectsEnabled(false)
    } else {
      await capabilities.general.setMaterial({
        ...previous.material,
        preset: nextTheme.shader.material,
        strength: nextTheme.shader.strength,
        motion: nextTheme.shader.motion,
      })
      await capabilities.general.setBackgroundEffectsEnabled(true)
    }
    return previous.snapshot
  } catch (error) {
    try {
      await applyThemeSnapshot(capabilities, previous.snapshot, previous.typography)
    } catch (rollbackError) {
      throw new Error(`Theme preview failed and rollback could not be completed: ${
        rollbackError instanceof Error
          ? rollbackError.message
          : 'unknown rollback error'
      }. Original failure: ${
        error instanceof Error ? error.message : 'unknown theme preview error'
      }`, { cause: rollbackError })
    }
    throw new Error(
      error instanceof Error
        ? `Theme preview failed: ${error.message}`
        : 'The theme could not be previewed.',
      { cause: error },
    )
  }
}

export async function restoreTheme(
  capabilities: SettingsCapabilities,
  currentTheme: AppearanceThemeFile,
  snapshot: ThemeableSettingsSnapshot,
): Promise<ThemeableSettingsSnapshot> {
  const current = await captureThemeSettings(capabilities, currentTheme)
  try {
    await applyThemeSnapshot(capabilities, snapshot, current.typography)
    return current.snapshot
  } catch (error) {
    try {
      await applyThemeSnapshot(capabilities, current.snapshot, current.typography)
    } catch (rollbackError) {
      throw new Error(`Theme restore failed and rollback could not be completed: ${
        rollbackError instanceof Error
          ? rollbackError.message
          : 'unknown rollback error'
      }. Original failure: ${
        error instanceof Error ? error.message : 'unknown theme restore error'
      }`, { cause: rollbackError })
    }
    throw new Error(
      error instanceof Error
        ? `Theme restore failed: ${error.message}`
        : 'The earlier theme could not be restored.',
      { cause: error },
    )
  }
}

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  readTerminalTheme,
  resolveTerminalAppearance,
  type GhosttyWindowAdjustment,
  type TerminalTheme,
  type TerminalTypography,
} from '@maximal/maximal-terminal/renderer'

import type { SettingsCapabilities } from '../settings/capabilities'
import { TERMINAL_THICKEN_DEFAULT } from '../../shared/host'

export type TerminalTypographySource = Pick<
  SettingsCapabilities['terminalTypography'],
  'get' | 'subscribe'
>

/** The renderer's custom properties that supply the emulator's literal colours. */
export interface TerminalThemeProperties {
  background: string
  foreground: string
  cursor: string
}

export interface TerminalPresentation {
  typography: TerminalTypography
  typographyError: boolean
  appearance: { theme: TerminalTheme; window: GhosttyWindowAdjustment }
}

const GHOSTTY_WINDOW = {
  paddingX: 8,
  paddingY: 6,
  balance: true,
  opacity: 1,
  blur: 0,
} satisfies GhosttyWindowAdjustment

const DEFAULT_TYPOGRAPHY = {
  fontFamily: 'ui-monospace',
  fontSize: 13,
  fontWeight: 400,
  fontVariations: {},
  cellHeight: 0,
  tracking: 0,
  baseline: 0,
  thicken: false,
  thickenStrength: TERMINAL_THICKEN_DEFAULT,
  ligatures: true,
} satisfies TerminalTypography

function windowUsesDarkPalette(): boolean {
  const explicit = document.documentElement.dataset.theme
  if (explicit === 'light') return false
  if (explicit === 'dark') return true
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : true
}

function useWindowPaletteMode(): boolean {
  const [dark, setDark] = useState(windowUsesDarkPalette)
  useEffect(() => {
    const update = (): void => setDark(windowUsesDarkPalette())
    const media = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : undefined
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    media?.addEventListener('change', update)
    return () => {
      observer.disconnect()
      media?.removeEventListener('change', update)
    }
  }, [])
  return dark
}

/** Live terminal typography and the colours the emulator draws with. */
export function useTerminalPresentation(
  capability: TerminalTypographySource,
  properties: TerminalThemeProperties,
): TerminalPresentation {
  const [typography, setTypography] = useState<TerminalTypography>(DEFAULT_TYPOGRAPHY)
  const [typographyError, setTypographyError] = useState(false)
  const windowDark = useWindowPaletteMode()
  const changed = useRef(false)

  useEffect(() => {
    changed.current = false
    const unsubscribe = capability.subscribe((next) => {
      changed.current = true
      setTypography(next)
      setTypographyError(false)
    })
    void capability.get().then(
      (initial) => {
        if (!changed.current) setTypography(initial)
      },
      () => setTypographyError(true),
    )
    return unsubscribe
  }, [capability])

  const { background, foreground, cursor } = properties
  const appearance = useMemo(() => {
    const styles = getComputedStyle(document.documentElement)
    const palette = typography.palette
    if (palette === undefined) {
      return {
        theme: readTerminalTheme(
          (property) => styles.getPropertyValue(property),
          { background, foreground, cursor },
        ),
        window: GHOSTTY_WINDOW,
      }
    }
    const dark = palette.mode === 'auto' ? windowDark : palette.mode === 'dark'
    const windowBackground = styles.getPropertyValue('--maximal-color-bg-secondary').trim()
      || (dark ? '#1c1f26' : '#eef0f4')
    return resolveTerminalAppearance(palette, dark, windowBackground)
  }, [background, cursor, foreground, typography.palette, windowDark])

  return { typography, typographyError, appearance }
}

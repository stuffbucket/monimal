import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react'
import { TerminalTabs } from '@maximal/maximal-electron/renderer'
import {
  readTerminalTheme,
  resolveTerminalAppearance,
  SHELL_TERMINAL_PROPERTIES,
  type GhosttyWindowAdjustment,
  type TerminalPane,
  type TerminalTypography,
} from '@maximal/maximal-terminal/renderer'

import type { SettingsCapabilities } from '../settings/capabilities'
import { TERMINAL_THICKEN_DEFAULT } from '../../shared/host'
import { terminalTransport } from './transport'

export interface TerminalTab {
  id: string
  sessionId: string
  title: string
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

function currentTheme() {
  const styles = getComputedStyle(document.documentElement)
  return readTerminalTheme(
    (property) => styles.getPropertyValue(property),
    {
      ...SHELL_TERMINAL_PROPERTIES,
      foreground: '--maximal-terminal-foreground',
      cursor: '--maximal-terminal-cursor',
    },
  )
}

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

export function Terminal({
  tabs,
  activeId,
  onExit,
  onFocusChange,
  onTitleChange,
  onPaneChange,
  initialPane,
  initialPanes,
  paneRevisions,
  typography,
  paneFocusRequest,
}: {
  tabs: TerminalTab[]
  activeId: string
  onExit: (id: string) => void
  onFocusChange?: (tabId: string, sessionId: string) => void
  onTitleChange: (id: string, title: string) => void
  onPaneChange?: (id: string, pane: TerminalPane, baseRevision: number) => void
  initialPane?: TerminalPane
  initialPanes?: ReadonlyMap<string, TerminalPane>
  paneRevisions?: ReadonlyMap<string, number>
  typography: SettingsCapabilities['terminalTypography']
  paneFocusRequest?: { tabId: string; sessionId: string; generation: number }
}): ReactElement {
  const [terminalTypography, setTerminalTypography] =
    useState<TerminalTypography>(DEFAULT_TYPOGRAPHY)
  const [typographyError, setTypographyError] = useState(false)
  const windowDark = useWindowPaletteMode()
  const changed = useRef(false)

  useEffect(() => {
    changed.current = false
    const unsubscribe = typography.subscribe((next) => {
      changed.current = true
      setTerminalTypography(next)
      setTypographyError(false)
    })
    void typography.get().then(
      (initial) => {
        if (!changed.current) setTerminalTypography(initial)
      },
      () => setTypographyError(true),
    )
    return unsubscribe
  }, [typography])

  const launchSplit = useCallback(async () => {
    const result = await window.maximal.terminal.launch({ profileId: 'local', cols: 80, rows: 24 })
    return { sessionId: result.sessionId }
  }, [])
  const appearance = useMemo(() => {
    const palette = terminalTypography.palette
    if (palette === undefined) {
      return { theme: currentTheme(), window: GHOSTTY_WINDOW }
    }
    const dark = palette.mode === 'auto' ? windowDark : palette.mode === 'dark'
    const styles = getComputedStyle(document.documentElement)
    const windowBackground = styles.getPropertyValue('--shell-canvas').trim()
      || (dark ? '#1c1f26' : '#eef0f4')
    return resolveTerminalAppearance(palette, dark, windowBackground)
  }, [terminalTypography.palette, windowDark])

  return (
    <>
      {typographyError ? (
        <p role="alert">Terminal typography settings could not be loaded.</p>
      ) : null}
      <TerminalTabs
        activeId={activeId}
        attachments={tabs}
        disposition="detach"
        emulator="ghostty"
        ghosttyWindow={appearance.window}
        typography={terminalTypography}
        launchSplit={launchSplit}
        onExit={onExit}
        onFocusChange={onFocusChange}
        onPaneChange={onPaneChange}
        onTitleChange={onTitleChange}
        initialPane={initialPane}
        initialPanes={initialPanes}
        paneRevisions={paneRevisions}
        paneFocusRequest={paneFocusRequest}
        theme={appearance.theme}
        transport={terminalTransport}
      />
    </>
  )
}
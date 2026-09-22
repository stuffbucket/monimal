import { useCallback, type ReactElement } from 'react'
import {
  readTerminalTheme,
  SHELL_TERMINAL_PROPERTIES,
  TerminalTabs,
  type GhosttyWindowAdjustment,
  type TerminalPane,
} from 'stuffbucket-electron/renderer'

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

export function Terminal({
  tabs,
  activeId,
  onExit,
  onTitleChange,
  onPaneChange,
  initialPane,
  initialPanes,
  paneRevisions,
}: {
  tabs: TerminalTab[]
  activeId: string
  onExit: (id: string) => void
  onTitleChange: (id: string, title: string) => void
  onPaneChange?: (id: string, pane: TerminalPane, baseRevision: number) => void
  initialPane?: TerminalPane
  initialPanes?: ReadonlyMap<string, TerminalPane>
  paneRevisions?: ReadonlyMap<string, number>
}): ReactElement {
  const launchSplit = useCallback(async () => {
    const result = await window.maximal.terminal.launch({ profileId: 'local', cols: 80, rows: 24 })
    return { sessionId: result.sessionId }
  }, [])

  return (
    <TerminalTabs
      activeId={activeId}
      attachments={tabs}
      disposition="detach"
      emulator="ghostty"
      ghosttyWindow={GHOSTTY_WINDOW}
      launchSplit={launchSplit}
      onExit={onExit}
      onPaneChange={onPaneChange}
      onTitleChange={onTitleChange}
      initialPane={initialPane}
      initialPanes={initialPanes}
      paneRevisions={paneRevisions}
      theme={currentTheme()}
      transport={terminalTransport}
    />
  )
}
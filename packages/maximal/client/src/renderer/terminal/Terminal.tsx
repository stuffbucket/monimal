import { useCallback, type ReactElement } from 'react'
import {
  readTerminalTheme,
  SHELL_TERMINAL_PROPERTIES,
  TerminalTabs,
} from 'stuffbucket-electron/renderer'

import { terminalTransport } from './transport'

export interface TerminalTab {
  id: string
  sessionId: string
  title: string
}

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

export function Terminal({ tabs, activeId, onTitleChange }: {
  tabs: TerminalTab[]
  activeId: string
  onTitleChange: (id: string, title: string) => void
}): ReactElement {
  const launchSplit = useCallback(async () => {
    const result = await window.maximal.terminal.launch({ profileId: 'local', cols: 80, rows: 24 })
    return { sessionId: result.sessionId }
  }, [])

  return (
    <TerminalTabs
      activeId={activeId}
      attachments={tabs}
      disposition="terminate"
      launchSplit={launchSplit}
      onTitleChange={onTitleChange}
      theme={currentTheme()}
      transport={terminalTransport}
    />
  )
}
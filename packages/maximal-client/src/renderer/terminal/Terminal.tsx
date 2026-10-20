import { useCallback, type ReactElement } from 'react'
import { TerminalTabs } from '@maximal/maximal-electron/renderer'
import {
  SHELL_TERMINAL_PROPERTIES,
  type TerminalPane,
} from '@maximal/maximal-terminal/renderer'

import type { SettingsCapabilities } from '../settings/capabilities'
import { terminalTransport } from './transport'
import { useTerminalPresentation } from './useTerminalPresentation'

const LEGACY_TERMINAL_PROPERTIES = {
  ...SHELL_TERMINAL_PROPERTIES,
  foreground: '--maximal-terminal-foreground',
  cursor: '--maximal-terminal-cursor',
}

export interface TerminalTab {
  id: string
  sessionId: string
  title: string
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
  const { typography: terminalTypography, typographyError, appearance } =
    useTerminalPresentation(typography, LEGACY_TERMINAL_PROPERTIES)

  const launchSplit = useCallback(async () => {
    const result = await window.maximal.terminal.launch({ profileId: 'local', cols: 80, rows: 24 })
    return { sessionId: result.sessionId }
  }, [])
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
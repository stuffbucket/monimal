import type { ReactElement } from 'react'
import { TerminalLauncher } from '@maximal/maximal-electron/renderer'

import type { TerminalTabsState } from '@maximal/maximal-client/renderer/useTerminalTabs'
import { renderTerminalProfileIcon } from './TerminalProfileIcon'

export function WorkspaceTerminalLauncher({
  terminalState,
}: {
  terminalState: TerminalTabsState
}): ReactElement {
  return (
    <TerminalLauncher
      open={terminalState.launcherOpen}
      onOpenChange={terminalState.setLauncherOpen}
      profiles={window.maximal.terminal.profiles}
      discover={window.maximal.terminal.discover}
      launch={async (request) => {
        const result = await window.maximal.terminal.launch(request)
        terminalState.rememberProfile(request.profileId)
        return result
      }}
      onLaunched={terminalState.onTerminalLaunched}
      recentProfileIds={terminalState.recentProfiles}
      renderProfileIcon={renderTerminalProfileIcon}
    />
  )
}

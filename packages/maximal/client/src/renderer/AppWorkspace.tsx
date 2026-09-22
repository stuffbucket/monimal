import type { ReactElement } from 'react'

import { AppFrame, PRODUCT_TABS, type AppTab } from './frame/AppFrame'
import { Overview } from './overview/Overview'
import { Settings, type SettingsSectionRequest } from './settings/Settings'
import type { SettingsCapabilities } from './settings/capabilities'
import { Terminal } from './terminal/Terminal'
import { Traffic } from './traffic/Traffic'
import type { TerminalTabsState } from './useTerminalTabs'

interface AppWorkspaceProps {
  authenticated: boolean | null
  settings: SettingsCapabilities
  sectionRequest: SettingsSectionRequest | null
  terminalState: TerminalTabsState
  requestNavigation: (proceed: () => void) => void
}

interface ActiveSurfaceProps {
  signedOut: boolean
  current: AppTab | undefined
  terminalTabs: Array<{ id: string; sessionId: string; title: string }>
  settings: SettingsCapabilities
  sectionRequest: SettingsSectionRequest | null
  terminalState: TerminalTabsState
  requestNavigation: (proceed: () => void) => void
}

function ActiveSurface({
  signedOut,
  current,
  terminalTabs,
  settings,
  sectionRequest,
  terminalState,
  requestNavigation,
}: ActiveSurfaceProps): ReactElement {
  return (
    <>
      {!signedOut && current?.kind === 'overview' ? <Overview /> : null}
      {!signedOut && current?.kind === 'traffic' ? <Traffic /> : null}
      {!signedOut && terminalTabs.length > 0 ? (
        <Terminal
          tabs={terminalTabs}
          activeId={current?.id ?? ''}
          onExit={terminalState.closeTab}
          onTitleChange={terminalState.updateTerminalTitle}
        />
      ) : null}
      {current?.kind === 'settings' ? (
        <Settings
          capabilities={settings}
          request={sectionRequest}
          onBack={
            signedOut
              ? () => requestNavigation(() => terminalState.setActiveTab('overview'))
              : undefined
          }
        />
      ) : null}
    </>
  )
}

export function AppWorkspace({
  authenticated,
  settings,
  sectionRequest,
  terminalState,
  requestNavigation,
}: AppWorkspaceProps): ReactElement {
  const signedOut = authenticated !== true
  const visibleTabs = signedOut
    ? PRODUCT_TABS.filter((tab) => tab.kind === 'settings')
    : terminalState.tabs
  const current = visibleTabs.find((tab) => tab.id === terminalState.activeTab) ?? visibleTabs[0]
  const terminalTabs = terminalState.tabs.flatMap((tab) =>
    tab.kind === 'terminal' && tab.sessionId
      ? [{ id: tab.id, sessionId: tab.sessionId, title: tab.title }]
      : [],
  )

  return (
    <AppFrame
      tabs={visibleTabs}
      activeTab={current?.id ?? 'settings'}
      surface={current?.kind ?? 'settings'}
      onSelectTab={(id) => requestNavigation(() => terminalState.setActiveTab(id))}
      onCloseTab={signedOut ? undefined : terminalState.closeTab}
      onNewTab={signedOut ? undefined : () => terminalState.setLauncherOpen(true)}
      tabTransfer={signedOut ? undefined : {
        frameId: 'maximal-main',
        canDrag: (tab) => tab.kind === 'terminal',
        canDropBefore: (tab) => tab === undefined || tab.kind === 'terminal',
        onMoveTab: terminalState.moveTerminalTab,
      }}
    >
      <ActiveSurface
        signedOut={signedOut}
        current={current}
        terminalTabs={terminalTabs}
        settings={settings}
        sectionRequest={sectionRequest}
        terminalState={terminalState}
        requestNavigation={requestNavigation}
      />
    </AppFrame>
  )
}
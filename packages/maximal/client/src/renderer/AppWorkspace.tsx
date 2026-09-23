import type { ReactElement } from 'react'

import { AccountStatusLine } from './AccountStatusLine'
import { AppFrame, PRODUCT_TABS, SurfaceActivity, type AppTab } from './frame/AppFrame'
import { WorkspaceRail } from './frame/WorkspaceRail'
import { Overview } from './overview/Overview'
import { Settings, type SettingsSectionRequest } from './settings/Settings'
import type { SettingsCapabilities } from './settings/capabilities'
import type { AuthStatus } from './settings/capabilities'
import { ProviderOnboarding } from './ProviderOnboarding'
import { Terminal } from './terminal/Terminal'
import { Traffic } from './traffic/Traffic'
import type { TerminalTabsState } from './useTerminalTabs'

interface AppWorkspaceProps {
  accountStatus: AuthStatus | null
  settings: SettingsCapabilities
  sectionRequest: SettingsSectionRequest | null
  terminalState: TerminalTabsState
  requestNavigation: (proceed: () => void) => void
}

interface ActiveSurfaceProps {
  current: AppTab | undefined
  terminalTabs: Array<{ id: string; sessionId: string; title: string }>
  settings: SettingsCapabilities
  sectionRequest: SettingsSectionRequest | null
  terminalState: TerminalTabsState
}

function ActiveSurface({
  current,
  terminalTabs,
  settings,
  sectionRequest,
  terminalState,
}: ActiveSurfaceProps): ReactElement {
  return (
    <>
      {current?.kind === 'overview' ? <Overview /> : null}
      {current?.kind === 'traffic' ? <Traffic /> : null}
      {terminalTabs.length > 0 ? (
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
        />
      ) : null}
    </>
  )
}

export function AppWorkspace({
  accountStatus,
  settings,
  sectionRequest,
  terminalState,
  requestNavigation,
}: AppWorkspaceProps): ReactElement {
  const current = terminalState.tabs.find((tab) => tab.id === terminalState.activeTab)
    ?? PRODUCT_TABS[0]
  const terminalTabs = terminalState.tabs.flatMap((tab) =>
    tab.kind === 'terminal' && tab.sessionId
      ? [{ id: tab.id, sessionId: tab.sessionId, title: tab.title }]
      : [],
  )

  return (
    <AppFrame
      tabs={terminalState.tabs}
      activeTab={current.id}
      surface={current.kind}
      onSelectTab={(id) => requestNavigation(() => {
        terminalState.setActiveTab(id)
      })}
      onCloseTab={(id) => {
        const closing = terminalState.tabs.find((tab) => tab.id === id)
        if (closing?.kind === 'settings') requestNavigation(() => terminalState.closeTab(id))
        else terminalState.closeTab(id)
      }}
      onNewTab={() => terminalState.setLauncherOpen(true)}
      settingsOpen={terminalState.tabs.some((tab) => tab.kind === 'settings')}
      onToggleSettings={() => requestNavigation(terminalState.toggleSettings)}
      tabTransfer={{
        frameId: 'maximal-main',
        canDrag: (tab) => tab.kind === 'terminal',
        canDropBefore: (tab) => tab === undefined || tab.kind === 'terminal',
        onMoveTab: terminalState.moveTerminalTab,
      }}
    >
      <ActiveSurface
        current={current}
        terminalTabs={terminalTabs}
        settings={settings}
        sectionRequest={sectionRequest}
        terminalState={terminalState}
      />
      <SurfaceActivity>
        <WorkspaceRail
          tabs={terminalState.tabs}
          current={current.id}
          onSelect={(id) => requestNavigation(() => terminalState.setActiveTab(id))}
        />
      </SurfaceActivity>
      <AccountStatusLine status={accountStatus} />
      <ProviderOnboarding
        capabilities={settings}
        onSetup={() => {
          terminalState.openSettings()
        }}
      />
    </AppFrame>
  )
}
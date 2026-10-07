import { useCallback, useMemo, useState, type ReactElement } from 'react'
import {
  CommandIcon,
  ControlButton,
  IconButton,
  MaximalMarkIcon,
  PlusIcon,
  SettingsIcon,
  SidebarSection,
  TabSearch,
  WindowControls,
  WorkspaceShell,
  type TabBarItem,
} from '@maximal/maximal-design-system'

import type { TerminalTypographySource } from '../terminal/useTerminalPresentation'
import type { TerminalTabsState } from '../useTerminalTabs'
import { DesignSystemTerminal } from './DesignSystemTerminal'
import { PORTED_SURFACES, workspaceTabItem } from './workspace-tabs'

const NATIVE_WINDOW_CONTROLS =
  typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')

export type WorkspaceTerminalState = Pick<
  TerminalTabsState,
  | 'tabs'
  | 'activeTab'
  | 'setActiveTab'
  | 'closeTab'
  | 'closeTerminal'
  | 'onTerminalLaunched'
  | 'openSettings'
  | 'setTerminalError'
  | 'terminalError'
  | 'updateTerminalTitle'
>

export interface DesignSystemWorkspaceProps {
  terminalState: WorkspaceTerminalState
  typography: TerminalTypographySource
}

function SurfacePlaceholder({ label }: { label: string }): ReactElement {
  return (
    <div className="maximal-panel-placeholder" role="region" aria-label={`${label} placeholder`}>
      <h2>{label}</h2>
      <p>This surface has not moved to the design system yet.</p>
    </div>
  )
}

export function DesignSystemWorkspace({
  terminalState,
  typography,
}: DesignSystemWorkspaceProps): ReactElement {
  const {
    tabs,
    activeTab,
    setActiveTab,
    closeTab,
    closeTerminal,
    onTerminalLaunched,
    openSettings,
    setTerminalError,
    terminalError,
    updateTerminalTitle,
  } = terminalState
  const [sidebarsOpen, setSidebarsOpen] = useState(true)
  const items = useMemo(() => tabs.map(workspaceTabItem), [tabs])
  const terminalTabs = useMemo(() => tabs.filter((tab) => tab.kind === 'terminal'), [tabs])

  const launchTerminal = useCallback(() => {
    void window.maximal.terminal.launch({ profileId: 'local', cols: 80, rows: 24 }).then(
      onTerminalLaunched,
      () => setTerminalError('A terminal could not be started.'),
    )
  }, [onTerminalLaunched, setTerminalError])

  const close = useCallback((id: string) => {
    const tab = tabs.find((candidate) => candidate.id === id)
    if (tab?.kind === 'terminal' && tab.canRunInBackground !== true) void closeTerminal(id)
    else if (tab !== undefined) closeTab(id)
  }, [closeTab, closeTerminal, tabs])

  const renderPanel = useCallback((item: TabBarItem) => {
    const tab = tabs.find((candidate) => candidate.id === item.id)
    if (tab?.kind === 'terminal' && tab.sessionId !== undefined && PORTED_SURFACES.has('terminal')) {
      return (
        <DesignSystemTerminal
          onExit={() => closeTab(tab.id)}
          onTitleChange={(title) => updateTerminalTitle(tab.id, title)}
          sessionId={tab.sessionId}
          title={tab.title}
          typography={typography}
        />
      )
    }
    return <SurfacePlaceholder label={item.label} />
  }, [closeTab, tabs, typography, updateTerminalTitle])

  return (
    <WorkspaceShell
      activeTab={activeTab}
      fill
      leftSidebar={{
        label: 'Sessions',
        toggleLabel: 'Hide workspace sidebars',
        content: (
          <SidebarSection title="Sessions">
            <div className="maximal-project-content__group">
              <h4>Terminals</h4>
              {terminalTabs.length === 0 ? (
                <p>No terminal sessions are open.</p>
              ) : terminalTabs.map((tab) => (
                <ControlButton
                  aria-current={tab.id === activeTab ? 'page' : undefined}
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  type="button"
                >
                  <CommandIcon />
                  <span>{tab.title}</span>
                </ControlButton>
              ))}
            </div>
          </SidebarSection>
        ),
      }}
      mainOverlay={terminalError === undefined ? null : (
        <p className="maximal-app-alert" role="alert">{terminalError}</p>
      )}
      navigation={{
        header: <MaximalMarkIcon />,
        items: (
          <IconButton label="New terminal" onClick={launchTerminal}>
            <CommandIcon />
          </IconButton>
        ),
        footer: (
          <IconButton label="Settings" onClick={openSettings}>
            <SettingsIcon />
          </IconButton>
        ),
      }}
      onActiveTabChange={setActiveTab}
      onCloseTab={close}
      onSidebarsOpenChange={setSidebarsOpen}
      renderPanel={renderPanel}
      sidebarsOpen={sidebarsOpen}
      tabLeading={NATIVE_WINDOW_CONTROLS ? <WindowControls native /> : null}
      tabTrailing={
        <>
          <IconButton label="New terminal" onClick={launchTerminal}>
            <PlusIcon />
          </IconButton>
          <TabSearch activeTab={activeTab} onActiveTabChange={setActiveTab} tabs={items} />
        </>
      }
      tabs={items}
    />
  )
}

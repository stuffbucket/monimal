import type { ReactElement } from 'react'
import {
  Button,
  Dialog,
  TextInput,
} from 'stuffbucket-electron/renderer'

import { AppFrame, PRODUCT_TABS, type AppTab } from './frame/AppFrame'
import { Overview } from './overview/Overview'
import { Settings, type SettingsSectionRequest } from './settings/Settings'
import type { SettingsCapabilities } from './settings/capabilities'
import { Terminal } from './terminal/Terminal'
import type { DetachedTerminal } from './terminal/window-transfer'
import { Traffic } from './traffic/Traffic'
import type { TerminalTabsState } from './useTerminalTabs'

interface AppWorkspaceProps {
  authenticated: boolean | null
  detachedWindow?: DetachedTerminal
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
          onPaneChange={terminalState.syncPane}
          onTitleChange={terminalState.updateTerminalTitle}
          initialPane={terminalState.detachedWindow?.pane}
          initialPanes={terminalState.panes}
          paneRevisions={terminalState.paneRevisions}
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

function TerminalDialogs({ terminalState }: { terminalState: TerminalTabsState }): ReactElement {
  return (
    <>
      <Dialog
        open={terminalState.renameState !== undefined}
        onOpenChange={(open) => {
          if (!open) terminalState.setRenameState(undefined)
        }}
        title="Rename terminal tab"
        className="dialog"
        testId="rename-terminal-tab"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!terminalState.renameState) return
            terminalState.renameTerminal(
              terminalState.renameState.tabId,
              terminalState.renameState.title,
            )
            terminalState.setRenameState(undefined)
          }}
        >
          <TextInput
            aria-label="Terminal tab name"
            value={terminalState.renameState?.title ?? ''}
            onChange={(title) => terminalState.setRenameState((state) =>
              state ? { ...state, title } : state)}
          />
          <Button type="submit" variant="primary">Rename</Button>
        </form>
      </Dialog>
      <Dialog
        open={terminalState.terminalError !== undefined}
        onOpenChange={(open) => {
          if (!open) terminalState.setTerminalError(undefined)
        }}
        title="Terminal action failed"
        description={terminalState.terminalError}
        className="dialog"
        testId="terminal-action-error"
      >
        <Button variant="primary" onClick={() => terminalState.setTerminalError(undefined)}>
          Done
        </Button>
      </Dialog>
      <Dialog
        open={terminalState.closeState !== undefined}
        onOpenChange={(open) => {
          if (!open) terminalState.setCloseState(undefined)
        }}
        title="Close terminal?"
        description={`${terminalState.closeState?.title ?? 'This terminal'} can keep running after its tab closes.`}
        className="dialog"
        testId="close-terminal"
      >
        <Button
          variant="primary"
          onClick={() => {
            if (!terminalState.closeState) return
            terminalState.closeTab(terminalState.closeState.tabId)
            terminalState.setCloseState(undefined)
          }}
        >
          Keep Running in Background
        </Button>
        <Button
          onClick={() => {
            if (!terminalState.closeState) return
            void terminalState.closeTerminal(terminalState.closeState.tabId)
            terminalState.setCloseState(undefined)
          }}
        >
          Close Terminal
        </Button>
      </Dialog>
    </>
  )
}

export function AppWorkspace({
  authenticated,
  detachedWindow,
  settings,
  sectionRequest,
  terminalState,
  requestNavigation,
}: AppWorkspaceProps): ReactElement {
  const signedOut = !detachedWindow && authenticated !== true
  const visibleTabs = detachedWindow
    ? terminalState.tabs.filter((tab) => tab.kind === 'terminal')
    : signedOut
      ? PRODUCT_TABS.filter((tab) => tab.kind === 'settings')
      : terminalState.tabs
  const current = visibleTabs.find((tab) => tab.id === terminalState.activeTab) ?? visibleTabs[0]
  const terminalTabs = terminalState.tabs.flatMap((tab) =>
    tab.kind === 'terminal' && tab.sessionId
      ? [{ id: tab.id, sessionId: tab.sessionId, title: tab.title }]
      : [],
  )

  const openTerminalWindow = (tab: AppTab, copy: boolean): void => {
    const request = terminalState.terminalWindowRequest(tab)
    if (!request) return
    const action = copy ? window.maximal.terminal.copy : window.maximal.terminal.undock
    void action(request).then((completed) => {
      if (completed && !copy) terminalState.closeTab(tab.id)
      else if (!completed) {
        terminalState.setTerminalError(
          `The terminal could not be ${copy ? 'copied' : 'moved'} to a new window.`,
        )
      }
    }).catch(() => {
      terminalState.setTerminalError(
        `The terminal could not be ${copy ? 'copied' : 'moved'} to a new window.`,
      )
    })
  }

  return (
    <>
      <AppFrame
        tabs={visibleTabs}
        activeTab={current?.id ?? 'settings'}
        surface={current?.kind ?? 'settings'}
        onSelectTab={(id) => requestNavigation(() => terminalState.setActiveTab(id))}
        onCloseTab={signedOut ? undefined : terminalState.requestCloseTerminal}
        onNewTab={signedOut || detachedWindow ? undefined : () => terminalState.setLauncherOpen(true)}
        tabTransfer={signedOut ? undefined : {
          frameId: terminalState.frameId,
          canDrag: (tab) => tab.kind === 'terminal',
          canDropBefore: (tab) => tab === undefined || tab.kind === 'terminal',
          onMoveTab: terminalState.moveTerminalTab,
          onReceiveTab: detachedWindow ? undefined : terminalState.receiveTab,
          getTransfer: (tab) => tab.kind === 'terminal' && tab.sessionId
            ? {
                sessionId: tab.sessionId,
                title: tab.title,
                pane: terminalState.panes.get(tab.id),
                canRunInBackground: tab.canRunInBackground,
              }
            : undefined,
          contextMenu: (tab) => tab.kind === 'terminal'
            ? [
                {
                  id: 'rename',
                  label: 'Rename',
                  onSelect: () => terminalState.setRenameState({
                    tabId: tab.id,
                    title: tab.title,
                  }),
                },
                {
                  id: 'move-to-new-window',
                  label: 'Move to New Window',
                  onSelect: () => openTerminalWindow(tab, false),
                },
                {
                  id: 'copy-to-new-window',
                  label: 'Copy into New Window',
                  onSelect: () => openTerminalWindow(tab, true),
                },
                ...(tab.canRunInBackground
                  ? [{
                      id: 'put-in-background',
                      label: 'Put in Background',
                      separatorBefore: true,
                      onSelect: () => terminalState.closeTab(tab.id),
                    }]
                  : []),
                {
                  id: 'close',
                  label: 'Close Terminal',
                  shortcut: '⌘W',
                  separatorBefore: !tab.canRunInBackground,
                  onSelect: () => terminalState.requestCloseTerminal(tab.id),
                },
              ]
            : [],
          onDetachTab: (transfer, position) => {
            const tab = terminalState.getTabs().find((candidate) =>
              candidate.id === transfer.tabId)
            if (!tab) return
            const request = terminalState.terminalWindowRequest(tab, position)
            if (!request) return
            void window.maximal.terminal.undock(request).then((moved) => {
              if (moved) terminalState.closeTab(tab.id)
              else terminalState.setTerminalError(
                'The terminal could not be moved to a new window.',
              )
            }).catch(() => {
              terminalState.setTerminalError('The terminal could not be moved to a new window.')
            })
          },
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
      <TerminalDialogs terminalState={terminalState} />
    </>
  )
}

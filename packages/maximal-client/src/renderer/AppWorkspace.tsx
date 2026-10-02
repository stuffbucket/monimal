import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type ReactElement,
  type SetStateAction,
} from 'react'
import { BrowserSurface } from '@maximal/maximal-browser/renderer'
import { ContextWindowInspector } from '@maximal/maximal-observability'
import { terminalPaneSessionIds } from '@maximal/maximal-terminal/renderer'
import {
  Button,
  Dialog,
  TAB_COLORS,
  TextInput,
  moveTabBefore,
  type Account,
  type SettingsSurface,
  type TabColor,
} from '@maximal/maximal-electron/renderer'

import type { SettingsSectionId } from '../shared/settings-sections'
import { AccountStatusLine } from './AccountStatusLine'
import {
  AppFrame,
  PRODUCT_TABS,
  SurfaceActivity,
  SurfaceRight,
  type AppTab,
} from './frame/AppFrame'
import { WorkspaceRail } from './frame/WorkspaceRail'
import { WORKBAR_PROFILE_SECTIONS } from './frame/workbar-layout'
import { WorkspaceHome } from './home/WorkspaceHome'
import { BrowserSessions, TerminalSessions } from './home/WorkspaceSessions'
import { Overview } from './overview/Overview'
import { Settings, type SettingsSectionRequest } from './settings/Settings'
import type { SettingsCapabilities } from './settings/capabilities'
import type { AuthStatus } from './settings/capabilities'
import { ProviderOnboarding } from './ProviderOnboarding'
import { Terminal } from './terminal/Terminal'
import { terminalTransport } from './terminal/transport'
import type { DetachedTerminal } from './terminal/window-transfer'
import { Traffic } from './traffic/Traffic'
import type { TerminalTabsState } from './useTerminalTabs'
import { ProjectBrowser } from './projects/ProjectBrowser'
import { useProjectWindowTransfer } from './projects/window-transfer'

interface AppWorkspaceProps {
  detachedWindow?: DetachedTerminal
  detachedProjects?: boolean
  accountStatus: AuthStatus | null
  settings: SettingsCapabilities
  sectionRequest: SettingsSectionRequest | null
  terminalState: TerminalTabsState
  requestNavigation: (proceed: () => void) => void
  openSettingsSection: (id: SettingsSectionId) => void
}

const TAB_COLOR_LABELS: Record<TabColor, string> = {
  blue: 'Blue',
  green: 'Green',
  yellow: 'Yellow',
  red: 'Red',
  purple: 'Purple',
  orange: 'Orange',
}

interface ActiveSurfaceProps {
  current: AppTab | undefined
  terminalTabs: Array<{ id: string; sessionId: string; title: string }>
  settings: SettingsCapabilities
  sectionRequest: SettingsSectionRequest | null
  terminalState: TerminalTabsState
  onFocusChange: (tabId: string, sessionId: string) => void
  projectBrowser?: ReactElement
  onSelectTab: (id: string) => void
  onNewTerminal: () => void
  onNewBrowser: () => void
}

function ActiveSurface({
  current,
  terminalTabs,
  settings,
  sectionRequest,
  terminalState,
  onFocusChange,
  projectBrowser,
  onSelectTab,
  onNewTerminal,
  onNewBrowser,
}: ActiveSurfaceProps): ReactElement {
  if (projectBrowser) return projectBrowser

  return (
    <>
      {current?.kind === 'home' ? (
        <WorkspaceHome
          tabs={terminalState.tabs}
          panes={terminalState.panes}
          onSelectTab={onSelectTab}
          onOpenProjects={() => onSelectTab('projects')}
          onNewTerminal={onNewTerminal}
          onNewBrowser={onNewBrowser}
        />
      ) : null}
      {current?.kind === 'terminals' ? (
        <TerminalSessions
          tabs={terminalState.tabs}
          transport={terminalTransport}
          onSelectTab={onSelectTab}
          onResume={terminalState.reopenTerminalSession}
          onNew={onNewTerminal}
          onClose={terminalState.requestCloseTerminal}
        />
      ) : null}
      {current?.kind === 'browsers' ? (
        <BrowserSessions
          tabs={terminalState.tabs}
          onSelectTab={onSelectTab}
          onNew={onNewBrowser}
          onClose={(id) => void terminalState.closeBrowser(id)}
        />
      ) : null}
      {current?.kind === 'overview' ? <Overview /> : null}
      {current?.kind === 'traffic' ? <Traffic /> : null}
      {current?.kind === 'browser' && current.browserId && current.url ? (
        <BrowserSurface
          session={{
            id: current.browserId,
            url: current.url,
            title: current.title,
            owner: current.browserOwner ?? 'user',
            control: current.browserControl ?? 'user',
            terminalSessionIds: current.terminalSessionIds ?? [],
          }}
          bridge={window.maximal.browser}
        />
      ) : null}
      {terminalTabs.length > 0 ? (
        <Terminal
          tabs={terminalTabs}
          activeId={current?.id ?? ''}
          onExit={terminalState.closeTab}
          onFocusChange={onFocusChange}
          onPaneChange={terminalState.syncPane}
          onTitleChange={terminalState.updateTerminalTitle}
          initialPane={terminalState.detachedWindow?.pane}
          initialPanes={terminalState.panes}
          paneRevisions={terminalState.paneRevisions}
          typography={settings.terminalTypography}
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

function BrowserDialogs({
  address,
  setAddress,
  terminalState,
}: {
  address: string | undefined
  setAddress: Dispatch<SetStateAction<string | undefined>>
  terminalState: TerminalTabsState
}): ReactElement {
  return (
    <>
      <Dialog
        open={address !== undefined}
        onOpenChange={(open) => {
          if (!open) setAddress(undefined)
        }}
        title="Open browser"
        description="Open a browser tab that can be shared with the assistant."
        className="dialog"
        testId="open-browser"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!address) return
            void terminalState.openBrowser(address)
            setAddress(undefined)
          }}
        >
          <TextInput
            aria-label="Browser address"
            value={address ?? ''}
            onChange={setAddress}
          />
          <Button type="submit" variant="primary">Open</Button>
        </form>
      </Dialog>
      <Dialog
        open={terminalState.browserError !== undefined}
        onOpenChange={(open) => {
          if (!open) terminalState.setBrowserError(undefined)
        }}
        title="Browser action failed"
        description={terminalState.browserError}
        className="dialog"
        testId="browser-error"
      >
        <Button variant="primary" onClick={() => terminalState.setBrowserError(undefined)}>
          Done
        </Button>
      </Dialog>
    </>
  )
}

export function AppWorkspace({
  detachedWindow,
  detachedProjects = false,
  accountStatus,
  settings,
  sectionRequest,
  terminalState,
  requestNavigation,
  openSettingsSection,
}: AppWorkspaceProps): ReactElement {
  const [profileError, setProfileError] = useState<string>()
  const [projectError, setProjectError] = useState<string>()
  const [browserAddress, setBrowserAddress] = useState<string>()
  const [focusedTerminalSessions, setFocusedTerminalSessions] = useState<
    Record<string, string>
  >({})
  const [contextSessions, setContextSessions] = useState<Record<string, string>>({})
  const projectWindows = useProjectWindowTransfer({
    detached: detachedProjects,
    enabled: detachedWindow === undefined,
    frameId: terminalState.frameId,
    tabs: terminalState.tabs,
    openProjects: terminalState.openProjects,
    closeTab: terminalState.closeTab,
    onError: setProjectError,
  })
  const detached = detachedWindow !== undefined || detachedProjects
  const visibleTabs = detachedWindow
    ? terminalState.tabs.filter((tab) => tab.kind === 'terminal')
    : terminalState.tabs
  const current = visibleTabs.find((tab) => tab.id === terminalState.activeTab)
    ?? visibleTabs[0] ?? PRODUCT_TABS[0]
  useEffect(() => {
    if (detachedProjects) return
    const sessionIds = current.kind === 'terminal' && current.sessionId
      ? terminalPaneSessionIds(
          terminalState.panes.get(current.id) ?? { sessionId: current.sessionId },
        )
      : []
    void window.maximal.browser.setTerminalContext(sessionIds)
  }, [current, detachedProjects, terminalState.panes])
  const terminalTabs = terminalState.tabs.flatMap((tab) =>
    tab.kind === 'terminal' && tab.sessionId
      ? [{ id: tab.id, sessionId: tab.sessionId, title: tab.title }]
      : [],
  )
  const terminalGroups = [
    ...new Map(terminalState.tabs.flatMap((tab) =>
      tab.kind === 'terminal' && tab.group ? [[tab.group.id, tab.group]] : [])).values(),
  ]
  const account: Account | undefined = accountStatus?.state === 'authenticated'
    ? {
        id: accountStatus.account_login,
        displayName: accountStatus.account_login,
        handle: `@${accountStatus.account_login}`,
        avatarUrl: accountStatus.account_avatar_url,
        plan: accountStatus.account_type ?? undefined,
      }
    : undefined
  const openSettings = (id: SettingsSectionId): void => {
    requestNavigation(() => {
      terminalState.openSettings()
      openSettingsSection(id)
    })
  }
  const openProfileSurface = (surface: SettingsSurface): void =>
    openSettings(WORKBAR_PROFILE_SECTIONS[surface])
  const selectTab = (id: string): void => requestNavigation(() => {
    if (id === 'projects') terminalState.openProjects()
    else terminalState.setActiveTab(id)
  })
  const onTerminalFocusChange = useCallback((tabId: string, sessionId: string) => {
    setFocusedTerminalSessions((current) =>
      current[tabId] === sessionId ? current : { ...current, [tabId]: sessionId })
  }, [])
  const focusedTerminalSession = current?.kind === 'terminal'
    ? focusedTerminalSessions[current.id] ?? current.sessionId
    : undefined

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
        onSelectTab={selectTab}
        onCloseTab={(id) => {
          const closing = terminalState.tabs.find((tab) => tab.id === id)
          if (closing?.kind === 'settings') requestNavigation(() => terminalState.closeTab(id))
          else if (closing?.kind === 'browser') void terminalState.closeBrowser(id)
          else if (closing?.kind === 'terminal') terminalState.requestCloseTerminal(id)
          else terminalState.closeTab(id)
        }}
        onNewTab={detached ? undefined : () => terminalState.setLauncherOpen(true)}
        onOpenAssistant={detached ? undefined : () => void window.maximal.harness.show()}
        onOpenBrowser={detached ? undefined : () => setBrowserAddress('https://')}
        onOpenProjects={detached ? undefined : () => selectTab('projects')}
        tabTransfer={{
          frameId: terminalState.frameId,
          canDrag: (tab) => tab.kind === 'terminal'
            || (tab.kind === 'projects' && projectWindows.ready),
          canDropBefore: (tab) => tab === undefined || tab.kind === 'terminal' || tab.kind === 'projects',
          onMoveTab: (id, beforeId) => {
            if (id === 'projects') terminalState.setTabs((tabs) => moveTabBefore(tabs, id, beforeId))
            else terminalState.moveTerminalTab(id, beforeId)
          },
          onReceiveTab: detachedWindow ? undefined : (transfer) => {
            if (transfer.document?.kind === 'projects') projectWindows.receive(transfer)
            else terminalState.receiveTab(transfer)
          },
          getTransfer: (tab) => tab.kind === 'projects'
            ? { document: { kind: 'projects', state: projectWindows.encodeState() } }
            : tab.kind === 'terminal' && tab.sessionId
            ? {
                sessionId: tab.sessionId,
                title: tab.title,
                pane: terminalState.panes.get(tab.id),
                canRunInBackground: tab.canRunInBackground,
              }
            : undefined,
          contextMenu: (tab) => {
            if (tab.kind === 'projects') return [
              {
                id: 'move-to-new-window',
                label: 'Move to New Window',
                disabled: !projectWindows.ready,
                onSelect: () => void projectWindows.undock(),
              },
              {
                id: 'close',
                label: 'Close Projects',
                shortcut: '⌘W',
                onSelect: () => terminalState.closeTab(tab.id),
              },
            ]
            if (tab.kind !== 'terminal' || !tab.sessionId) return []
            const terminalIds = new Set(terminalPaneSessionIds(
              terminalState.panes.get(tab.id) ?? { sessionId: tab.sessionId },
            ))
            const browsers = terminalState.tabs.filter((candidate) =>
              candidate.kind === 'browser'
              && candidate.terminalSessionIds?.some((id) => terminalIds.has(id)))
            return [
                {
                  id: 'rename',
                  label: 'Rename',
                  onSelect: () => terminalState.setRenameState({
                    tabId: tab.id,
                    title: tab.title,
                  }),
                },
                ...(tab.group
                  ? [{
                      id: 'remove-from-group',
                      label: 'Remove from Group',
                      onSelect: () => terminalState.removeTerminalFromGroup(tab.id),
                    }]
                  : [{
                      id: 'new-group',
                      label: 'Add to New Group',
                      onSelect: () => terminalState.createTerminalGroup(tab.id),
                    }]),
                ...terminalGroups
                  .filter((group) => group.id !== tab.group?.id)
                  .map((group) => ({
                    id: `add-to-group-${group.id}`,
                    label: `Add to ${group.label}`,
                    onSelect: () => terminalState.moveTerminalToGroup(tab.id, group.id),
                  })),
                ...TAB_COLORS.map((color, index) => ({
                  id: `color-${color}`,
                  label: `Color: ${TAB_COLOR_LABELS[color]}`,
                  separatorBefore: index === 0,
                  onSelect: () => terminalState.setTerminalTabColor(tab.id, color),
                })),
                ...(tab.color
                  ? [{
                      id: 'clear-color',
                      label: 'Clear Tab Color',
                      onSelect: () => terminalState.setTerminalTabColor(tab.id),
                    }]
                  : []),
                {
                  id: 'move-to-new-window',
                  label: 'Move to New Window',
                  separatorBefore: true,
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
                ...browsers.map((browser, index) => ({
                  id: `browser-${browser.browserId ?? String(index)}`,
                  label: `Browser · ${browser.title}${
                    browser.browserControl === 'agent-exclusive'
                      ? ' (Agent exclusive)'
                      : browser.browserControl === 'agent-shared'
                        ? ' (Agent shared)'
                        : ''
                  }`,
                  separatorBefore: index === 0,
                  onSelect: () => terminalState.setActiveTab(browser.id),
                })),
              ]
          },
          onDetachTab: (transfer, position) => {
            const tab = terminalState.getTabs().find((candidate) =>
              candidate.id === transfer.tabId)
            if (!tab) return
            if (tab.kind === 'projects') {
              void projectWindows.undock(position)
              return
            }
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
          current={current}
          terminalTabs={terminalTabs}
          settings={settings}
          sectionRequest={sectionRequest}
          terminalState={terminalState}
          onFocusChange={onTerminalFocusChange}
          onSelectTab={selectTab}
          onNewTerminal={() => terminalState.setLauncherOpen(true)}
          onNewBrowser={() => setBrowserAddress('https://')}
          projectBrowser={current?.kind === 'projects' && projectWindows.ready ? (
            <ProjectBrowser
              key={projectWindows.generation}
              mapStore={projectWindows.store}
              initialView={projectWindows.view.current}
              onViewChange={projectWindows.updateView}
              open
              embedded
              onOpenChange={(open) => {
                if (!open) terminalState.closeTab('projects')
              }}
              onOpenProject={async (project) => {
                const result = await window.maximal.terminal.launch({
                  profileId: 'local',
                  cwd: project.path,
                  cols: 100,
                  rows: 30,
                })
                terminalState.rememberProfile('local')
                if (detachedProjects) {
                  try {
                    const moved = await window.maximal.terminal.undock({
                      id: result.sessionId,
                      title: result.label,
                      canRunInBackground: result.canRunInBackground,
                      cols: 100,
                      rows: 30,
                      x: window.screenX + 100,
                      y: window.screenY + 100,
                    })
                    if (!moved) throw new Error('The project terminal could not be opened in a window.')
                  } catch (cause) {
                    await window.maximal.terminal.terminate(result.sessionId)
                    throw cause
                  }
                } else terminalState.onTerminalLaunched(result)
              }}
              onOpenSettings={() => {
                if (detachedProjects) {
                  void window.maximal.projects.openWorkspaceSettings()
                    .catch((cause: unknown) => setProjectError(
                      cause instanceof Error ? cause.message : 'Workspace settings could not be opened.',
                    ))
                } else openSettings('settings-projects-heading')
              }}
            />
          ) : undefined}
        />
        {focusedTerminalSession ? (
          <SurfaceRight>
            <ContextWindowInspector
              selectedSessionId={
                contextSessions[focusedTerminalSession] ?? focusedTerminalSession
              }
              onSelectSession={(sessionId) => {
                setContextSessions((currentSessions) => ({
                  ...currentSessions,
                  [focusedTerminalSession]: sessionId,
                }))
              }}
            />
          </SurfaceRight>
        ) : null}
        {!detached ? (
          <>
            <SurfaceActivity>
              <WorkspaceRail
                current={current.kind}
                onSelect={selectTab}
                workbar={settings.workbar}
                account={account}
                onOpenProfileSurface={openProfileSurface}
                onSignIn={() => openSettings('settings-account-heading')}
                onSignOut={account === undefined
                  ? undefined
                  : () => {
                      void settings.account.signOut().catch(() => {
                        setProfileError('The account could not be signed out.')
                      })
                    }}
                settingsOpen={terminalState.tabs.some((tab) => tab.kind === 'settings')}
                onToggleSettings={() => requestNavigation(terminalState.toggleSettings)}
              />
            </SurfaceActivity>
            <AccountStatusLine status={accountStatus} />
            <ProviderOnboarding
              capabilities={settings}
              onSetup={() => terminalState.openSettings()}
            />
          </>
        ) : null}
      </AppFrame>
      <BrowserDialogs
        address={browserAddress}
        setAddress={setBrowserAddress}
        terminalState={terminalState}
      />
      <Dialog
        open={profileError !== undefined}
        onOpenChange={(open) => {
          if (!open) setProfileError(undefined)
        }}
        title="Account action failed"
        description={profileError}
        className="dialog"
        testId="profile-action-error"
      >
        <Button variant="primary" onClick={() => setProfileError(undefined)}>
          Done
        </Button>
      </Dialog>
      <TerminalDialogs terminalState={terminalState} />
      <Dialog
        open={projectError !== undefined}
        onOpenChange={(open) => { if (!open) setProjectError(undefined) }}
        title="Project browser action failed"
        description={projectError}
        className="dialog"
        testId="project-window-error"
      >
        <Button variant="primary" onClick={() => setProjectError(undefined)}>Done</Button>
      </Dialog>
    </>
  )
}

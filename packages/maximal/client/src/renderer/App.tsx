import { ObservabilityProvider } from '@stuffbucket/maximal-observability'
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import {
  Button,
  Dialog,
  TerminalLauncher,
  TextInput,
  moveTabBefore,
  terminalPaneSessionIds,
  terminalProcessTitle,
  type TerminalLaunchResult,
} from 'stuffbucket-electron/renderer'

import { DEFAULT_SETTINGS_SECTION_ID } from '../shared/settings-sections'
import { WindowChrome } from './chrome/WindowChrome'
import { FirstRun } from './first-run/FirstRun'
import { AppFrame, PRODUCT_TABS, type AppTab } from './frame/AppFrame'
import { Overview } from './overview/Overview'
import { Settings, type SettingsSectionRequest } from './settings/Settings'
import { createCoreSettingsCapabilities } from './settings/capabilities'
import { Terminal } from './terminal/Terminal'
import { terminalTransport } from './terminal/transport'
import {
  readDetachedTerminal,
  useTerminalWindowTransfer,
} from './terminal/window-transfer'
import { Traffic } from './traffic/Traffic'
import { createObservabilitySource } from './traffic/source'
import {
  UnsavedChangesProvider,
  useGuardedNavigation,
} from './unsaved-changes'

/**
 * Top-level composition.
 *
 * This is the one place that decides which surface is showing, and it exists
 * because that decision cannot be made by any surface individually. First-run,
 * Overview, Traffic, and Settings are built to be mounted; none of them decides
 * when it is the active surface.
 *
 * Auth gates the app: `first-run/` owns everything up to and including a
 * completed device flow — which is also where boot narration lives, since it is
 * the only surface that can be on screen while the sidecar is still starting.
 * Once authenticated, the working surfaces take over inside `frame/AppFrame`.
 *
 * Which surface is showing is that frame's active tab, so this file holds the
 * view but draws no switcher of its own: there is one set of navigation, and it
 * lives in the title bar where it is always reachable.
 *
 * Nothing here touches `ControlClient` or `window.maximal`. It reads auth
 * through the Settings capability seam; that adapter is the sole renderer
 * boundary to the named main-process bridge — including the application
 * menu's requests, which arrive on that seam for the same reason.
 */

/** How often to re-read auth status while nothing is pushing changes.
 *  `subscribe()` is the fast path; this is the safety net for a missed event.
 *  It matters most here: this is the one consumer that gates the ENTIRE app
 *  on `authenticated`, so a missed push strands a signed-in user on the
 *  first-run screen with no route back in. */
const POLL_MS = 3_000

function terminalTab(result: TerminalLaunchResult): AppTab {
  return {
    id: `terminal:${result.sessionId}`,
    title: result.label,
    icon: 'terminal',
    kind: 'terminal',
    sessionId: result.sessionId,
    canRunInBackground: result.canRunInBackground,
  }
}

export function App(): ReactElement {
  return (
    <UnsavedChangesProvider>
      <AppContent />
    </UnsavedChangesProvider>
  )
}

function AppContent(): ReactElement {
  // Built once for the app's lifetime. Electron main owns sidecar replacement;
  // this adapter keeps one stable named-bridge subscription across restarts.
  // Recreating it per render would drop live subscriptions and defeat that.
  const settings = useMemo(() => createCoreSettingsCapabilities(), [])
  const observability = useMemo(() => createObservabilitySource(), [])

  const [detachedWindow] = useState(readDetachedTerminal)
  const initialTerminalTab = detachedWindow
    ? terminalTab({
        sessionId: detachedWindow.sessionId,
        label: detachedWindow.title,
        canRunInBackground: detachedWindow.canRunInBackground,
      })
    : undefined
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [tabs, setTabs] = useState<AppTab[]>(
    initialTerminalTab ? [initialTerminalTab] : PRODUCT_TABS,
  )
  const [activeTab, setActiveTab] = useState(initialTerminalTab?.id ?? 'overview')
  const [launcherOpen, setLauncherOpen] = useState(false)
  const [recentProfiles, setRecentProfiles] = useState<string[]>([])
  const [renameState, setRenameState] = useState<{ tabId: string; title: string }>()
  const [closeState, setCloseState] = useState<{ tabId: string; title: string }>()
  const [terminalError, setTerminalError] = useState<string>()
  const [sectionRequest, setSectionRequest] = useState<SettingsSectionRequest | null>(null)
  const requestNavigation = useGuardedNavigation()

  /* The application menu chooses the surface here and the section there. A new
     object keeps every request observable without a parallel counter. */
  useEffect(
    () =>
      settings.onOpenRequest((sectionId) => {
        requestNavigation(() => {
        setActiveTab('settings')
          setSectionRequest({ id: sectionId ?? DEFAULT_SETTINGS_SECTION_ID })
        })
      }),
    [requestNavigation, settings],
  )

  useEffect(() => {
    let cancelled = false

    const refresh = async (): Promise<void> => {
      try {
        const status = await settings.account.status()
        if (!cancelled) setAuthenticated(status.state === 'authenticated')
      } catch {
        // Core unreachable or still starting. Leave the current answer alone —
        // `null` keeps showing first-run, which is where boot status renders,
        // and flipping an authenticated user out of the app on one transient
        // failure would be worse than waiting.
      }
    }

    void refresh()
    const unsubscribe = settings.subscribe(() => void refresh())
    const poll = setInterval(() => void refresh(), POLL_MS)
    return () => {
      cancelled = true
      unsubscribe()
      clearInterval(poll)
    }
  }, [settings])

  useEffect(() => {
    if (authenticated !== true || detachedWindow) return
    void terminalTransport.list().then((sessions) => {
      setTabs((current) => {
        const known = new Set(current.flatMap((tab) => tab.sessionId ?? []))
        const restored = sessions
          .filter((session) => !known.has(session.id))
          .map((session) => terminalTab({
            sessionId: session.id,
            label: session.shell.split('/').at(-1) ?? 'Terminal',
            canRunInBackground: false,
          }))
        return restored.length === 0 ? current : [...current, ...restored]
      })
    })
  }, [authenticated, detachedWindow])

  const onTerminalLaunched = useCallback((result: TerminalLaunchResult) => {
    const tab = terminalTab(result)
    setTabs((current) => current.some((candidate) => candidate.id === tab.id)
      ? current
      : [...current, tab])
    setActiveTab(tab.id)
  }, [])

  const closeTab = useCallback((id: string) => {
    setTabs((current) => {
      const index = current.findIndex((tab) => tab.id === id)
      if (index < 0 || current[index]?.kind !== 'terminal') return current
      const next = current.filter((tab) => tab.id !== id)
      setActiveTab((active) => active === id
        ? (next[index] ?? next[index - 1] ?? PRODUCT_TABS[0])?.id ?? 'overview'
        : active)
      return next
    })
  }, [])

  const updateTerminalTitle = useCallback((id: string, title: string) => {
    const nextTitle = terminalProcessTitle(title)
    if (nextTitle === '') return
    setTabs((current) => current.map((tab) =>
      tab.id === id && !tab.customTitle ? { ...tab, title: nextTitle } : tab,
    ))
  }, [])

  const moveTerminalTab = useCallback((id: string, beforeId?: string) => {
    setTabs((current) => {
      const source = current.find((tab) => tab.id === id)
      const target = current.find((tab) => tab.id === beforeId)
      if (source?.kind !== 'terminal' || (target && target.kind !== 'terminal')) return current
      return moveTabBefore(current, id, beforeId)
    })
  }, [])

  const {
    frameId,
    getTabs,
    panes,
    paneRevisions,
    receiveTab,
    terminalWindowRequest,
  } = useTerminalWindowTransfer({
    tabs,
    setTabs,
    activeTab,
    setActiveTab,
    detachedWindow,
    initialTerminalTab,
    makeTerminalTab: terminalTab,
    onError: setTerminalError,
  })

  const closeTerminal = useCallback(async (id: string) => {
    const sessionId = getTabs().find((tab) => tab.id === id)?.sessionId
    if (sessionId === undefined) return
    const pane = panes.get(id)
    try {
      await Promise.all(
        terminalPaneSessionIds(pane ?? { sessionId }).map((id) => terminalTransport.terminate(id)),
      )
      closeTab(id)
    } catch {
      setTerminalError('The terminal could not be closed.')
    }
  }, [closeTab, getTabs, panes])

  const requestCloseTerminal = useCallback((id: string) => {
    const tab = getTabs().find((candidate) => candidate.id === id)
    if (tab?.kind !== 'terminal') return
    if (tab.canRunInBackground) {
      setCloseState({ tabId: tab.id, title: tab.title })
      return
    }
    void closeTerminal(tab.id)
  }, [closeTerminal, getTabs])


  // `null` means "not answered yet" and is deliberately NOT treated as signed
  // out: first-run handles both the pre-auth and the still-booting cases, so
  // rendering it while the answer is unknown is correct rather than a fallback.
  // Wrapped, not bare. First run needs a frame for the same reason every other
  // surface does — without one the window has no drag region and cannot be
  // moved, and this is the screen a new user meets first.
  if (!detachedWindow && authenticated !== true && activeTab !== 'settings')
    return (
      <WindowChrome>
        <FirstRun />
      </WindowChrome>
    )

  /*
   * One surface mounted at a time, deliberately. Each runs a data lifecycle of
   * its own — a poll, a subscription, a live snapshot — and keeping inactive
   * surfaces mounted would keep their work running out of view.
   */
  const signedOut = !detachedWindow && authenticated !== true
  const visibleTabs = detachedWindow
    ? tabs.filter((tab) => tab.kind === 'terminal')
    : signedOut
      ? PRODUCT_TABS.filter((tab) => tab.kind === 'settings')
      : tabs
  const current = visibleTabs.find((tab) => tab.id === activeTab) ?? visibleTabs[0]
  const terminalTabs = tabs.flatMap((tab) =>
    tab.kind === 'terminal' && tab.sessionId
      ? [{ id: tab.id, sessionId: tab.sessionId, title: tab.title }]
      : [],
  )
  return (
    <ObservabilityProvider source={observability}>
      <AppFrame
        tabs={visibleTabs}
        activeTab={current?.id ?? 'settings'}
        surface={current?.kind ?? 'settings'}
        onSelectTab={(id) => requestNavigation(() => setActiveTab(id))}
        onCloseTab={signedOut ? undefined : requestCloseTerminal}
        onNewTab={signedOut || detachedWindow ? undefined : () => setLauncherOpen(true)}
        tabTransfer={signedOut ? undefined : {
          frameId,
          canDrag: (tab) => tab.kind === 'terminal',
          canDropBefore: (tab) => tab === undefined || tab.kind === 'terminal',
          onMoveTab: moveTerminalTab,
          onReceiveTab: detachedWindow ? undefined : receiveTab,
          getTransfer: (tab) => tab.kind === 'terminal' && tab.sessionId
            ? {
                sessionId: tab.sessionId,
                title: tab.title,
                pane: panes.get(tab.id),
                canRunInBackground: tab.canRunInBackground,
              }
            : undefined,
          contextMenu: (tab) => tab.kind === 'terminal'
            ? [
                {
                  id: 'rename',
                  label: 'Rename',
                  onSelect: () => setRenameState({ tabId: tab.id, title: tab.title }),
                },
                {
                  id: 'move-to-new-window',
                  label: 'Move to New Window',
                  onSelect: () => {
                    const request = terminalWindowRequest(tab)
                    if (!request) return
                    void window.maximal.terminal.undock(request).then((moved) => {
                      if (moved) closeTab(tab.id)
                      else setTerminalError('The terminal could not be moved to a new window.')
                    }).catch(() => {
                      setTerminalError('The terminal could not be moved to a new window.')
                    })
                  },
                },
                {
                  id: 'copy-to-new-window',
                  label: 'Copy into New Window',
                  onSelect: () => {
                    const request = terminalWindowRequest(tab)
                    if (!request) return
                    void window.maximal.terminal.copy(request).then((copied) => {
                      if (!copied) setTerminalError('The terminal could not be copied to a new window.')
                    }).catch(() => {
                      setTerminalError('The terminal could not be copied to a new window.')
                    })
                  },
                },
                ...(tab.canRunInBackground
                  ? [{
                      id: 'put-in-background',
                      label: 'Put in Background',
                      separatorBefore: true,
                      onSelect: () => closeTab(tab.id),
                    }]
                  : []),
                {
                  id: 'close',
                  label: 'Close Terminal',
                  shortcut: '⌘W',
                  separatorBefore: !tab.canRunInBackground,
                  onSelect: () => requestCloseTerminal(tab.id),
                },
              ]
            : [],
          onDetachTab: (transfer, position) => {
            const tab = getTabs().find((candidate) => candidate.id === transfer.tabId)
            if (!tab) return
            const request = terminalWindowRequest(tab, position)
            if (!request) return
            void window.maximal.terminal.undock(request).then((moved) => {
              if (moved) closeTab(tab.id)
              else setTerminalError('The terminal could not be moved to a new window.')
            }).catch(() => {
              setTerminalError('The terminal could not be moved to a new window.')
            })
          },
        }}
      >
        {!signedOut && current?.kind === 'overview' ? <Overview /> : null}
        {!signedOut && current?.kind === 'traffic' ? <Traffic /> : null}
        {!signedOut && terminalTabs.length > 0 ? (
          <Terminal
            tabs={terminalTabs}
            activeId={current?.id ?? ''}
            onExit={closeTab}
            onPaneChange={(tabId, pane, baseRevision) => {
              panes.set(tabId, pane)
              paneRevisions.set(tabId, baseRevision)
              const tab = getTabs().find((candidate) => candidate.id === tabId)
              if (tab?.sessionId) void window.maximal.terminal.syncPane(tab.sessionId, pane)
            }}
            onTitleChange={updateTerminalTitle}
            initialPane={detachedWindow?.pane}
            initialPanes={panes}
            paneRevisions={paneRevisions}
          />
        ) : null}
        {current?.kind === 'settings' ? (
          <Settings
            capabilities={settings}
            request={sectionRequest}
            onBack={
              signedOut
                ? () => requestNavigation(() => setActiveTab('overview'))
                : undefined
            }
          />
        ) : null}
      </AppFrame>
      {!signedOut ? (
        <TerminalLauncher
          open={launcherOpen}
          onOpenChange={setLauncherOpen}
          profiles={window.maximal.terminal.profiles}
          discover={window.maximal.terminal.discover}
          launch={async (request) => {
            const result = await window.maximal.terminal.launch(request)
            setRecentProfiles((currentProfiles) => [
              request.profileId,
              ...currentProfiles.filter((id) => id !== request.profileId),
            ].slice(0, 4))
            return result
          }}
          onLaunched={onTerminalLaunched}
          recentProfileIds={recentProfiles}
        />
      ) : null}
      <Dialog
        open={renameState !== undefined}
        onOpenChange={(open) => {
          if (!open) setRenameState(undefined)
        }}
        title="Rename terminal tab"
        className="dialog"
        testId="rename-terminal-tab"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!renameState) return
            const title = terminalProcessTitle(renameState.title)
            if (title !== '') {
              setTabs((current) => current.map((tab) =>
                tab.id === renameState.tabId && tab.kind === 'terminal'
                  ? { ...tab, title, customTitle: true }
                  : tab,
              ))
            }
            setRenameState(undefined)
          }}
        >
          <TextInput
            aria-label="Terminal tab name"
            value={renameState?.title ?? ''}
            onChange={(title) => setRenameState((state) => state ? { ...state, title } : state)}
          />
          <Button type="submit" variant="primary">Rename</Button>
        </form>
      </Dialog>
      <Dialog
        open={terminalError !== undefined}
        onOpenChange={(open) => {
          if (!open) setTerminalError(undefined)
        }}
        title="Terminal action failed"
        description={terminalError}
        className="dialog"
        testId="terminal-action-error"
      >
        <Button variant="primary" onClick={() => setTerminalError(undefined)}>Done</Button>
      </Dialog>
      <Dialog
        open={closeState !== undefined}
        onOpenChange={(open) => {
          if (!open) setCloseState(undefined)
        }}
        title="Close terminal?"
        description={`${closeState?.title ?? 'This terminal'} can keep running after its tab closes.`}
        className="dialog"
        testId="close-terminal"
      >
        <Button
          variant="primary"
          onClick={() => {
            if (!closeState) return
            closeTab(closeState.tabId)
            setCloseState(undefined)
          }}
        >
          Keep Running in Background
        </Button>
        <Button
          onClick={() => {
            if (!closeState) return
            const tabId = closeState.tabId
            setCloseState(undefined)
            void closeTerminal(tabId)
          }}
        >
          Close Terminal
        </Button>
      </Dialog>
    </ObservabilityProvider>
  )
}

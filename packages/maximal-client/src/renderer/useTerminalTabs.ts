import { useCallback, useEffect, useRef, useState } from 'react'
import type { BrowserEvent, BrowserSession } from '@maximal/maximal-browser'
import {
  moveTabBefore,
  type TabColor,
  type TerminalLaunchResult,
} from '@maximal/maximal-electron/renderer'
import { terminalPaneSessionIds, terminalProcessTitle, type TerminalPane, type TerminalSession } from '@maximal/maximal-terminal/renderer'

import {
  PRODUCT_TABS,
  PROJECTS_TAB,
  SETTINGS_TAB,
  type AppTab,
} from './frame/AppFrame'
import {
  createTerminalGroup as createGroup,
  moveTerminalToGroup as moveToGroup,
  removeTerminalFromGroup as removeFromGroup,
  setTerminalTabColor as setTabColor,
} from './terminal-tab-organization'
import { terminalTransport } from './terminal/transport'
import { terminalSessionResult, terminalSessionRoots } from './terminal/session-metadata'
import { tabAfterClose } from './frame/document-tabs'
import {
  useTerminalWindowTransfer,
  type DetachedTerminal,
} from './terminal/window-transfer'

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

function browserTab(session: BrowserSession): AppTab {
  return {
    id: `browser:${session.id}`,
    title: session.title,
    icon: 'browser',
    kind: 'browser',
    browserId: session.id,
    url: session.url,
    browserOwner: session.owner,
    browserControl: session.control,
    terminalSessionIds: session.terminalSessionIds,
    closable: true,
  }
}

function upsertBrowserTab(tabs: AppTab[], session: BrowserSession): AppTab[] {
  const tab = browserTab(session)
  const index = tabs.findIndex((candidate) => candidate.id === tab.id)
  if (index >= 0) return tabs.map((candidate) => candidate.id === tab.id ? tab : candidate)
  if (session.owner === 'agent') return [...tabs, tab]
  const terminalIndex = tabs.findIndex((candidate) => candidate.kind === 'terminal')
  return terminalIndex < 0
    ? [...tabs, tab]
    : [...tabs.slice(0, terminalIndex), tab, ...tabs.slice(terminalIndex)]
}

export function useTerminalTabs(
  detachedWindow?: DetachedTerminal,
  detachedProjects = false,
) {
  const initialTerminalTab = detachedWindow
    ? terminalTab({
        sessionId: detachedWindow.sessionId,
        label: detachedWindow.title,
        canRunInBackground: detachedWindow.canRunInBackground,
      })
    : undefined
  const [tabs, setTabs] = useState<AppTab[]>(
    initialTerminalTab ? [initialTerminalTab] : detachedProjects ? [PROJECTS_TAB] : PRODUCT_TABS,
  )
  const [activeTab, setActiveTab] = useState(initialTerminalTab?.id ?? (detachedProjects ? 'projects' : 'overview'))
  const lastWorkspaceTab = useRef('overview')
  useEffect(() => {
    if (PRODUCT_TABS.some((tab) => tab.id === activeTab)) lastWorkspaceTab.current = activeTab
  }, [activeTab])
  const [launcherOpen, setLauncherOpen] = useState(false)
  const [recentProfiles, setRecentProfiles] = useState<string[]>([])
  const [renameState, setRenameState] = useState<{ tabId: string; title: string }>()
  const [closeState, setCloseState] = useState<{ tabId: string; title: string }>()
  const [terminalError, setTerminalError] = useState<string>()
  const [browserError, setBrowserError] = useState<string>()
  const nextGroupId = useRef(1)
  const transfer = useTerminalWindowTransfer({
    tabs,
    setTabs,
    activeTab,
    setActiveTab,
    detachedWindow,
    initialTerminalTab,
    makeTerminalTab: terminalTab,
    onError: setTerminalError,
  })

  useEffect(() => {
    if (detachedWindow || detachedProjects) return
    void terminalTransport.list().then((sessions) => {
      setTabs((current) => {
        const known = new Set(current.flatMap((tab) => tab.sessionId ?? []))
        for (const session of sessions) {
          if (!session.pane) continue
          const tabId = `terminal:${session.id}`
          transfer.panes.set(tabId, session.pane)
          transfer.paneRevisions.set(tabId, session.revision ?? 0)
        }
        const restored = terminalSessionRoots(sessions)
          .filter((session) => !known.has(session.id))
          .map((session) => terminalTab(terminalSessionResult(session)))
        return restored.length === 0 ? current : [...current, ...restored]
      })
    })
  }, [
    detachedWindow,
    detachedProjects,
    transfer.paneRevisions,
    transfer.panes,
  ])

  const onTerminalLaunched = useCallback((result: TerminalLaunchResult) => {
    const tab = terminalTab(result)
    setTabs((current) => current.some((candidate) => candidate.id === tab.id)
      ? current
      : [...current, tab])
    setActiveTab(tab.id)
  }, [])

  const reopenTerminalSession = useCallback((session: TerminalSession) => {
    if (session.pane) {
      transfer.panes.set(`terminal:${session.id}`, session.pane)
      transfer.paneRevisions.set(`terminal:${session.id}`, session.revision ?? 0)
    }
    onTerminalLaunched(terminalSessionResult(session))
  }, [onTerminalLaunched, transfer.paneRevisions, transfer.panes])

  const openSettings = useCallback(() => {
    setTabs((current) => current.some((tab) => tab.id === SETTINGS_TAB.id)
      ? current
      : [...current, SETTINGS_TAB])
    setActiveTab(SETTINGS_TAB.id)
  }, [])

  const openProjects = useCallback(() => {
    setTabs((current) => current.some((tab) => tab.id === PROJECTS_TAB.id)
      ? current
      : [...current, PROJECTS_TAB])
    setActiveTab(PROJECTS_TAB.id)
  }, [])

  const closeTab = useCallback((id: string) => {
    setTabs((current) => {
      const index = current.findIndex((tab) => tab.id === id)
      const closing = current[index]
      if (index < 0 || (
        closing?.kind !== 'browser'
        && closing?.kind !== 'terminal'
        && closing?.kind !== 'settings'
        && closing?.kind !== 'projects'
      )) return current
      const next = current.filter((tab) => tab.id !== id)
      setActiveTab((active) => active === id
        ? tabAfterClose(current, id, lastWorkspaceTab.current)
        : active)
      return next
    })
  }, [])

  useEffect(() => {
    if (detachedWindow || detachedProjects) return
    void window.maximal.browser.list().then((sessions) => {
      setTabs((current) => sessions.reduce(upsertBrowserTab, current))
    }).catch(() => setBrowserError('Browser tabs could not be restored.'))
    return window.maximal.browser.onEvent((event: BrowserEvent) => {
      if (event.type === 'closed') {
        closeTab(`browser:${event.id}`)
        return
      }
      setTabs((current) => upsertBrowserTab(current, event.session))
      if (event.type === 'opened' && event.session.owner === 'agent') {
        setActiveTab(`browser:${event.session.id}`)
      }
    })
  }, [closeTab, detachedWindow, detachedProjects])

  const openBrowser = useCallback(async (url: string) => {
    try {
      const session = await window.maximal.browser.open(url)
      setTabs((current) => upsertBrowserTab(current, session))
      setActiveTab(`browser:${session.id}`)
    } catch {
      setBrowserError('The browser tab could not be opened.')
    }
  }, [])

  const closeBrowser = useCallback(async (id: string) => {
    const tab = tabs.find((candidate) => candidate.id === id)
    if (!tab?.browserId) return
    try {
      await window.maximal.browser.close(tab.browserId)
      closeTab(id)
    } catch {
      setBrowserError('The browser tab could not be closed.')
    }
  }, [closeTab, tabs])

  const toggleSettings = useCallback(() => {
    setTabs((current) => {
      const index = current.findIndex((tab) => tab.id === SETTINGS_TAB.id)
      if (index < 0) {
        setActiveTab(SETTINGS_TAB.id)
        return [...current, SETTINGS_TAB]
      }
      const next = current.filter((tab) => tab.id !== SETTINGS_TAB.id)
      setActiveTab((active) => active === SETTINGS_TAB.id
        ? tabAfterClose(current, SETTINGS_TAB.id, lastWorkspaceTab.current)
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

  const createTerminalGroup = useCallback((id: string) => {
    setTabs((current) => {
      const next = createGroup(current, id, `terminal-group-${nextGroupId.current}`)
      if (next !== current) nextGroupId.current += 1
      return next
    })
  }, [])

  const moveTerminalToGroup = useCallback((id: string, groupId: string) => {
    setTabs((current) => moveToGroup(current, id, groupId))
  }, [])

  const removeTerminalFromGroup = useCallback((id: string) => {
    setTabs((current) => removeFromGroup(current, id))
  }, [])

  const setTerminalTabColor = useCallback((id: string, color?: TabColor) => {
    setTabs((current) => setTabColor(current, id, color))
  }, [])

  const closeTerminal = useCallback(async (id: string) => {
    const sessionId = tabs.find((tab) => tab.id === id)?.sessionId
    if (sessionId === undefined) return
    const pane = transfer.panes.get(id)
    try {
      await Promise.all(
        terminalPaneSessionIds(pane ?? { sessionId }).map((paneId) =>
          terminalTransport.terminate(paneId)),
      )
      closeTab(id)
    } catch {
      setTerminalError('The terminal could not be closed.')
    }
  }, [closeTab, tabs, transfer.panes])

  const requestCloseTerminal = useCallback((id: string) => {
    const tab = tabs.find((candidate) => candidate.id === id)
    if (tab?.kind !== 'terminal') return
    if (tab.canRunInBackground) {
      setCloseState({ tabId: tab.id, title: tab.title })
      return
    }
    void closeTerminal(tab.id)
  }, [closeTerminal, tabs])

  const renameTerminal = useCallback((id: string, title: string) => {
    const nextTitle = terminalProcessTitle(title)
    if (nextTitle === '') return
    setTabs((current) => current.map((tab) =>
      tab.id === id && tab.kind === 'terminal'
        ? { ...tab, title: nextTitle, customTitle: true }
        : tab,
    ))
  }, [])

  const syncPane = useCallback((
    tabId: string,
    pane: TerminalPane,
    baseRevision: number,
  ) => {
    transfer.panes.set(tabId, pane)
    transfer.paneRevisions.set(tabId, baseRevision)
    const tab = tabs.find((candidate) => candidate.id === tabId)
    if (tab?.sessionId) void window.maximal.terminal.syncPane(tab.sessionId, pane)
  }, [tabs, transfer.paneRevisions, transfer.panes])

  const rememberProfile = useCallback((profileId: string) => {
    setRecentProfiles((current) => [
      profileId,
      ...current.filter((id) => id !== profileId),
    ].slice(0, 4))
  }, [])

  return {
    detachedWindow,
    tabs,
    setTabs,
    activeTab,
    setActiveTab,
    launcherOpen,
    setLauncherOpen,
    recentProfiles,
    renameState,
    setRenameState,
    closeState,
    setCloseState,
    terminalError,
    setTerminalError,
    browserError,
    setBrowserError,
    rememberProfile,
    onTerminalLaunched,
    reopenTerminalSession,
    openProjects,
    openSettings,
    openBrowser,
    closeBrowser,
    toggleSettings,
    closeTab,
    closeTerminal,
    requestCloseTerminal,
    renameTerminal,
    updateTerminalTitle,
    moveTerminalTab,
    createTerminalGroup,
    moveTerminalToGroup,
    removeTerminalFromGroup,
    setTerminalTabColor,
    syncPane,
    ...transfer,
  }
}

export type TerminalTabsState = ReturnType<typeof useTerminalTabs>

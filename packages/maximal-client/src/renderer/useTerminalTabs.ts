import { useCallback, useEffect, useRef, useState } from 'react'
import type { BrowserEvent, BrowserSession } from '@maximal/maximal-browser'
import {
  moveTabBefore,
  type TabColor,
  type TerminalLaunchResult,
} from '@maximal/maximal-electron/renderer'
import { terminalPaneSessionIds, terminalProcessTitle, type TerminalPane } from '@maximal/maximal-terminal/renderer'

import {
  ASSISTANT_TAB,
  PRODUCT_TABS,
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
import {
  useTerminalWindowTransfer,
  type DetachedTerminal,
} from './terminal/window-transfer'
import type { TerminalMenuEntry } from '../shared/host'

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

function terminalMenuEntries(
  tabs: readonly AppTab[],
  panes: ReadonlyMap<string, TerminalPane>,
): TerminalMenuEntry[] {
  return tabs.flatMap((tab) => {
    if (tab.kind !== 'terminal' || !tab.sessionId) return []
    return [{
      id: tab.sessionId,
      title: tab.title,
      paneSessionIds: terminalPaneSessionIds(
        panes.get(tab.id) ?? { sessionId: tab.sessionId },
      ),
    }]
  })
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
) {
  const initialTerminalTab = detachedWindow
    ? terminalTab({
        sessionId: detachedWindow.sessionId,
        label: detachedWindow.title,
        canRunInBackground: detachedWindow.canRunInBackground,
      })
    : undefined
  const [tabs, setTabs] = useState<AppTab[]>(
    initialTerminalTab ? [initialTerminalTab] : PRODUCT_TABS,
  )
  const [activeTab, setActiveTab] = useState(initialTerminalTab?.id ?? 'overview')
  const [launcherOpen, setLauncherOpen] = useState(false)
  const [recentProfiles, setRecentProfiles] = useState<string[]>([])
  const [renameState, setRenameState] = useState<{ tabId: string; title: string }>()
  const [closeState, setCloseState] = useState<{ tabId: string; title: string }>()
  const [terminalError, setTerminalError] = useState<string>()
  const [paneFocusRequest, setPaneFocusRequest] = useState<{
    tabId: string
    sessionId: string
    generation: number
  }>()
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
    void window.maximal.terminal.syncMenu(
      terminalMenuEntries(tabs, transfer.panes),
    )
  }, [tabs, transfer.panes])

  useEffect(() => {
    const stop = window.maximal.terminal.onMenuFocus((request) => {
      const tab = tabs.find((candidate) =>
        candidate.kind === 'terminal' && candidate.sessionId === request.id)
      if (!tab) return
      setActiveTab(tab.id)
      if (request.paneSessionId) {
        const sessionId = request.paneSessionId
        setPaneFocusRequest((previous) => ({
          tabId: tab.id,
          sessionId,
          generation: (previous?.generation ?? 0) + 1,
        }))
      }
    })
    return stop
  }, [tabs])

  useEffect(() => () => {
    void window.maximal.terminal.syncMenu([])
  }, [])

  useEffect(() => {
    if (detachedWindow) return
    void terminalTransport.list().then((sessions) => {
      setTabs((current) => {
        const known = new Set(current.flatMap((tab) => tab.sessionId ?? []))
        const paneLeaves = new Set(sessions.flatMap((session) =>
          session.pane
            ? terminalPaneSessionIds(session.pane).filter((id) => id !== session.id)
            : []))
        for (const session of sessions) {
          if (!session.pane) continue
          const tabId = `terminal:${session.id}`
          transfer.panes.set(tabId, session.pane)
          transfer.paneRevisions.set(tabId, session.revision ?? 0)
        }
        const restored = sessions
          .filter((session) => !known.has(session.id) && !paneLeaves.has(session.id))
          .map((session) => terminalTab({
            sessionId: session.id,
            label: session.title
              ?? session.shell.split(/[\\/]/).at(-1)
              ?? 'Terminal',
            canRunInBackground: session.canRunInBackground ?? false,
          }))
        return restored.length === 0 ? current : [...current, ...restored]
      })
    })
  }, [
    detachedWindow,
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

  useEffect(() => window.maximal.harness.onTerminalOpened(({ chatId, result }) => {
    const tab = { ...terminalTab(result), assistantChatId: chatId }
    setTabs((current) => current.some((candidate) => candidate.id === tab.id)
      ? current
      : [...current, tab])
    setActiveTab(tab.id)
  }), [])

  const openAssistantChat = useCallback((chatId: string) => {
    const existing = tabs.find((tab) => tab.assistantChatId === chatId)
    if (existing) {
      setActiveTab(existing.id)
      return
    }
    void window.maximal.harness.chats.terminal(chatId, 80, 24).then((result) => {
      const tab = { ...terminalTab(result), assistantChatId: chatId }
      setTabs((current) => current.some((candidate) => candidate.id === tab.id)
        ? current
        : [...current, tab])
      setActiveTab(tab.id)
    }).catch(() => {
      setTerminalError('The Assistant chat could not be opened in a terminal.')
    })
  }, [tabs])

  const openSettings = useCallback(() => {
    setTabs((current) => current.some((tab) => tab.id === SETTINGS_TAB.id)
      ? current
      : [...current, SETTINGS_TAB])
    setActiveTab(SETTINGS_TAB.id)
  }, [])

  const openAssistant = useCallback(() => {
    setTabs((current) => current.some((tab) => tab.id === ASSISTANT_TAB.id)
      ? current
      : [...current, ASSISTANT_TAB])
    setActiveTab(ASSISTANT_TAB.id)
  }, [])

  const closeTab = useCallback((id: string) => {
    setTabs((current) => {
      const index = current.findIndex((tab) => tab.id === id)
      const closing = current[index]
      if (
        index < 0
        || (closing?.kind !== 'terminal'
          && closing?.kind !== 'settings'
          && closing?.kind !== 'assistant'
          && closing?.kind !== 'browser')
      ) return current
      const next = current.filter((tab) => tab.id !== id)
      setActiveTab((active) => active === id
        ? (next[index] ?? next[index - 1] ?? PRODUCT_TABS[0])?.id ?? 'overview'
        : active)
      return next
    })
  }, [])

  useEffect(() => {
    if (detachedWindow) return
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
  }, [closeTab, detachedWindow])

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
    void window.maximal.terminal.syncMenu(
      terminalMenuEntries(tabs, transfer.panes),
    )
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
    paneFocusRequest,
    browserError,
    setBrowserError,
    rememberProfile,
    onTerminalLaunched,
    openAssistantChat,
    openSettings,
    openAssistant,
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

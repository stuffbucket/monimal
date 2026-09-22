import { useCallback, useEffect, useState } from 'react'
import {
  moveTabBefore,
  terminalProcessTitle,
  type TerminalLaunchResult,
} from 'stuffbucket-electron/renderer'

import { PRODUCT_TABS, type AppTab } from './frame/AppFrame'
import { terminalTransport } from './terminal/transport'

function terminalTab(result: TerminalLaunchResult): AppTab {
  return {
    id: `terminal:${result.sessionId}`,
    title: result.label,
    icon: 'terminal',
    kind: 'terminal',
    sessionId: result.sessionId,
  }
}

export function useTerminalTabs(authenticated: boolean | null) {
  const [tabs, setTabs] = useState<AppTab[]>(PRODUCT_TABS)
  const [activeTab, setActiveTab] = useState('overview')
  const [launcherOpen, setLauncherOpen] = useState(false)
  const [recentProfiles, setRecentProfiles] = useState<string[]>([])

  useEffect(() => {
    if (authenticated !== true) return
    void terminalTransport.list().then((sessions) => {
      setTabs((current) => {
        const known = new Set(current.flatMap((tab) => tab.sessionId ?? []))
        const restored = sessions
          .filter((session) => !known.has(session.id))
          .map((session) => terminalTab({
            sessionId: session.id,
            label: session.shell.split('/').at(-1) ?? 'Terminal',
          }))
        return restored.length === 0 ? current : [...current, ...restored]
      })
    })
  }, [authenticated])

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
    setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, title: nextTitle } : tab))
  }, [])

  const moveTerminalTab = useCallback((id: string, beforeId?: string) => {
    setTabs((current) => {
      const source = current.find((tab) => tab.id === id)
      const target = current.find((tab) => tab.id === beforeId)
      if (source?.kind !== 'terminal' || (target && target.kind !== 'terminal')) return current
      return moveTabBefore(current, id, beforeId)
    })
  }, [])

  const rememberProfile = useCallback((profileId: string) => {
    setRecentProfiles((current) => [
      profileId,
      ...current.filter((id) => id !== profileId),
    ].slice(0, 4))
  }, [])

  return {
    tabs,
    activeTab,
    setActiveTab,
    launcherOpen,
    setLauncherOpen,
    recentProfiles,
    rememberProfile,
    onTerminalLaunched,
    closeTab,
    updateTerminalTitle,
    moveTerminalTab,
  }
}

export type TerminalTabsState = ReturnType<typeof useTerminalTabs>
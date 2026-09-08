import { Plus, X } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactElement } from 'react'
import {
  Button,
  IconButton,
  readTerminalTheme,
  SHELL_TERMINAL_PROPERTIES,
  TerminalLauncher,
  TerminalTabs,
  type TerminalLaunchResult,
} from 'stuffbucket-electron/renderer'

import { SurfaceTop } from '../frame/AppFrame'
import { terminalTransport } from './transport'

interface TerminalTab {
  id: string
  sessionId: string
  title: string
}

function currentTheme() {
  const styles = getComputedStyle(document.documentElement)
  return readTerminalTheme(
    (property) => styles.getPropertyValue(property),
    {
      ...SHELL_TERMINAL_PROPERTIES,
      foreground: '--maximal-terminal-foreground',
      cursor: '--maximal-terminal-cursor',
    },
  )
}

export function Terminal(): ReactElement {
  const [launcherOpen, setLauncherOpen] = useState(false)
  const [tabs, setTabs] = useState<TerminalTab[]>([])
  const [activeId, setActiveId] = useState('')
  const [recentProfiles, setRecentProfiles] = useState<string[]>([])

  useEffect(() => {
    void terminalTransport.list().then((sessions) => {
      const restored = sessions.map((session) => ({
        id: session.id,
        sessionId: session.id,
        title: session.shell.split('/').at(-1) ?? 'Terminal',
      }))
      setTabs(restored)
      setActiveId((current) => current || restored[0]?.id || '')
    })
  }, [])

  const onLaunched = useCallback((result: TerminalLaunchResult) => {
    const tab = { id: result.sessionId, sessionId: result.sessionId, title: result.label }
    setTabs((current) => [...current, tab])
    setActiveId(tab.id)
  }, [])

  const launchSplit = useCallback(async () => {
    const result = await window.maximal.terminal.launch({ profileId: 'local', cols: 80, rows: 24 })
    return { sessionId: result.sessionId }
  }, [])

  const close = (tab: TerminalTab): void => {
    void terminalTransport.terminate(tab.sessionId)
    setTabs((current) => {
      const next = current.filter((candidate) => candidate.id !== tab.id)
      setActiveId((active) => (active === tab.id ? next[0]?.id ?? '' : active))
      return next
    })
  }

  return (
    <>
      <SurfaceTop>
        <div className="terminal-tabs-toolbar">
          {tabs.map((tab) => (
            <div className="terminal-tabs-toolbar__tab" data-active={tab.id === activeId} key={tab.id}>
              <Button onClick={() => setActiveId(tab.id)}>{tab.title}</Button>
              <IconButton label={`Close ${tab.title}`} onClick={() => close(tab)}><X size={14} /></IconButton>
            </div>
          ))}
          <IconButton label="Open terminal" onClick={() => setLauncherOpen(true)}><Plus size={16} /></IconButton>
        </div>
      </SurfaceTop>
      {tabs.length === 0 ? (
        <div className="terminal-empty">
          <Button onClick={() => setLauncherOpen(true)}><Plus size={16} /> Open terminal</Button>
        </div>
      ) : (
        <TerminalTabs
          activeId={activeId}
          attachments={tabs}
          disposition="detach"
          launchSplit={launchSplit}
          onTitleChange={(id, title) =>
            setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, title } : tab))
          }
          theme={currentTheme()}
          transport={terminalTransport}
        />
      )}
      <TerminalLauncher
        open={launcherOpen}
        onOpenChange={setLauncherOpen}
        profiles={window.maximal.terminal.profiles}
        discover={window.maximal.terminal.discover}
        launch={async (request) => {
          const result = await window.maximal.terminal.launch(request)
          setRecentProfiles((current) => [request.profileId, ...current.filter((id) => id !== request.profileId)].slice(0, 4))
          return result
        }}
        onLaunched={onLaunched}
        recentProfileIds={recentProfiles}
      />
    </>
  )
}
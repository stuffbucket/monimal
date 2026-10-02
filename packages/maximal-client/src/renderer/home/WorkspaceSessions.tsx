import { useEffect, type ReactElement } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Note } from '@maximal/maximal-electron/renderer'
import type { DetachableTerminalTransport, TerminalSession } from '@maximal/maximal-terminal/renderer'

import type { AppTab } from '../frame/AppFrame'
import { describeError } from '../shared/errors'
import { terminalSessionResult, terminalSessionRoots } from '../terminal/session-metadata'

const terminalSessionsQueryKey = ['workspace', 'terminal-sessions'] as const

export function TerminalSessions({
  tabs,
  transport,
  onSelectTab,
  onResume,
  onNew,
  onClose,
}: {
  tabs: AppTab[]
  transport: DetachableTerminalTransport
  onSelectTab: (id: string) => void
  onResume: (session: TerminalSession) => void
  onNew: () => void
  onClose: (id: string) => void
}): ReactElement {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: terminalSessionsQueryKey,
    queryFn: () => transport.list(),
    select: terminalSessionRoots,
    refetchOnMount: 'always',
  })
  const sessions = query.data ?? []
  useEffect(() => {
    const stop = (query.data ?? []).map((session) => transport.subscribe(session.id, (event) => {
      if (event.type === 'exit') void queryClient.invalidateQueries({ queryKey: terminalSessionsQueryKey })
    }))
    return () => { stop.forEach((unsubscribe) => unsubscribe()) }
  }, [queryClient, query.data, transport])

  return (
    <main className="workspace-surface" aria-label="Terminals" data-testid="workspace-terminals">
      <header className="workspace-surface__header">
        <h1>Terminals</h1>
        <p>Open terminal tabs and resume sessions running in the background.</p>
      </header>
      <div className="workspace-surface__actions">
        <Button variant="primary" onClick={onNew}>New terminal</Button>
        <Button disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh sessions</Button>
      </div>
      {query.isPending ? <Note live="polite">Loading terminal sessions...</Note> : null}
      {query.error ? <Note status="failed" live="assertive">Could not load terminal sessions: {describeError(query.error)}</Note> : null}
      {query.isSuccess && sessions.length === 0 ? <Note>No terminal sessions are running.</Note> : null}
      <ul className="workspace-surface__list" aria-label="Terminal sessions">
        {sessions.map((session) => {
          const tab = tabs.find(({ sessionId }) => sessionId === session.id)
          const title = tab?.title ?? terminalSessionResult(session).label
          return (
            <li key={session.id} className="workspace-surface__entry">
              <div className="workspace-surface__copy">
                <strong>{title}</strong>
                <span className="workspace-surface__detail">{session.cwd}</span>
                <span className="workspace-surface__detail">{tab ? 'Open tab' : 'Running in background'}</span>
              </div>
              <div className="workspace-surface__actions">
                <Button
                  aria-label={`${tab ? 'Open' : 'Resume'} ${title}`}
                  onClick={() => tab ? onSelectTab(tab.id) : onResume(session)}
                >{tab ? 'Open' : 'Resume'}</Button>
                {tab ? <Button aria-label={`Close ${title}`} onClick={() => onClose(tab.id)}>Close</Button> : null}
              </div>
            </li>
          )
        })}
      </ul>
    </main>
  )
}

export function BrowserSessions({
  tabs,
  onSelectTab,
  onNew,
  onClose,
}: {
  tabs: AppTab[]
  onSelectTab: (id: string) => void
  onNew: () => void
  onClose: (id: string) => void
}): ReactElement {
  const browsers = tabs.filter(({ kind }) => kind === 'browser')
  return (
    <main className="workspace-surface" aria-label="Browsers" data-testid="workspace-browsers">
      <header className="workspace-surface__header">
        <h1>Browsers</h1>
        <p>Manage open user and agent browser tabs.</p>
      </header>
      <div className="workspace-surface__actions">
        <Button variant="primary" onClick={onNew}>New browser</Button>
      </div>
      {browsers.length === 0 ? <Note>No browser tabs are open.</Note> : null}
      <ul className="workspace-surface__list" aria-label="Browser tabs">
        {browsers.map((tab) => (
          <li key={tab.id} className="workspace-surface__entry">
            <div className="workspace-surface__copy">
              <strong>{tab.title}</strong>
              <span className="workspace-surface__detail">{tab.url}</span>
              <span className="workspace-surface__detail">{tab.browserOwner === 'agent' ? 'Agent browser' : 'User browser'}{tab.browserControl ? ` / ${tab.browserControl}` : ''}</span>
            </div>
            <div className="workspace-surface__actions">
              <Button aria-label={`Open ${tab.title}`} onClick={() => onSelectTab(tab.id)}>Open</Button>
              <Button aria-label={`Close ${tab.title}`} onClick={() => onClose(tab.id)}>Close</Button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}

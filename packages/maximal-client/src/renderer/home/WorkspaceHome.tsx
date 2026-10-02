import { useState, type ReactElement } from 'react'
import { Button, Note } from '@maximal/maximal-electron/renderer'
import type { TerminalPane } from '@maximal/maximal-terminal/renderer'

import type { AppTab } from '../frame/AppFrame'
import { WorkspaceMap } from '../workspace-map/WorkspaceMap'

const EMPTY_PANES: ReadonlyMap<string, TerminalPane> = new Map()

export function WorkspaceHome({
  tabs,
  panes = EMPTY_PANES,
  onSelectTab,
  onOpenProjects,
  onNewTerminal,
  onNewBrowser,
}: {
  tabs: AppTab[]
  panes?: ReadonlyMap<string, TerminalPane>
  onSelectTab: (id: string) => void
  onOpenProjects: () => void
  onNewTerminal: () => void
  onNewBrowser: () => void
}): ReactElement {
  const [mapOpen, setMapOpen] = useState(false)
  const documents = tabs.filter(({ kind }) =>
    kind === 'projects' || kind === 'terminal' || kind === 'browser' || kind === 'settings')
  return (
    <main className="workspace-surface" aria-label="Home" data-testid="workspace-home">
      <header className="workspace-surface__header">
        <h1>Home</h1>
        <p>Start work and return to your open documents.</p>
      </header>
      <div className="workspace-surface__actions">
        <Button variant="primary" onClick={onOpenProjects}>Open Projects</Button>
        <Button onClick={onNewTerminal}>New terminal</Button>
        <Button onClick={onNewBrowser}>New browser</Button>
        <Button onClick={() => setMapOpen(true)}>Workspace map</Button>
      </div>
      <section aria-label="Open documents">
        <h2>Open documents</h2>
        {documents.length === 0 ? (
          <Note>No documents are open. Open a project or start a session above.</Note>
        ) : (
          <ul className="workspace-surface__list">
            {documents.map((tab) => (
              <li key={tab.id} className="workspace-surface__entry">
                <div className="workspace-surface__copy">
                  <strong>{tab.title}</strong>
                  <span className="workspace-surface__detail">{tab.url ?? tab.kind}</span>
                </div>
                <Button aria-label={`Open ${tab.title}`} onClick={() => onSelectTab(tab.id)}>Open</Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <WorkspaceMap
        open={mapOpen}
        tabs={tabs}
        panes={panes}
        onOpenChange={setMapOpen}
        onFocus={(id) => {
          setMapOpen(false)
          onSelectTab(id)
        }}
      />
    </main>
  )
}

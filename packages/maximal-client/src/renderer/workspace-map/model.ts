import { terminalPaneSessionIds } from '@maximal/maximal-terminal/renderer'

import type { AppTab } from '../frame/AppFrame'

export interface WorkspaceMapPoint {
  x: number
  y: number
}

export interface WorkspaceMapNode {
  id: string
  title: string
  kind: 'browser' | 'terminal'
  detail: string
  position: WorkspaceMapPoint
}

export interface WorkspaceMapEdge {
  from: string
  to: string
}

export function workspaceMap(
  tabs: AppTab[],
  panes: ReadonlyMap<string, import('@maximal/maximal-terminal/renderer').TerminalPane>,
): { nodes: WorkspaceMapNode[]; edges: WorkspaceMapEdge[] } {
  const terminals = tabs.filter((tab) => tab.kind === 'terminal' && tab.sessionId)
  const browsers = tabs.filter((tab) => tab.kind === 'browser')
  const nodes: WorkspaceMapNode[] = terminals.map((tab, index) => ({
    id: tab.id,
    title: tab.title,
    kind: 'terminal',
    detail: `${terminalPaneSessionIds(
      panes.get(tab.id) ?? { sessionId: tab.sessionId! },
    ).length} PTY`,
    position: { x: index * 420, y: 0 },
  }))
  const edges: WorkspaceMapEdge[] = []
  const browserCounts = new Map<string, number>()

  browsers.forEach((browser, index) => {
    const owner = terminals.find((terminal) => {
      if (!terminal.sessionId) return false
      const sessionIds = terminalPaneSessionIds(
        panes.get(terminal.id) ?? { sessionId: terminal.sessionId },
      )
      return browser.terminalSessionIds?.some((id) => sessionIds.includes(id))
    })
    const clusterIndex = owner ? terminals.indexOf(owner) : index
    const ownerCount = owner ? browserCounts.get(owner.id) ?? 0 : index
    if (owner) {
      browserCounts.set(owner.id, ownerCount + 1)
      edges.push({ from: owner.id, to: browser.id })
    }
    nodes.push({
      id: browser.id,
      title: browser.title,
      kind: 'browser',
      detail: browser.browserControl === 'agent-exclusive'
        ? 'Agent exclusive'
        : browser.browserControl === 'agent-shared'
          ? 'Agent shared'
          : 'Browser',
      position: {
        x: clusterIndex * 420 + (owner ? 70 : 0),
        y: owner ? 180 + ownerCount * 130 : 440,
      },
    })
  })

  return { nodes, edges }
}

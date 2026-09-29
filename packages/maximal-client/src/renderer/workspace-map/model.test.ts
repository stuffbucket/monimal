import { describe, expect, it } from 'vitest'
import type { TerminalPane } from '@maximal/maximal-terminal/renderer'

import type { AppTab } from '../frame/AppFrame'
import { workspaceMap } from './model'

describe('workspaceMap', () => {
  it('clusters a browser associated with any terminal split under its terminal tab', () => {
    const tabs: AppTab[] = [
      {
        id: 'terminal:one',
        title: 'Terminal',
        icon: 'terminal',
        kind: 'terminal',
        closable: true,
        sessionId: 'pty:root',
      },
      {
        id: 'browser:one',
        title: 'Documentation',
        icon: 'browser',
        kind: 'browser',
        closable: true,
        browserId: 'browser-session',
        browserControl: 'agent-exclusive',
        terminalSessionIds: ['pty:split'],
      },
    ]
    const panes = new Map<string, TerminalPane>([
      ['terminal:one', {
        direction: 'right',
        first: { sessionId: 'pty:root' },
        second: { sessionId: 'pty:split' },
      }],
    ])

    const graph = workspaceMap(tabs, panes)

    expect(graph.edges).toEqual([{ from: 'terminal:one', to: 'browser:one' }])
    expect(graph.nodes.find((node) => node.id === 'browser:one')).toMatchObject({
      detail: 'Agent exclusive',
      position: { x: 70, y: 180 },
    })
  })
})

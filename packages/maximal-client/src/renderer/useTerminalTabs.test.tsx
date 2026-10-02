import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserEvent } from '@maximal/maximal-browser'
import type { TerminalPane } from '@maximal/maximal-terminal/renderer'

const { terminalList } = vi.hoisted(() => ({ terminalList: vi.fn() }))
vi.mock('./terminal/transport', () => ({ terminalTransport: { list: terminalList } }))
vi.mock('./frame/AppFrame', () => ({
  PRODUCT_TABS: [{ id: 'overview', title: 'Overview', kind: 'overview' }],
  PROJECTS_TAB: { id: 'projects', title: 'Projects', kind: 'projects', closable: true },
  SETTINGS_TAB: { id: 'settings', title: 'Settings', kind: 'settings' },
}))

import { useTerminalTabs, type TerminalTabsState } from './useTerminalTabs'

const pane: TerminalPane = {
  direction: 'right',
  first: { sessionId: 'primary' },
  second: { sessionId: 'split' },
}
const durable = {
  id: 'primary', cwd: '/tmp', shell: '/bin/zsh', startedAt: 1,
  title: 'Build workspace', canRunInBackground: true, pane, revision: 7,
}
let root: Root
let container: HTMLDivElement
let browserListener: ((event: BrowserEvent) => void) | undefined

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  terminalList.mockReset()
  browserListener = undefined
  terminalList.mockResolvedValue([durable])
  Object.defineProperty(window, 'maximal', {
    configurable: true,
    value: {
      browser: {
        list: async () => [],
        setTerminalContext: async () => undefined,
        onEvent: (listener: typeof browserListener) => {
          browserListener = listener
          return () => { browserListener = undefined }
        },
      },
      terminal: {
        frameId: async () => 'test-window',
        onTabRedocked: () => () => undefined,
        onPaneChanged: () => () => undefined,
      },
    },
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

async function restore() {
  function Harness() {
    const state = useTerminalTabs()
    return <pre>{JSON.stringify({
      tabs: state.tabs.filter((tab) => tab.kind === 'terminal'),
      allTabs: state.tabs,
      activeTab: state.activeTab,
      panes: [...state.panes],
      revisions: [...state.paneRevisions],
    })}</pre>
  }
  await act(async () => { root.render(<Harness />) })
  return JSON.parse(container.textContent ?? '') as {
    tabs: Array<{ id: string; title: string; canRunInBackground?: boolean }>
    allTabs: Array<{ id: string; kind: string; browserOwner?: string }>
    activeTab: string
    panes: Array<[string, unknown]>
    revisions: Array<[string, number]>
  }
}

describe('terminal reconstruction', () => {
  it('starts a detached Projects frame without claiming workspace terminal sessions', async () => {
    let state: TerminalTabsState | undefined
    function Harness() {
      state = useTerminalTabs(undefined, true)
      return null
    }
    await act(async () => { root.render(<Harness />) })
    expect(state?.tabs.map((tab) => tab.id)).toEqual(['projects'])
    expect(state?.activeTab).toBe('projects')
    expect(terminalList).not.toHaveBeenCalled()
  })
  it('opens Projects once as a closable document tab', async () => {
    terminalList.mockResolvedValue([])
    let state: TerminalTabsState | undefined
    function Harness() {
      state = useTerminalTabs()
      return null
    }
    await act(async () => { root.render(<Harness />) })

    act(() => state?.openProjects())
    act(() => state?.openProjects())
    expect(state?.tabs.filter((tab) => tab.id === 'projects')).toHaveLength(1)
    expect(state?.activeTab).toBe('projects')

    act(() => state?.closeTab('projects'))
    expect(state?.tabs.some((tab) => tab.id === 'projects')).toBe(false)
    expect(state?.activeTab).toBe('overview')
  })

  it('restores an ordinary direct terminal', async () => {
    terminalList.mockResolvedValue([{ id: 'direct', cwd: '/tmp', shell: '/bin/zsh', startedAt: 1 }])
    expect((await restore()).tabs).toEqual([expect.objectContaining({ id: 'terminal:direct', title: 'zsh' })])
  })

  it('restores a split as one document rather than separate leaf tabs', async () => {
    terminalList.mockResolvedValue([durable, { id: 'split', cwd: '/tmp', shell: '/bin/zsh', startedAt: 2 }])
    expect((await restore()).tabs.map((tab) => tab.id)).toEqual(['terminal:primary'])
  })

  it('restores the split topology and revision', async () => {
    const restored = await restore()
    expect(restored.panes).toEqual([['terminal:primary', pane]])
    expect(restored.revisions).toEqual([['terminal:primary', 7]])
  })

  it('resumes a background split without spawning a new session or leaf tabs', async () => {
    terminalList.mockResolvedValue([])
    let state: TerminalTabsState | undefined
    function Harness() {
      state = useTerminalTabs()
      return null
    }
    await act(async () => { root.render(<Harness />) })
    act(() => state?.reopenTerminalSession(durable))
    act(() => state?.reopenTerminalSession(durable))
    expect(state?.tabs.filter((tab) => tab.kind === 'terminal').map((tab) => tab.id))
      .toEqual(['terminal:primary'])
    expect(state?.activeTab).toBe('terminal:primary')
    expect(state?.panes.get('terminal:primary')).toEqual(pane)
    expect(state?.paneRevisions.get('terminal:primary')).toBe(7)
  })

  it('retains the host-owned document title', async () => {
    expect((await restore()).tabs[0]?.title).toBe('Build workspace')
  })

  it('retains the host-owned background capability', async () => {
    expect((await restore()).tabs[0]?.canRunInBackground).toBe(true)
  })

  it('groups an agent-opened browser after terminal tabs and activates it', async () => {
    await restore()
    await act(async () => {
      browserListener?.({
        type: 'opened',
        session: {
          id: 'browser-1',
          url: 'https://example.com/',
          title: 'Example',
          owner: 'agent',
          control: 'agent-exclusive',
          terminalSessionIds: ['primary', 'split'],
        },
      })
    })
    const state = JSON.parse(container.textContent ?? '') as Awaited<ReturnType<typeof restore>>
    expect(state.allTabs.slice(-2).map(({ kind }) => kind)).toEqual(['terminal', 'browser'])
    expect(state.activeTab).toBe('browser:browser-1')
  })

  it('groups terminals and assigns an individual tab color', async () => {
    terminalList.mockResolvedValue([
      { id: 'api', cwd: '/tmp', shell: '/bin/zsh', startedAt: 1 },
      { id: 'worker', cwd: '/tmp', shell: '/bin/zsh', startedAt: 2 },
    ])
    let state: TerminalTabsState | undefined

    function Harness() {
      state = useTerminalTabs()
      return null
    }

    await act(async () => { root.render(<Harness />) })
    if (!state) throw new Error('terminal state did not render')

    act(() => state?.createTerminalGroup('terminal:api'))
    const group = state.tabs.find((tab) => tab.id === 'terminal:api')?.group
    expect(group).toEqual(expect.objectContaining({ label: 'Group 1', color: 'blue' }))

    act(() => {
      if (group) state?.moveTerminalToGroup('terminal:worker', group.id)
      state?.setTerminalTabColor('terminal:worker', 'orange')
    })
    expect(state.tabs.filter((tab) => tab.group?.id === group?.id).map((tab) => tab.id))
      .toEqual(['terminal:api', 'terminal:worker'])
    expect(state.tabs.find((tab) => tab.id === 'terminal:worker')?.color).toBe('orange')

    act(() => state?.removeTerminalFromGroup('terminal:worker'))
    expect(state.tabs.find((tab) => tab.id === 'terminal:worker')?.group).toBeUndefined()
  })
})
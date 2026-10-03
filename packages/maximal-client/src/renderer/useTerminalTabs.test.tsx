import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserEvent } from '@maximal/maximal-browser'
import type { TerminalPane } from '@maximal/maximal-terminal/renderer'
import type {
  MaximalHost,
  TerminalMenuFocusRequest,
} from '../shared/host'

const { chatTerminal, onMenuFocus, syncMenu, terminalList } = vi.hoisted(() => ({
  chatTerminal: vi.fn(),
  onMenuFocus: vi.fn(),
  syncMenu: vi.fn(() => Promise.resolve()),
  terminalList: vi.fn(),
}))
vi.mock('./terminal/transport', () => ({ terminalTransport: { list: terminalList } }))
vi.mock('./frame/AppFrame', () => ({
  PRODUCT_TABS: [{ id: 'overview', title: 'Overview', kind: 'overview' }],
  PROJECTS_TAB: { id: 'projects', title: 'Projects', kind: 'projects', closable: true },
  SETTINGS_TAB: { id: 'settings', title: 'Settings', kind: 'settings' },
  ASSISTANT_TAB: { id: 'assistant', title: 'Assistant', kind: 'assistant' },
}))

import { useTerminalTabs, type TerminalTabsState } from './useTerminalTabs'
import type { DetachedTerminal } from './terminal/window-transfer'

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
let focusFromMenu: (request: TerminalMenuFocusRequest) => void
let terminalOpened: Parameters<MaximalHost['harness']['onTerminalOpened']>[0]
let openAssistantChat: (chatId: string) => void
let browserListener: ((event: BrowserEvent) => void) | undefined
interface RenderedTerminalTabsState {
  tabs: Array<{
    id: string
    title: string
    canRunInBackground?: boolean
    assistantChatId?: string
  }>
  allTabs: Array<{ id: string; kind: string; browserOwner?: string }>
  panes: Array<[string, unknown]>
  revisions: Array<[string, number]>
  activeTab: string
  paneFocusRequest?: {
    tabId: string
    sessionId: string
    generation: number
  }
}
let renderedState: RenderedTerminalTabsState | undefined

function currentState(): RenderedTerminalTabsState {
  if (!renderedState) throw new Error('terminal state did not render')
  return renderedState
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  terminalList.mockReset()
  browserListener = undefined
  terminalList.mockResolvedValue([durable])
  syncMenu.mockClear()
  chatTerminal.mockReset()
  chatTerminal.mockResolvedValue({
    sessionId: 'assistant-terminal',
    label: 'Assistant chat',
    canRunInBackground: false,
  })
  onMenuFocus.mockReset()
  onMenuFocus.mockImplementation((
    listener: (request: TerminalMenuFocusRequest) => void,
  ) => {
    focusFromMenu = listener
    return () => undefined
  })
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
        syncMenu,
        onMenuFocus,
        onTabRedocked: () => () => undefined,
        onPaneChanged: () => () => undefined,
      },
      harness: {
        chats: { terminal: chatTerminal },
        onTerminalOpened: vi.fn((listener: typeof terminalOpened) => {
          terminalOpened = listener
          return () => undefined
        }),
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

async function restore(detachedWindow?: DetachedTerminal) {
  function Harness() {
    const state = useTerminalTabs(detachedWindow)
    openAssistantChat = state.openAssistantChat
    renderedState = {
      tabs: state.tabs.filter((tab) => tab.kind === 'terminal'),
      allTabs: state.tabs,
      activeTab: state.activeTab,
      panes: [...state.panes],
      revisions: [...state.paneRevisions],
      paneFocusRequest: state.paneFocusRequest,
    }
    return null
  }
  await act(async () => { root.render(<Harness />) })
  return currentState()
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

  it('publishes terminal tabs and their split sessions to the native menu', async () => {
    await restore()

    expect(syncMenu).toHaveBeenLastCalledWith([{
      id: 'primary',
      title: 'Build workspace',
      paneSessionIds: ['primary', 'split'],
    }])
  })

  it('publishes terminals and splits owned by a detached window', async () => {
    await restore({
      sessionId: 'primary',
      title: 'Detached build',
      canRunInBackground: true,
      pane,
    })

    expect(syncMenu).toHaveBeenLastCalledWith([{
      id: 'primary',
      title: 'Detached build',
      paneSessionIds: ['primary', 'split'],
    }])
  })

  it('activates a terminal without changing its focused split', async () => {
    await restore()

    await act(async () => {
      focusFromMenu({ id: 'primary' })
    })

    const state = currentState()
    expect(state.activeTab).toBe('terminal:primary')
    expect(state.paneFocusRequest).toBeUndefined()
  })

  it('activates and repeatedly focuses a split selected from the native menu', async () => {
    await restore()

    await act(async () => {
      focusFromMenu({ id: 'primary', paneSessionId: 'split' })
    })
    await act(async () => {
      focusFromMenu({ id: 'primary', paneSessionId: 'split' })
    })

    const state = currentState()
    expect(state.activeTab).toBe('terminal:primary')
    expect(state.paneFocusRequest).toEqual({
      tabId: 'terminal:primary',
      sessionId: 'split',
      generation: 2,
    })
  })

  it('launches an Assistant chat once and reuses its terminal tab', async () => {
    await restore()

    await act(async () => {
      openAssistantChat('chat-1')
      await Promise.resolve()
    })
    await act(async () => {
      openAssistantChat('chat-1')
    })

    const state = currentState()
    expect(chatTerminal).toHaveBeenCalledOnce()
    expect(chatTerminal).toHaveBeenCalledWith('chat-1', 80, 24)
    expect(state.tabs).toContainEqual(expect.objectContaining({
      assistantChatId: 'chat-1',
    }))
    expect(state.activeTab).toBe('terminal:assistant-terminal')
  })

  it('adopts an Assistant terminal launched by the overlay', async () => {
    await restore()

    act(() => terminalOpened({
      chatId: 'chat-2',
      result: {
        sessionId: 'overlay-terminal',
        label: 'Overlay chat',
        canRunInBackground: false,
      },
    }))

    const state = currentState()
    expect(state.tabs).toContainEqual(expect.objectContaining({
      assistantChatId: 'chat-2',
    }))
    expect(state.activeTab).toBe('terminal:overlay-terminal')
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
    const state = currentState()
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
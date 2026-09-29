import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  SETTINGS_TAB: { id: 'settings', title: 'Settings', kind: 'settings' },
  ASSISTANT_TAB: { id: 'assistant', title: 'Assistant', kind: 'assistant' },
}))

import { useTerminalTabs, type TerminalTabsState } from './useTerminalTabs'
import type { DetachedTerminal } from './terminal/window-transfer'

const pane = {
  direction: 'right' as const,
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

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  terminalList.mockReset()
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
    return <pre>{JSON.stringify({
      tabs: state.tabs.filter((tab) => tab.kind === 'terminal'),
      panes: [...state.panes],
      revisions: [...state.paneRevisions],
      activeTab: state.activeTab,
      paneFocusRequest: state.paneFocusRequest,
    })}</pre>
  }
  await act(async () => { root.render(<Harness />) })
  return JSON.parse(container.textContent ?? '') as {
    tabs: Array<{
      id: string
      title: string
      canRunInBackground?: boolean
      assistantChatId?: string
    }>
    panes: Array<[string, unknown]>
    revisions: Array<[string, number]>
    activeTab: string
    paneFocusRequest?: {
      tabId: string
      sessionId: string
      generation: number
    }
  }
}

describe('terminal reconstruction', () => {
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

    const state = JSON.parse(container.textContent ?? '') as {
      activeTab: string
      paneFocusRequest?: unknown
    }
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

    const state = JSON.parse(container.textContent ?? '') as {
      activeTab: string
      paneFocusRequest?: {
        tabId: string
        sessionId: string
        generation: number
      }
    }
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

    const state = JSON.parse(container.textContent ?? '') as {
      tabs: Array<{ assistantChatId?: string }>
      activeTab: string
    }
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

    const state = JSON.parse(container.textContent ?? '') as {
      tabs: Array<{ assistantChatId?: string }>
      activeTab: string
    }
    expect(state.tabs).toContainEqual(expect.objectContaining({
      assistantChatId: 'chat-2',
    }))
    expect(state.activeTab).toBe('terminal:overlay-terminal')
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
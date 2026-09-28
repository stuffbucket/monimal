import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { terminalList } = vi.hoisted(() => ({ terminalList: vi.fn() }))
vi.mock('./terminal/transport', () => ({ terminalTransport: { list: terminalList } }))
vi.mock('./frame/AppFrame', () => ({
  PRODUCT_TABS: [{ id: 'overview', title: 'Overview', kind: 'overview' }],
  SETTINGS_TAB: { id: 'settings', title: 'Settings', kind: 'settings' },
}))

import { useTerminalTabs } from './useTerminalTabs'

const pane = {
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

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  terminalList.mockReset()
  terminalList.mockResolvedValue([durable])
  Object.defineProperty(window, 'maximal', {
    configurable: true,
    value: {
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
      panes: [...state.panes],
      revisions: [...state.paneRevisions],
    })}</pre>
  }
  await act(async () => { root.render(<Harness />) })
  return JSON.parse(container.textContent ?? '') as {
    tabs: Array<{ id: string; title: string; canRunInBackground?: boolean }>
    panes: Array<[string, unknown]>
    revisions: Array<[string, number]>
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
})
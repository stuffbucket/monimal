import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { DetachableTerminalTransport, TerminalEvent } from '@maximal/maximal-terminal/renderer'

import { createMaximalQueryClient } from '../query-client'
import { BrowserSessions, TerminalSessions } from './WorkspaceSessions'
import { WorkspaceHome } from './WorkspaceHome'
import type { AppTab } from '../frame/AppFrame'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root
let container: HTMLDivElement
let queryClient: ReturnType<typeof createMaximalQueryClient>
let terminalEvent: ((event: TerminalEvent) => void) | undefined
const list = vi.fn<DetachableTerminalTransport['list']>()
const transport: DetachableTerminalTransport = {
  list,
  spawn: vi.fn(),
  write: vi.fn(),
  resize: vi.fn(),
  terminate: vi.fn(),
  subscribe: vi.fn<DetachableTerminalTransport['subscribe']>((_id, listener) => {
    terminalEvent = listener
    return () => { terminalEvent = undefined }
  }),
}
const session = { id: 'one', title: 'Build', shell: '/bin/zsh', cwd: '/work/build', startedAt: 1 }
const terminal: AppTab = { id: 'terminal:one', title: 'Build', kind: 'terminal', sessionId: 'one' }
const browser: AppTab = { id: 'browser:one', title: 'Docs', kind: 'browser', browserId: 'one', url: 'https://example.org', browserOwner: 'agent', browserControl: 'agent-exclusive' }
const onSelect = vi.fn()
const onResume = vi.fn()
const onNew = vi.fn()
const onClose = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  terminalEvent = undefined
  list.mockResolvedValue([session])
  queryClient = createMaximalQueryClient()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})
async function render(element: ReactElement) {
  await act(async () => {
    root.render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>)
  })
  await settle()
}
async function settle() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
}
function click(label: string) {
  const button = [...container.querySelectorAll('button')].find(element =>
    element.getAttribute('aria-label') === label || element.textContent === label)
  if (!button) throw new Error(`Missing action ${label}`)
  act(() => button.click())
}
function terminals(tabs: AppTab[] = []) {
  return <TerminalSessions tabs={tabs} transport={transport} onSelectTab={onSelect} onResume={onResume} onNew={onNew} onClose={onClose} />
}

it('opens an attached terminal and uses the existing close flow', async () => {
  await render(terminals([terminal]))
  expect(container.textContent).toContain('/work/build')
  expect(container.textContent).toContain('Open tab')
  click('Open Build')
  click('Close Build')
  expect(onSelect).toHaveBeenCalledWith(terminal.id)
  expect(onClose).toHaveBeenCalledWith(terminal.id)
  expect(onResume).not.toHaveBeenCalled()
})

it('resumes a background session rather than creating another shell', async () => {
  await render(terminals())
  expect(container.textContent).toContain('Running in background')
  click('Resume Build')
  expect(onResume).toHaveBeenCalledWith(session)
  expect(transport.spawn).not.toHaveBeenCalled()
  click('New terminal')
  expect(onNew).toHaveBeenCalledOnce()
})

it('does not list split leaves as separate sessions', async () => {
  list.mockResolvedValue([
    { ...session, pane: { direction: 'right', first: { sessionId: 'one' }, second: { sessionId: 'leaf' } } },
    { ...session, id: 'leaf', title: 'Split' },
  ])
  await render(terminals())
  expect(container.querySelectorAll('.workspace-surface__entry')).toHaveLength(1)
})

it('refreshes the session inventory after an exit', async () => {
  await render(terminals())
  list.mockResolvedValue([])
  await act(async () => {
    terminalEvent?.({ type: 'exit', exitCode: 0 })
  })
  await settle()
  expect(container.textContent).toContain('No terminal sessions are running.')
  expect(container.querySelectorAll('.workspace-surface__entry')).toHaveLength(0)
})

it('refreshes a recently cached inventory when returning after a shell starts', async () => {
  list.mockResolvedValue([])
  await render(terminals())
  expect(container.textContent).toContain('No terminal sessions are running.')
  await render(<div />)
  list.mockResolvedValue([session])
  await render(terminals())
  expect(container.textContent).toContain('Running in background')
  expect(container.querySelectorAll('.workspace-surface__entry')).toHaveLength(1)
})

it('reports session lookup failures instead of claiming the inventory is empty', async () => {
  list.mockRejectedValue(new Error('Host unavailable'))
  await render(terminals())
  expect(container.textContent).toContain('Could not load terminal sessions: Host unavailable')
  expect(container.textContent).not.toContain('No terminal sessions are running.')
  list.mockResolvedValue([])
  await act(async () => {
    click('Refresh sessions')
  })
  await settle()
  expect(container.textContent).toContain('No terminal sessions are running.')
})

it('manages real browser document IDs and shows agent ownership', async () => {
  await render(<BrowserSessions tabs={[browser, terminal]} onSelectTab={onSelect} onNew={onNew} onClose={onClose} />)
  expect(container.querySelectorAll('.workspace-surface__entry')).toHaveLength(1)
  expect(container.textContent).toContain('https://example.org')
  expect(container.textContent).toContain('Agent browser / agent-exclusive')
  click('Open Docs')
  click('Close Docs')
  click('New browser')
  expect(onSelect).toHaveBeenCalledWith(browser.id)
  expect(onClose).toHaveBeenCalledWith(browser.id)
  expect(onNew).toHaveBeenCalledOnce()
})

it('makes an empty browser inventory actionable', async () => {
  await render(<BrowserSessions tabs={[]} onSelectTab={onSelect} onNew={onNew} onClose={onClose} />)
  expect(container.textContent).toContain('No browser tabs are open.')
  click('New browser')
  expect(onNew).toHaveBeenCalledOnce()
})

it('makes Home an actionable landing page rather than a blank map', async () => {
  await render(<WorkspaceHome tabs={[terminal, browser, { id: 'overview', title: 'Overview', kind: 'overview' }]} onSelectTab={onSelect} onOpenProjects={onResume} onNewTerminal={onNew} onNewBrowser={onClose} />)
  expect(container.querySelector('canvas')).toBeNull()
  expect(container.querySelectorAll('.workspace-surface__entry')).toHaveLength(2)
  click('Open Projects')
  click('New terminal')
  click('New browser')
  click('Open Docs')
  expect(onResume).toHaveBeenCalledOnce()
  expect(onNew).toHaveBeenCalledOnce()
  expect(onClose).toHaveBeenCalledOnce()
  expect(onSelect).toHaveBeenCalledWith(browser.id)
})

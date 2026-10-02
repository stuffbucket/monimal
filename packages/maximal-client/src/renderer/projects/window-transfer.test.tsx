import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createYProjectMapStore } from '@maximal/maximal-project-browser'
import { PROJECTS_TAB } from '../frame/AppFrame'
import { useProjectWindowTransfer } from './window-transfer'
import { encodeProjectWindowState, INITIAL_PROJECT_VIEW } from './window-state'
import type { MaximalHost } from '../../shared/host'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMaximalQueryClient } from '../query-client'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root
let container: HTMLDivElement
let state: ReturnType<typeof useProjectWindowTransfer> | undefined
let redocked: ((state: string) => void) | undefined
const undock = vi.fn<MaximalHost['projects']['undockWindow']>()
const redock = vi.fn<MaximalHost['projects']['redockWindow']>()
const windowState = vi.fn<MaximalHost['projects']['windowState']>()
const closeTab = vi.fn()
const openProjects = vi.fn()
const onError = vi.fn()

function controller() {
  if (!state) throw new Error('Project controller not mounted')
  return state
}

beforeEach(() => {
  vi.clearAllMocks()
  state = undefined
  redocked = undefined
  undock.mockResolvedValue(true)
  redock.mockResolvedValue(true)
  const source = createYProjectMapStore()
  windowState.mockResolvedValue(encodeProjectWindowState(source, INITIAL_PROJECT_VIEW))
  source.destroy()
  Object.defineProperty(window, 'maximal', {
    configurable: true,
    value: {
      projects: {
        undockWindow: undock,
        redockWindow: redock,
        windowState,
        onWindowRedocked: (listener: typeof redocked) => {
          redocked = listener
          return () => { redocked = undefined }
        },
      },
    },
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

async function mount(detached = false) {
  function Harness() {
    state = useProjectWindowTransfer({
      detached, enabled: true, frameId: 'target', tabs: [PROJECTS_TAB],
      closeTab, openProjects, onError,
    })
    return null
  }
  await act(async () => root.render(
    <QueryClientProvider client={createMaximalQueryClient()}><Harness /></QueryClientProvider>,
  ))
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
}

it('closes the source tab only after the host confirms the new window', async () => {
  let complete: ((value: boolean) => void) | undefined
  undock.mockReturnValue(new Promise<boolean>((resolve) => { complete = resolve }))
  await mount()
  let operation: Promise<void> | undefined
  act(() => { operation = controller().undock({ screenX: 20, screenY: 30 }) })
  expect(closeTab).not.toHaveBeenCalled()
  expect(undock.mock.calls[0]?.[0].x).toBe(20)
  expect(undock.mock.calls[0]?.[0].y).toBe(30)
  expect(typeof undock.mock.calls[0]?.[0].state).toBe('string')
  await act(async () => { complete?.(true); await operation })
  expect(closeTab).toHaveBeenCalledWith('projects')
})

it('keeps the source and reports a failed undock', async () => {
  undock.mockResolvedValue(false)
  await mount()
  await act(async () => controller().undock())
  expect(closeTab).not.toHaveBeenCalled()
  expect(onError).toHaveBeenCalledWith(expect.stringContaining('could not be moved'))
})

it('restores detached state before rendering the board', async () => {
  await mount(true)
  expect(windowState).toHaveBeenCalledOnce()
  expect(controller().ready).toBe(true)
  expect(controller().view.current).toEqual(INITIAL_PROJECT_VIEW)
})

it('prevents another transfer before detached state restoration completes', async () => {
  let complete: ((value: string) => void) | undefined
  windowState.mockReturnValue(new Promise<string>((resolve) => { complete = resolve }))
  await mount(true)
  expect(controller().ready).toBe(false)
  await act(async () => controller().undock())
  expect(undock).not.toHaveBeenCalled()
  expect(onError).toHaveBeenCalledWith(expect.stringContaining('still restoring'))
  await act(async () => { complete?.(controller().encodeState()) })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  expect(controller().ready).toBe(true)
})

it('redocks document drag payloads and opens the received Projects tab', async () => {
  await mount()
  const encoded = controller().encodeState()
  controller().receive({
    version: 1, sourceFrameId: 'source', tabId: 'projects',
    document: { kind: 'projects', state: encoded },
  })
  expect(redock).toHaveBeenCalledWith({
    sourceFrameId: 'source', targetFrameId: 'target', state: encoded,
  })
  await act(async () => { redocked?.(controller().encodeState()) })
  expect(openProjects).toHaveBeenCalledOnce()
})

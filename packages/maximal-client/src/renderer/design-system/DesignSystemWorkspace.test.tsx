import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { UiMode } from '../../shared/host'
import type { AppTab } from '../frame/AppFrame'
import { MaximalQueryProvider } from '../query-client'
import { DesignSystemWorkspace, type WorkspaceTerminalState } from './DesignSystemWorkspace'
import { UiModeBanner } from './UiModeBanner'

vi.mock('./DesignSystemTerminal', () => ({
  DesignSystemTerminal: ({ sessionId, title }: { sessionId: string; title: string }) => (
    <div data-session={sessionId} data-testid="live-terminal">{title}</div>
  ),
}))

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

class NoopResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = NoopResizeObserver

const OVERVIEW: AppTab = { id: 'overview', title: 'Overview', icon: 'overview', kind: 'overview', closable: false }
const FOREGROUND: AppTab = {
  id: 'terminal:fg',
  title: 'zsh',
  icon: 'terminal',
  kind: 'terminal',
  sessionId: 'fg',
  canRunInBackground: false,
}
const BACKGROUND: AppTab = { ...FOREGROUND, id: 'terminal:bg', title: 'tmux', sessionId: 'bg', canRunInBackground: true }

const launch = vi.fn<(request: { profileId: string; cols: number; rows: number }) => Promise<{
  sessionId: string
  label: string
  canRunInBackground: boolean
}>>()
const uiModeGet = vi.fn<() => Promise<{ mode: UiMode; switchable: boolean }>>()
const uiModeSet = vi.fn<(mode: UiMode) => Promise<void>>()
const typography = {
  get: vi.fn(() => new Promise<never>(() => undefined)),
  subscribe: vi.fn(() => () => undefined),
}

let container: HTMLElement
let root: Root

function terminalState(overrides: Partial<WorkspaceTerminalState> = {}): WorkspaceTerminalState {
  return {
    tabs: [OVERVIEW, FOREGROUND, BACKGROUND],
    activeTab: FOREGROUND.id,
    setActiveTab: vi.fn(),
    closeTab: vi.fn(),
    closeTerminal: vi.fn(async () => undefined),
    onTerminalLaunched: vi.fn(),
    openSettings: vi.fn(),
    setTerminalError: vi.fn(),
    terminalError: undefined,
    updateTerminalTitle: vi.fn(),
    ...overrides,
  }
}

async function render(state: WorkspaceTerminalState): Promise<void> {
  await act(async () => {
    root.render(
      <MaximalQueryProvider>
        <UiModeBanner current="design-system" />
        <DesignSystemWorkspace terminalState={state} typography={typography} />
      </MaximalQueryProvider>,
    )
  })
}

function button(label: string): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!found) throw new Error(`Missing ${label} button`)
  return found
}

beforeEach(() => {
  launch.mockReset()
  uiModeGet.mockReset().mockResolvedValue({ mode: 'design-system', switchable: false })
  uiModeSet.mockReset().mockResolvedValue(undefined)
  Object.assign(window, { maximal: { terminal: { launch }, uiMode: { get: uiModeGet, set: uiModeSet } } })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('DesignSystemWorkspace', () => {
  it('draws every workspace tab and a live terminal for the active session', async () => {
    await render(terminalState())

    const labels = [...container.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)
    expect(labels).toEqual(['Overview', 'zsh', 'tmux'])
    expect(container.querySelector('[data-testid="live-terminal"]')?.getAttribute('data-session'))
      .toBe('fg')
  })

  it('keeps terminal panels mounted across tab switches', async () => {
    await render(terminalState())

    const sessions = [...container.querySelectorAll('[data-testid="live-terminal"]')]
      .map((terminal) => terminal.getAttribute('data-session'))
    expect(sessions).toEqual(['fg', 'bg'])
  })

  it('shows a placeholder for a surface that has not been ported', async () => {
    await render(terminalState({ activeTab: OVERVIEW.id }))

    expect(container.querySelector('[aria-label="Overview placeholder"]')).not.toBeNull()
  })

  it('terminates a foreground terminal and detaches a background-capable one on close', async () => {
    const state = terminalState()
    await render(state)
    const [, foreground, background] = container.querySelectorAll<HTMLElement>('[role="tab"]')

    await act(async () => {
      foreground?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
      background?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    })

    expect(state.closeTerminal).toHaveBeenCalledWith(FOREGROUND.id)
    expect(state.closeTab).toHaveBeenCalledWith(BACKGROUND.id)
    expect(state.closeTab).not.toHaveBeenCalledWith(FOREGROUND.id)
  })

  it('keeps permanent workspace tabs open', async () => {
    const state = terminalState({ activeTab: OVERVIEW.id })
    await render(state)
    const [overview] = container.querySelectorAll<HTMLElement>('[role="tab"]')

    await act(async () => {
      overview?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    })

    expect(state.closeTab).not.toHaveBeenCalled()
    expect(state.closeTerminal).not.toHaveBeenCalled()
  })

  it('launches a local terminal and reports a failed launch', async () => {
    const result = { sessionId: 'new', label: 'zsh', canRunInBackground: false }
    launch.mockResolvedValueOnce(result).mockRejectedValueOnce(new Error('denied'))
    const state = terminalState()
    await render(state)

    await act(async () => button('New terminal').click())
    await act(async () => button('New terminal').click())

    expect(launch).toHaveBeenCalledWith({ profileId: 'local', cols: 80, rows: 24 })
    expect(state.onTerminalLaunched).toHaveBeenCalledWith(result)
    expect(state.setTerminalError).toHaveBeenCalledWith('A terminal could not be started.')
  })

  it('shows the terminal error as an alert', async () => {
    await render(terminalState({ terminalError: 'The terminal could not be closed.' }))

    expect(container.querySelector('[role="alert"]')?.textContent)
      .toBe('The terminal could not be closed.')
  })
})

describe('UiModeBanner', () => {
  it('is absent when the build cannot switch renderers', async () => {
    await render(terminalState())
    await act(async () => {
      await uiModeGet.mock.results[0]?.value
    })

    expect(uiModeGet).toHaveBeenCalledOnce()
    expect(container.querySelector('[aria-label="Renderer switch"]')).toBeNull()
  })

  it('offers every other renderer and switches a development build to one', async () => {
    uiModeGet.mockResolvedValue({ mode: 'design-system', switchable: true })
    await render(terminalState())
    await vi.waitFor(() => {
      expect(container.querySelector('[aria-label="Renderer switch"]')).not.toBeNull()
    })
    const actions = [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Renderer switch"] button')]
    expect(actions.map((action) => action.textContent)).toEqual([
      'Switch to Legacy UI',
      'Switch to Design system spike',
    ])

    await act(async () => actions[1]?.click())

    expect(uiModeSet).toHaveBeenCalledWith('spike')
  })
})

import {
  act,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  accountStatus,
  capabilityState,
  createObservabilitySource,
  observabilitySource,
  subscribe,
  terminalList,
  terminalCopy,
  terminalTerminate,
  terminalUndock,
} = vi.hoisted(() => {
  const observabilitySource = { source: 'stable-observability-source' }
  return {
    accountStatus: vi.fn(() => Promise.resolve({ state: 'unauthenticated' })),
    capabilityState: {
      openSettings: null as null | ((sectionId: string | null) => void),
    },
    createObservabilitySource: vi.fn(() => observabilitySource),
    observabilitySource,
    subscribe: vi.fn(() => vi.fn()),
    terminalList: vi.fn(() => Promise.resolve([])),
    terminalCopy: vi.fn(() => Promise.resolve(true)),
    terminalTerminate: vi.fn(() => Promise.resolve()),
    terminalUndock: vi.fn(() => Promise.resolve(true)),
  }
})

vi.mock('stuffbucket-electron/renderer', () => ({
  decodeTabTransfer: vi.fn(),
  isTerminalPane: vi.fn(() => false),
  TAB_TRANSFER_MIME: 'application/x-stuffbucket-shell-tab+json',
  terminalPaneSessionIds: vi.fn((pane: {
    sessionId?: string
    first?: { sessionId: string }
    second?: { sessionId: string }
  }) => pane.sessionId ? [pane.sessionId] : [pane.first!.sessionId, pane.second!.sessionId]),
  terminalProcessTitle: (value: string) => value.trim(),
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  Dialog: ({ children, open, title }: { children: ReactNode; open: boolean; title: string }) =>
    open ? <div role="dialog" aria-label={title}>{children}</div> : null,
  UnsavedChangesDialog: () => null,
  TerminalLauncher: ({ open, onLaunched }: {
    open: boolean
    onLaunched: (result: {
      sessionId: string
      label: string
      canRunInBackground: boolean
    }) => void
  }) => open ? (
    <button onClick={() => onLaunched({
      sessionId: 'session-1',
      label: 'zsh',
      canRunInBackground: true,
    })}>
      Launch zsh
    </button>
  ) : null,
  TextInput: ({
    onChange,
    ...props
  }: Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> & {
    onChange: (value: string) => void
  }) => <input {...props} onChange={(event) => onChange(event.currentTarget.value)} />,
}))

vi.mock('@stuffbucket/maximal-observability', () => ({
  ObservabilityProvider: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('./traffic/source', () => ({ createObservabilitySource }))
vi.mock('./settings/capabilities', () => ({
  createCoreSettingsCapabilities: () => ({
    account: { status: accountStatus },
    onOpenRequest: (listener: (sectionId: string | null) => void) => {
      capabilityState.openSettings = listener
      return vi.fn()
    },
    subscribe,
  }),
}))
vi.mock('./chrome/WindowChrome', () => ({
  WindowChrome: ({ children }: { children: ReactNode }) => (
    <div data-testid="window-chrome">{children}</div>
  ),
}))
vi.mock('./first-run/FirstRun', () => ({
  FirstRun: () => <div data-testid="first-run" />,
}))
vi.mock('./overview/Overview', () => ({
  Overview: () => <div data-testid="overview">Overview content</div>,
}))
vi.mock('./traffic/Traffic', () => ({
  Traffic: () => <div data-testid="traffic">Traffic content</div>,
}))
vi.mock('./terminal/Terminal', () => ({
  Terminal: ({
    activeId,
    onExit,
    onPaneChange,
  }: {
    activeId: string
    onExit: (id: string) => void
    onPaneChange?: (
      id: string,
      pane: {
        direction: 'right'
        first: { sessionId: string }
        second: { sessionId: string }
      },
      revision: number,
    ) => void
  }) => (
    <div data-testid="terminal" data-active-id={activeId}>
      Terminal content
      <button onClick={() => onExit(activeId)}>Exit shell</button>
      <button onClick={() => onPaneChange?.(activeId, {
        direction: 'right',
        first: { sessionId: 'session-1' },
        second: { sessionId: 'session-2' },
      }, 1)}>
        Split shell
      </button>
    </div>
  ),
}))
vi.mock('./terminal/transport', () => ({
  terminalTransport: { list: terminalList, terminate: terminalTerminate },
}))
vi.mock('./frame/AppFrame', () => ({
  PRODUCT_TABS: [
    { id: 'overview', title: 'Overview', kind: 'overview' },
    { id: 'traffic', title: 'Traffic', kind: 'traffic' },
    { id: 'settings', title: 'Settings', kind: 'settings' },
  ],
  AppFrame: ({
    activeTab,
    children,
    onNewTab,
    onSelectTab,
    tabTransfer,
    tabs,
  }: {
    activeTab: string
    children: ReactNode
    onNewTab?: () => void
    onSelectTab: (id: string) => void
    tabTransfer?: {
      contextMenu?: (tab: { id: string; title: string; kind: string }) => Array<{
        id: string
        label: string
        onSelect: () => void
      }>
    }
    tabs: Array<{ id: string; title: string; kind: string }>
  }) => (
    <div
      data-testid="app-frame"
      data-view={activeTab}
      data-available-views={tabs.map((tab) => tab.id).join(',')}
    >
      <button onClick={() => onSelectTab('traffic')}>Traffic</button>
      {onNewTab ? <button onClick={onNewTab}>New terminal</button> : null}
      {tabs.flatMap((tab) => (tabTransfer?.contextMenu?.(tab) ?? []).map((item) => (
        <button key={`${tab.id}-${item.id}`} onClick={item.onSelect}>
          {item.label} {tab.title}
        </button>
      )))}
      {children}
    </div>
  ),
}))
vi.mock('./settings/Settings', () => ({
  Settings: ({
    onBack,
    request,
  }: {
    onBack?: () => void
    request?: { id: string } | null
  }) => (
    <div data-testid="settings" data-request={request?.id ?? ''}>
      {onBack ? <button onClick={onBack}>Back to sign in</button> : null}
    </div>
  ),
}))

const { App } = await import('./App')

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | null = null
let container: HTMLElement | null = null

beforeEach(() => {
  window.history.replaceState({}, '', '/')
  capabilityState.openSettings = null
  accountStatus.mockResolvedValue({ state: 'unauthenticated' })
  Object.assign(window, {
    maximal: {
      terminal: {
        profiles: vi.fn(() => Promise.resolve([])),
        discover: vi.fn(() => Promise.resolve({ targets: [] })),
        launch: vi.fn(),
        frameId: vi.fn(() => Promise.resolve('1')),
        undock: terminalUndock,
        copy: terminalCopy,
        redock: vi.fn(() => Promise.resolve(true)),
        syncPane: vi.fn(() => Promise.resolve()),
        onTabRedocked: vi.fn(() => () => {}),
        onPaneChanged: vi.fn(() => () => {}),
      },
    },
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  if (root !== null) act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.clearAllMocks()
})

async function renderApp(): Promise<HTMLElement> {
  if (root === null || container === null) throw new Error('test root not ready')
  await act(async () => {
    root?.render(<App />)
    await Promise.resolve()
  })
  return container
}

describe('App routing', () => {
  it('keeps one observability source while switching authenticated views', async () => {
    accountStatus.mockResolvedValue({ state: 'authenticated' })
    const shell = await renderApp()

    expect(shell.querySelector('[data-testid="overview"]')).not.toBeNull()
    expect(createObservabilitySource).toHaveBeenCalledTimes(1)

    const traffic = [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'Traffic',
    )
    if (traffic === undefined) throw new Error('Traffic action was not rendered')
    act(() => traffic.click())

    expect(shell.querySelector('[data-testid="traffic"]')).not.toBeNull()
    expect(createObservabilitySource).toHaveBeenCalledTimes(1)
    expect(observabilitySource).toEqual({ source: 'stable-observability-source' })
  })

  it('opens the launcher from the title bar and mounts the session as a document tab', async () => {
    accountStatus.mockResolvedValue({ state: 'authenticated' })
    const shell = await renderApp()
    const newTerminal = [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'New terminal',
    )
    if (newTerminal === undefined) throw new Error('New terminal action was not rendered')

    act(() => newTerminal.click())
    const launch = [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'Launch zsh',
    )
    if (launch === undefined) throw new Error('Terminal launcher was not rendered')
    act(() => launch.click())

    expect(shell.querySelector('[data-testid="terminal"]')).not.toBeNull()
    expect(shell.querySelector('[data-testid="terminal"]')?.getAttribute('data-active-id')).toBe(
      'terminal:session-1',
    )
    expect(shell.querySelector('[data-testid="app-frame"]')?.getAttribute('data-view')).toBe(
      'terminal:session-1',
    )
    expect(shell.querySelector('[data-testid="settings"]')).toBeNull()
  })

  it('closes a terminal document when its final shell exits', async () => {
    accountStatus.mockResolvedValue({ state: 'authenticated' })
    const shell = await renderApp()
    const newTerminal = [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'New terminal',
    )
    if (newTerminal === undefined) throw new Error('New terminal action was not rendered')

    act(() => newTerminal.click())
    const launch = [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'Launch zsh',
    )
    if (launch === undefined) throw new Error('Terminal launcher was not rendered')
    act(() => launch.click())

    const exit = [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'Exit shell',
    )
    if (exit === undefined) throw new Error('Terminal exit action was not rendered')
    act(() => exit.click())

    expect(shell.querySelector('[data-testid="terminal"]')).toBeNull()
    expect(shell.querySelector('[data-testid="settings"]')).not.toBeNull()
    expect(shell.querySelector('[data-testid="app-frame"]')?.getAttribute('data-view')).toBe(
      'settings',
    )
  })

  it('provides rename and close actions for a terminal tab context menu', async () => {
    accountStatus.mockResolvedValue({ state: 'authenticated' })
    const shell = await renderApp()
    const newTerminal = [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'New terminal',
    )
    if (newTerminal === undefined) throw new Error('New terminal action was not rendered')

    act(() => newTerminal.click())
    const launch = [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'Launch zsh',
    )
    if (launch === undefined) throw new Error('Terminal launcher was not rendered')
    act(() => launch.click())

    const rename = [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'Rename zsh',
    )
    const close = [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'Close Terminal zsh',
    )
    const background = [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'Put in Background zsh',
    )
    expect(rename).toBeDefined()
    expect(close).toBeDefined()
    expect(background).toBeDefined()

    act(() => rename?.click())
    expect(shell.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(
      'Rename terminal tab',
    )
    const confirmRename = [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'Rename',
    )
    act(() => confirmRename?.click())

    act(() => close?.click())
    expect(shell.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(
      'Close terminal?',
    )
    const confirmClose = [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'Close Terminal',
    )
    await act(async () => confirmClose?.click())
    expect(terminalTerminate).toHaveBeenCalledWith('session-1')
    expect(shell.querySelector('[data-testid="terminal"]')).toBeNull()
  })

  it('removes a background terminal tab without ending its session', async () => {
    accountStatus.mockResolvedValue({ state: 'authenticated' })
    const shell = await renderApp()
    const newTerminal = [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'New terminal',
    )
    if (newTerminal === undefined) throw new Error('New terminal action was not rendered')

    act(() => newTerminal.click())
    const launch = [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'Launch zsh',
    )
    if (launch === undefined) throw new Error('Terminal launcher was not rendered')
    act(() => launch.click())

    const background = [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'Put in Background zsh',
    )
    if (background === undefined) throw new Error('Background action was not rendered')
    act(() => background.click())

    expect(terminalTerminate).not.toHaveBeenCalled()
    expect(shell.querySelector('[data-testid="terminal"]')).toBeNull()
  })

  it('copies and moves a terminal into a new window', async () => {
    accountStatus.mockResolvedValue({ state: 'authenticated' })
    const shell = await renderApp()
    const newTerminal = [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'New terminal',
    )
    act(() => newTerminal?.click())
    const launch = [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'Launch zsh',
    )
    act(() => launch?.click())

    const copy = [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'Copy into New Window zsh',
    )
    await act(async () => copy?.click())
    expect(terminalCopy).toHaveBeenCalledWith(expect.objectContaining({
      id: 'session-1',
      title: 'zsh',
      canRunInBackground: true,
      sessionIds: ['session-1'],
    }))
    expect(shell.querySelector('[data-testid="terminal"]')).not.toBeNull()

    const move = [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'Move to New Window zsh',
    )
    await act(async () => move?.click())
    expect(terminalUndock).toHaveBeenCalledWith(expect.objectContaining({
      id: 'session-1',
      title: 'zsh',
      canRunInBackground: true,
      sessionIds: ['session-1'],
    }))
    expect(shell.querySelector('[data-testid="terminal"]')).toBeNull()
    expect(terminalTerminate).not.toHaveBeenCalled()
  })

  it('opens a transferred terminal without mounting the signed-out surface', async () => {
    window.history.replaceState(
      {},
      '',
      '/?terminalSessionId=session-2&terminalTitle=Detached&terminalCanRunInBackground=true',
    )
    const shell = await renderApp()

    expect(shell.querySelector('[data-testid="terminal"]')?.getAttribute('data-active-id')).toBe(
      'terminal:session-2',
    )
    expect(shell.querySelector('[data-testid="first-run"]')).toBeNull()
    expect([...shell.querySelectorAll('button')].some(
      (button) => button.textContent === 'New terminal',
    )).toBe(false)
  })

  it('closes every process in a split terminal document', async () => {
    accountStatus.mockResolvedValue({ state: 'authenticated' })
    const shell = await renderApp()
    act(() => [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'New terminal',
    )?.click())
    act(() => [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'Launch zsh',
    )?.click())
    act(() => [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'Split shell',
    )?.click())
    act(() => [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'Close Terminal zsh',
    )?.click())
    await act(async () => [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'Close Terminal',
    )?.click())

    expect(terminalTerminate).toHaveBeenCalledWith('session-1')
    expect(terminalTerminate).toHaveBeenCalledWith('session-2')
  })

  it('opens a native section request without exposing authenticated views', async () => {
    const shell = await renderApp()
    expect(shell.querySelector('[data-testid="first-run"]')).not.toBeNull()
    if (capabilityState.openSettings === null) {
      throw new Error('Settings request listener was not installed')
    }

    act(() => capabilityState.openSettings?.('settings-usage-heading'))

    const frame = shell.querySelector('[data-testid="app-frame"]')
    const settings = shell.querySelector('[data-testid="settings"]')
    expect(frame?.getAttribute('data-view')).toBe('settings')
    expect(frame?.getAttribute('data-available-views')).toBe('settings')
    expect(settings?.getAttribute('data-request')).toBe('settings-usage-heading')
    expect(shell.querySelector('[data-testid="overview"]')).toBeNull()
    expect(shell.querySelector('[data-testid="traffic"]')).toBeNull()
  })

  it('returns from signed-out Settings to First Run', async () => {
    const shell = await renderApp()
    if (capabilityState.openSettings === null) {
      throw new Error('Settings request listener was not installed')
    }
    act(() => capabilityState.openSettings?.(null))
    expect(shell.querySelector('[data-testid="settings"]')?.getAttribute('data-request')).toBe(
      'settings-account-heading',
    )
    const back = [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'Back to sign in',
    )
    if (back === undefined) throw new Error('Back to sign in button was not rendered')

    act(() => back.click())

    expect(shell.querySelector('[data-testid="first-run"]')).not.toBeNull()
    expect(shell.querySelector('[data-testid="settings"]')).toBeNull()
  })
})

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  accountStatus,
  capabilityState,
  createObservabilitySource,
  observabilitySource,
  subscribe,
  terminalList,
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
  }
})

vi.mock('stuffbucket-electron/renderer', () => ({
  UnsavedChangesDialog: () => null,
  TerminalLauncher: ({ open, onLaunched }: {
    open: boolean
    onLaunched: (result: { sessionId: string; label: string }) => void
  }) => open ? (
    <button onClick={() => onLaunched({ sessionId: 'session-1', label: 'zsh' })}>
      Launch zsh
    </button>
  ) : null,
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
vi.mock('./overview/Overview', () => ({
  Overview: () => <div data-testid="overview">Overview content</div>,
}))
vi.mock('./traffic/Traffic', () => ({
  Traffic: () => <div data-testid="traffic">Traffic content</div>,
}))
vi.mock('./terminal/Terminal', () => ({
  Terminal: ({ activeId, onExit }: { activeId: string; onExit: (id: string) => void }) => (
    <div data-testid="terminal" data-active-id={activeId}>
      Terminal content
      <button onClick={() => onExit(activeId)}>Exit shell</button>
    </div>
  ),
}))
vi.mock('./terminal/transport', () => ({
  terminalTransport: { list: terminalList },
}))
vi.mock('./frame/AppFrame', () => ({
  PRODUCT_TABS: [
    { id: 'overview', title: 'Overview', kind: 'overview' },
    { id: 'traffic', title: 'Traffic', kind: 'traffic' },
  ],
  SETTINGS_TAB: { id: 'settings', title: 'Settings', kind: 'settings' },
  SurfaceActivity: ({ children }: { children: ReactNode }) => <aside>{children}</aside>,
  SurfaceRail: ({ children }: { children: (collapsed: boolean) => ReactNode }) => (
    <aside>{children(false)}</aside>
  ),
  SurfaceStatus: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
  AppFrame: ({
    activeTab,
    children,
    onCloseTab,
    onNewTab,
    onSelectTab,
    onToggleSettings,
    tabs,
  }: {
    activeTab: string
    children: ReactNode
    onCloseTab?: (id: string) => void
    onNewTab?: () => void
    onSelectTab: (id: string) => void
    onToggleSettings?: () => void
    tabs: Array<{ id: string; title: string }>
  }) => (
    <div
      data-testid="app-frame"
      data-view={activeTab}
      data-available-views={tabs.map((tab) => tab.id).join(',')}
    >
      <button onClick={() => onSelectTab('traffic')}>Traffic</button>
      {onToggleSettings ? <button onClick={onToggleSettings}>Settings gear</button> : null}
      {tabs.some((tab) => tab.id === 'settings') && onCloseTab
        ? <button onClick={() => onCloseTab('settings')}>Close Settings</button>
        : null}
      {onNewTab ? <button onClick={onNewTab}>New terminal</button> : null}
      {children}
    </div>
  ),
}))
vi.mock('./ProviderOnboarding', () => ({ ProviderOnboarding: () => null }))
vi.mock('./frame/WorkspaceRail', () => ({
  WorkspaceRail: () => <nav data-testid="workspace-rail" />,
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
  capabilityState.openSettings = null
  accountStatus.mockResolvedValue({ state: 'unauthenticated' })
  Object.assign(window, {
    maximal: {
      shutdown: {
        current: vi.fn(async () => ({ phase: 'idle', operations: [] })),
        force: vi.fn(async () => false),
        onChange: vi.fn(() => () => {}),
      },
      terminal: {
        profiles: vi.fn(() => Promise.resolve([])),
        discover: vi.fn(() => Promise.resolve({ targets: [] })),
        launch: vi.fn(),
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
  it('opens the workspace without requiring an authenticated account', async () => {
    const shell = await renderApp()

    expect(shell.querySelector('[data-testid="overview"]')).not.toBeNull()
    expect(shell.querySelector('[data-testid="app-frame"]')?.getAttribute('data-available-views')).toBe(
      'overview,traffic',
    )
    expect(accountStatus).toHaveBeenCalled()
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
    expect(shell.querySelector('[data-testid="workspace-rail"]')).not.toBeNull()
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
  expect(shell.querySelector('[data-testid="workspace-rail"]')).not.toBeNull()
    expect(shell.querySelector('[data-testid="traffic"]')).not.toBeNull()
    expect(shell.querySelector('[data-testid="app-frame"]')?.getAttribute('data-view')).toBe(
      'traffic',
    )
  })

  it('opens a native settings section without hiding workspace views', async () => {
    const shell = await renderApp()
    expect(shell.querySelector('[data-testid="overview"]')).not.toBeNull()
    if (capabilityState.openSettings === null) {
      throw new Error('Settings request listener was not installed')
    }

    act(() => capabilityState.openSettings?.('settings-usage-heading'))

    const frame = shell.querySelector('[data-testid="app-frame"]')
    const settings = shell.querySelector('[data-testid="settings"]')
    expect(frame?.getAttribute('data-view')).toBe('settings')
    expect(frame?.getAttribute('data-available-views')).toBe('overview,traffic,settings')
    expect(settings?.getAttribute('data-request')).toBe('settings-usage-heading')
    expect(shell.querySelector('[data-testid="overview"]')).toBeNull()
    expect(shell.querySelector('[data-testid="traffic"]')).toBeNull()
  })

  it('toggles the Settings tab from the gear and its close action', async () => {
    const shell = await renderApp()
    const gear = [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'Settings gear',
    )
    if (gear === undefined) throw new Error('Settings gear was not rendered')

    act(() => gear.click())
    expect(shell.querySelector('[data-testid="settings"]')).not.toBeNull()
    expect(shell.querySelector('[data-testid="app-frame"]')?.getAttribute('data-available-views')).toBe(
      'overview,traffic,settings',
    )

    const close = [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'Close Settings',
    )
    if (close === undefined) throw new Error('Settings close action was not rendered')
    act(() => close.click())

    expect(shell.querySelector('[data-testid="settings"]')).toBeNull()
    expect(shell.querySelector('[data-testid="app-frame"]')?.getAttribute('data-view')).toBe(
      'traffic',
    )
  })
})

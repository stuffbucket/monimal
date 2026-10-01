import {
  act,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PersistedMaterialPreference } from '@maximal/maximal-client/shared/host'

const {
  accountStatus,
  browserList,
  appearanceState,
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
    browserList: vi.fn((): Promise<Array<{
      id: string
      url: string
      title: string
      owner: 'agent' | 'user'
      control: 'user' | 'agent-shared' | 'agent-exclusive'
      terminalSessionIds: string[]
    }>> => Promise.resolve([])),
    appearanceState: {
      vibrancyEnabled: false,
      backgroundEffectsEnabled: false,
      reducedMotionEnabled: false,
    },
    capabilityState: {
      openSettings: null as null | ((sectionId: string | null) => void),
    },
    createObservabilitySource: vi.fn(() => observabilitySource),
    observabilitySource,
    subscribe: vi.fn(() => vi.fn()),
    terminalList: vi.fn((): Promise<Array<{
      id: string
      cwd: string
      shell: string
      startedAt: number
      title?: string
      canRunInBackground?: boolean
      pane?: {
        direction: 'right'
        first: { sessionId: string }
        second: { sessionId: string }
      }
      revision?: number
    }>> => Promise.resolve([])),
    terminalCopy: vi.fn(() => Promise.resolve(true)),
    terminalTerminate: vi.fn(() => Promise.resolve()),
    terminalUndock: vi.fn(() => Promise.resolve(true)),
  }
})

vi.mock('@maximal/maximal-electron/renderer', () => ({
  decodeTabTransfer: vi.fn(),
  isTerminalPane: vi.fn(() => false),
  TAB_COLORS: ['blue', 'green', 'yellow', 'red', 'purple', 'orange'],
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
  Note: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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

vi.mock('@maximal/maximal-observability', () => ({
  ObservabilityProvider: ({ children }: { children: ReactNode }) => children,
  ContextWindowInspector: ({
    selectedSessionId,
  }: {
    selectedSessionId: string | null
  }) => <div data-testid="context-window" data-selected-session={selectedSessionId ?? ''} />,
}))
vi.mock('@maximal/maximal-client/renderer/ThirdPartyLicensesDialog', () => ({ ThirdPartyLicensesDialog: () => null }))
vi.mock('@maximal/maximal-client/renderer/traffic/source', () => ({ createObservabilitySource }))
vi.mock('@maximal/maximal-client/renderer/settings/capabilities', () => ({
  createCoreSettingsCapabilities: () => ({
    account: { status: accountStatus },
    general: {
      appearance: vi.fn(async () => ({
        vibrancyEnabled: appearanceState.vibrancyEnabled,
        vibrancySupported: true,
        backgroundEffectsEnabled: appearanceState.backgroundEffectsEnabled,
        reducedMotionEnabled: appearanceState.reducedMotionEnabled,
      })),
      onAppearanceChange: vi.fn(() => () => {}),
      material: vi.fn(async () => ({
        preset: 'clouds',
        quality: 'balanced',
        strength: 0.75,
        motion: 0.5,
        lighting: 'fixed',
        timezone: 'UTC',
      })),
      setMaterial: vi.fn(
        async (preference: PersistedMaterialPreference) => preference,
      ),
      onMaterialChange: vi.fn(() => () => {}),
    },
    onOpenRequest: (listener: (sectionId: string | null) => void) => {
      capabilityState.openSettings = listener
      return vi.fn()
    },
    subscribe,
  }),
}))
vi.mock('./CozyBackground', () => ({
  CozyBackground: ({
    enabled,
    reducedMotion,
    material,
  }: {
    enabled: boolean
    reducedMotion: boolean
    material: { preset: string }
  }) => (
    <div
      data-testid="cozy-background"
      data-enabled={String(enabled)}
      data-material={material.preset}
      data-reduced-motion={String(reducedMotion)}
    />
  ),
}))
vi.mock('../../../../../packages/maximal-client/src/renderer/overview/Overview', () => ({
  Overview: () => <div data-testid="overview">Overview content</div>,
}))
vi.mock('../../../../../packages/maximal-client/src/renderer/traffic/Traffic', () => ({
  Traffic: () => <div data-testid="traffic">Traffic content</div>,
}))
vi.mock('../../../../../packages/maximal-client/src/renderer/terminal/Terminal', () => ({
  Terminal: ({
    activeId,
    initialPanes,
    onExit,
    onFocusChange,
    onPaneChange,
    paneRevisions,
  }: {
    activeId: string
    initialPanes?: ReadonlyMap<string, unknown>
    onExit: (id: string) => void
    onFocusChange?: (tabId: string, sessionId: string) => void
    onPaneChange?: (
      id: string,
      pane: {
        direction: 'right'
        first: { sessionId: string }
        second: { sessionId: string }
      },
      revision: number,
    ) => void
    paneRevisions?: ReadonlyMap<string, number>
  }) => (
    <div
      data-testid="terminal"
      data-active-id={activeId}
      data-pane-tabs={[...(initialPanes?.keys() ?? [])].join(',')}
      data-pane-revisions={[...(paneRevisions?.entries() ?? [])]
        .map(([id, revision]) => `${id}:${String(revision)}`).join(',')}
    >
      Terminal content
      <button onClick={() => onExit(activeId)}>Exit shell</button>
      <button onClick={() => {
        onPaneChange?.(activeId, {
          direction: 'right',
          first: { sessionId: 'session-1' },
          second: { sessionId: 'session-2' },
        }, 1)
        onFocusChange?.(activeId, 'session-2')
      }}>
        Split shell
      </button>
    </div>
  ),
}))
vi.mock('../../../../../packages/maximal-client/src/renderer/terminal/transport', () => ({
  terminalTransport: { list: terminalList, terminate: terminalTerminate },
}))
vi.mock('../../../../../packages/maximal-client/src/renderer/frame/AppFrame', () => ({
  PRODUCT_TABS: [
    { id: 'overview', title: 'Overview', kind: 'overview' },
    { id: 'traffic', title: 'Traffic', kind: 'traffic' },
  ],
  SETTINGS_TAB: { id: 'settings', title: 'Settings', kind: 'settings' },
  SurfaceActivity: ({ children }: { children: ReactNode }) => <aside>{children}</aside>,
  SurfaceRight: ({ children }: { children: ReactNode }) => <aside>{children}</aside>,
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
    tabTransfer,
    onToggleSettings,
    tabs,
  }: {
    activeTab: string
    children: ReactNode
    onCloseTab?: (id: string) => void
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
    onToggleSettings?: () => void
  }) => (
    <div
      data-testid="app-frame"
      data-view={activeTab}
      data-available-views={tabs.map((tab) => tab.id).join(',')}
    >
      <output data-testid="tab-state">
        {JSON.stringify(tabs)}
      </output>
      <button onClick={() => onSelectTab('traffic')}>Traffic</button>
      {onToggleSettings ? <button onClick={onToggleSettings}>Settings gear</button> : null}
      {tabs.some((tab) => tab.id === 'settings') && onCloseTab
        ? <button onClick={() => onCloseTab('settings')}>Close Settings</button>
        : null}
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
vi.mock('../../../../../packages/maximal-client/src/renderer/ProviderOnboarding', () => ({ ProviderOnboarding: () => null }))
vi.mock('../../../../../packages/maximal-client/src/renderer/frame/WorkspaceRail', () => ({
  WorkspaceRail: () => <nav data-testid="workspace-rail" />,
}))
vi.mock('../../../../../packages/maximal-client/src/renderer/settings/Settings', () => ({
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

interface RenderedTabState {
  id: string
  color?: string
  group?: { label: string; color: string }
}

function tabState(shell: HTMLElement): RenderedTabState[] {
  const parsed: unknown = JSON.parse(
    shell.querySelector('[data-testid="tab-state"]')?.textContent ?? '[]',
  )
  if (!Array.isArray(parsed)) throw new Error('tab state did not render as an array')
  return parsed as RenderedTabState[]
}

let root: Root | null = null
let container: HTMLElement | null = null

beforeEach(() => {
  window.history.replaceState({}, '', '/')
  appearanceState.vibrancyEnabled = false
  appearanceState.backgroundEffectsEnabled = false
  appearanceState.reducedMotionEnabled = false
  document.documentElement.removeAttribute('data-vibrancy')
  document.documentElement.removeAttribute('data-background-effects')
  document.documentElement.removeAttribute('data-reduced-motion')
  capabilityState.openSettings = null
  accountStatus.mockResolvedValue({ state: 'unauthenticated' })
  terminalList.mockResolvedValue([])
  browserList.mockResolvedValue([])
  Object.assign(window, {
    maximal: {
      shutdown: {
        current: vi.fn(async () => ({ phase: 'idle', operations: [] })),
        force: vi.fn(async () => false),
        onChange: vi.fn(() => () => {}),
      },
      browser: {
        list: browserList,
        open: vi.fn(),
        navigate: vi.fn(),
        command: vi.fn(() => Promise.resolve()),
        inspect: vi.fn(),
        click: vi.fn(() => Promise.resolve()),
        hover: vi.fn(() => Promise.resolve()),
        type: vi.fn(() => Promise.resolve()),
        press: vi.fn(() => Promise.resolve()),
        drag: vi.fn(() => Promise.resolve()),
        scroll: vi.fn(() => Promise.resolve()),
        wait: vi.fn(() => Promise.resolve()),
        screenshot: vi.fn(),
        setControl: vi.fn(),
        setTerminalContext: vi.fn(() => Promise.resolve()),
        close: vi.fn(() => Promise.resolve()),
        show: vi.fn(() => Promise.resolve()),
        onEvent: vi.fn(() => () => {}),
      },
      projects: {
        search: vi.fn(async () => []),
        snapshot: vi.fn(async () => ({ roots: [], projects: [], refreshing: false })),
        addRoot: vi.fn(async () => null),
        updateRoot: vi.fn(),
        removeRoot: vi.fn(async () => {}),
        refresh: vi.fn(async () => ({ roots: [], projects: [], refreshing: false })),
        opened: vi.fn(async () => {}),
        onChange: vi.fn(() => () => {}),
      },
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
  it('applies the saved native material preference to the document', async () => {
    appearanceState.vibrancyEnabled = true

    await renderApp()

    expect(document.documentElement.getAttribute('data-vibrancy')).toBe('true')
  })

  it('applies saved visual effect preferences to the document', async () => {
    appearanceState.backgroundEffectsEnabled = true
    appearanceState.reducedMotionEnabled = true

    const shell = await renderApp()

    expect(document.documentElement.getAttribute('data-background-effects'))
      .toBe('true')
    expect(document.documentElement.getAttribute('data-reduced-motion'))
      .toBe('true')
    const background = shell.querySelector('[data-testid="cozy-background"]')
    expect(background?.getAttribute('data-enabled')).toBe('true')
    expect(background?.getAttribute('data-material')).toBe('clouds')
    expect(background?.getAttribute('data-reduced-motion')).toBe('true')
  })

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
    expect(shell.querySelector('[data-testid="context-window"]')?.getAttribute(
      'data-selected-session',
    )).toBe('session-1')

    act(() => [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'Split shell',
    )?.click())
    expect(shell.querySelector('[data-testid="context-window"]')?.getAttribute(
      'data-selected-session',
    )).toBe('session-2')
  })

  it('does not offer a launcher in a detached terminal window', async () => {
    window.history.replaceState({}, '', '/?terminalSessionId=session-1&terminalTitle=zsh')

    const shell = await renderApp()

    expect(shell.querySelector('[data-testid="terminal"]')).not.toBeNull()
    expect([...shell.querySelectorAll('button')].some(
      (button) => button.textContent === 'New terminal',
    )).toBe(false)
    expect([...shell.querySelectorAll('button')].some(
      (button) => button.textContent === 'Launch zsh',
    )).toBe(false)
    expect(shell.querySelector('[data-testid="context-window"]')?.getAttribute(
      'data-selected-session',
    )).toBe('session-1')
  })

  it.each(['authenticated', 'unauthenticated'])(
    'reconstructs a durable projection and one split document while %s', async (state) => {
    accountStatus.mockResolvedValue({ state })
    terminalList.mockResolvedValue([
      {
        id: 'projection-session',
        cwd: '/remote',
        shell: 'tmux',
        startedAt: 1,
        title: 'Remote build',
        canRunInBackground: true,
      },
      {
        id: 'document-root',
        cwd: '/work',
        shell: '/bin/zsh',
        startedAt: 2,
        title: 'Workspace',
        canRunInBackground: false,
        pane: {
          direction: 'right',
          first: { sessionId: 'document-root' },
          second: { sessionId: 'document-leaf' },
        },
        revision: 7,
      },
      {
        id: 'document-leaf',
        cwd: '/work',
        shell: '/bin/zsh',
        startedAt: 3,
        title: 'zsh',
        canRunInBackground: false,
      },
    ])

    const shell = await renderApp()

    expect(shell.querySelector('[data-testid="app-frame"]')?.getAttribute('data-available-views'))
      .toContain('terminal:projection-session')
    expect(shell.querySelector('[data-testid="app-frame"]')?.getAttribute('data-available-views'))
      .toContain('terminal:document-root')
    expect(shell.querySelector('[data-testid="app-frame"]')?.getAttribute('data-available-views'))
      .not.toContain('terminal:document-leaf')
    expect(shell.querySelector('[data-testid="terminal"]')?.getAttribute('data-pane-tabs'))
      .toBe('terminal:document-root')
    expect(shell.querySelector('[data-testid="terminal"]')?.getAttribute('data-pane-revisions'))
      .toBe('terminal:document-root:7')
    expect([...shell.querySelectorAll('button')].some(
      (button) => button.textContent === 'Put in Background Remote build',
    )).toBe(true)
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

  it('lists browsers associated with any PTY in a terminal split context menu', async () => {
    terminalList.mockResolvedValue([
      {
        id: 'document-root',
        cwd: '/work',
        shell: '/bin/zsh',
        startedAt: 2,
        title: 'Workspace',
        canRunInBackground: false,
        pane: {
          direction: 'right',
          first: { sessionId: 'document-root' },
          second: { sessionId: 'document-leaf' },
        },
        revision: 7,
      },
      {
        id: 'document-leaf',
        cwd: '/work',
        shell: '/bin/zsh',
        startedAt: 3,
      },
    ])
    browserList.mockResolvedValue([{
      id: '11111111-1111-4111-8111-111111111111',
      url: 'https://example.com/',
      title: 'Example',
      owner: 'agent',
      control: 'agent-exclusive',
      terminalSessionIds: ['document-leaf'],
    }])

    const shell = await renderApp()

    expect([...shell.querySelectorAll('button')].some((button) =>
      button.textContent?.includes('Browser · Example (Agent exclusive) Workspace'))).toBe(true)
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

  it('groups and colors terminal tabs from the context menu', async () => {
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

    const newGroup = [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'Add to New Group zsh',
    )
    const orange = [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'Color: Orange zsh',
    )
    expect(newGroup).toBeDefined()
    expect(orange).toBeDefined()

    act(() => newGroup?.click())
    act(() => orange?.click())

    const state = tabState(shell)
    const organized = state.find((tab) => tab.id === 'terminal:session-1')
    expect(organized?.color).toBe('orange')
    expect(organized?.group).toEqual({
      id: 'terminal-group-1',
      label: 'Group 1',
      color: 'blue',
    })

    const removeGroup = [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'Remove from Group zsh',
    )
    const clearColor = [...shell.querySelectorAll('button')].find(
      (button) => button.textContent === 'Clear Tab Color zsh',
    )
    act(() => removeGroup?.click())
    act(() => clearColor?.click())

    const cleared = tabState(shell)
    const plain = cleared.find((tab) => tab.id === 'terminal:session-1')
    expect(plain?.color).toBeUndefined()
    expect(plain?.group).toBeUndefined()
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

  it('opens Settings without requesting a section for the plain menu item', async () => {
    const shell = await renderApp()
    if (capabilityState.openSettings === null) {
      throw new Error('Settings request listener was not installed')
    }

    act(() => capabilityState.openSettings?.(null))
    expect(shell.querySelector('[data-testid="app-frame"]')?.getAttribute('data-view'))
      .toBe('settings')
    expect(shell.querySelector('[data-testid="settings"]')?.getAttribute('data-request'))
      .toBe('')

    act(() => capabilityState.openSettings?.('settings-usage-heading'))
    expect(shell.querySelector('[data-testid="settings"]')?.getAttribute('data-request'))
      .toBe('settings-usage-heading')

    act(() => capabilityState.openSettings?.(null))
    expect(shell.querySelector('[data-testid="app-frame"]')?.getAttribute('data-view'))
      .toBe('settings')
    expect(shell.querySelector('[data-testid="settings"]')?.getAttribute('data-request'))
      .toBe('')
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

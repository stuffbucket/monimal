import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  accountStatus,
  capabilityState,
  createObservabilitySource,
  observabilitySource,
  subscribe,
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
  }
})

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
vi.mock('./frame/AppFrame', () => ({
  AppFrame: ({
    availableViews,
    children,
    onSelectView,
    view,
  }: {
    availableViews?: readonly string[]
    children: ReactNode
    onSelectView: (view: 'overview' | 'traffic' | 'settings') => void
    view: string
  }) => (
    <div
      data-testid="app-frame"
      data-view={view}
      data-available-views={availableViews?.join(',') ?? 'all'}
    >
      <button onClick={() => onSelectView('traffic')}>Traffic</button>
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
  capabilityState.openSettings = null
  accountStatus.mockResolvedValue({ state: 'unauthenticated' })
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

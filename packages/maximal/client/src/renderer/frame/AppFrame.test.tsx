import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  AppFrame,
  SurfaceRail,
  SurfaceRight,
  SurfaceStatus,
  SurfaceTop,
  useTabPanelId,
  useTabTriggerId,
  type View,
} from './AppFrame'

// `ShellLayout` uses `ResizeObserver` both for layout and to publish panel
// collapse. jsdom supplies neither the observer nor element dimensions, so this
// deterministic shim records targets and lets the collapse test notify them.
const resizeObservers = new Set<TestResizeObserver>()

class TestResizeObserver implements ResizeObserver {
  readonly #targets = new Set<Element>()

  constructor(private readonly callback: ResizeObserverCallback) {
    resizeObservers.add(this)
  }

  observe(target: Element): void {
    this.#targets.add(target)
  }

  unobserve(target: Element): void {
    this.#targets.delete(target)
  }

  disconnect(): void {
    this.#targets.clear()
    resizeObservers.delete(this)
  }

  flush(): void {
    const entries = [...this.#targets].map(
      (target) => ({ target, borderBoxSize: [{}] }) as unknown as ResizeObserverEntry,
    )
    this.callback(entries, this)
  }
}
globalThis.ResizeObserver = TestResizeObserver

// jsdom reports every panel as zero-width, which makes the panel library reject
// imperative collapse as impossible before AppFrame can observe the change.
Object.defineProperties(HTMLElement.prototype, {
  offsetWidth: { configurable: true, get: () => 400 },
  offsetHeight: { configurable: true, get: () => 300 },
})

function flushResizeObservers(): void {
  for (const observer of resizeObservers) observer.flush()
}

// React only suppresses its "update not wrapped in act(...)" warning when
// this flag is set. No testing-library integration is installed here to set
// it for us, so `act()` below would otherwise render real assertions correctly
// while spamming stderr with a warning that looks like a broken test.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | null = null
let container: HTMLElement | null = null

afterEach(() => {
  if (root !== null) act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

function renderFrame(
  view: View,
  onSelectView: (view: View) => void,
  children: ReactNode,
  availableViews?: readonly View[],
): HTMLElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <AppFrame
        view={view}
        onSelectView={onSelectView}
        availableViews={availableViews}
      >
        {children}
      </AppFrame>,
    )
  })
  return container
}

describe('AppFrame', () => {
  it('rejects frame hooks outside the application frame', () => {
    function OutsideFrameProbe() {
      useTabPanelId()
      return null
    }

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      expect(() => {
        act(() => root?.render(<OutsideFrameProbe />))
      }).toThrowError('frame slots are only available inside AppFrame')
    } finally {
      consoleError.mockRestore()
    }
  })

  it('mounts exactly one frame root', () => {
    // Every surface used to mount a `ShellLayout` of its own, and the frame's
    // root is `position: fixed; inset: 0` — a second one does not sit beside
    // the first, it covers its chrome.
    const shell = renderFrame('overview', vi.fn(), <p>content</p>)

    expect(shell.querySelectorAll('.sb-shell.app')).toHaveLength(1)
  })

  it('renders a title bar', () => {
    // `.titlebar` carries `-webkit-app-region: drag`, the window's only drag
    // region. Without it, the window cannot be moved.
    const shell = renderFrame('overview', vi.fn(), <p>content</p>)

    expect(shell.querySelector('.sb-shell.app .titlebar')).not.toBeNull()
  })

  it('lists the three views as tabs, with the current view marked selected', () => {
    const shell = renderFrame('traffic', vi.fn(), <p>content</p>)
    const tabs = [...shell.querySelectorAll('[role="tab"]')]

    expect(tabs.map((tab) => tab.textContent)).toEqual(['Overview', 'Traffic', 'Settings'])

    const selected = tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true')
    expect(selected).toHaveLength(1)
    expect(selected[0]?.textContent).toBe('Traffic')
  })

  it('gives every view a stable tab id and its identifying icon', () => {
    const shell = renderFrame('overview', vi.fn(), <p>content</p>)
    const tabs = [...shell.querySelectorAll('[role="tab"]')]

    expect(tabs.map((tab) => tab.id)).toEqual([
      'maximal-documents-tab-overview',
      'maximal-documents-tab-traffic',
      'maximal-documents-tab-settings',
    ])
    expect(tabs[0]?.querySelector('svg.lucide-file-text')).not.toBeNull()
    expect(tabs[1]?.querySelector('svg.lucide-folder')).not.toBeNull()
    expect(tabs[2]?.querySelector('svg.lucide-settings')).not.toBeNull()
  })

  it('limits navigation to the views available in the current app state', () => {
    const shell = renderFrame(
      'settings',
      vi.fn(),
      <p>content</p>,
      ['settings'],
    )

    expect(
      [...shell.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent),
    ).toEqual(['Settings'])
  })

  it('reports the tab a click lands on through onSelectView', () => {
    const onSelectView = vi.fn()
    const shell = renderFrame('overview', onSelectView, <p>content</p>)
    const settingsTab = [...shell.querySelectorAll('[role="tab"]')].find(
      (tab) => tab.textContent === 'Settings',
    )
    if (settingsTab === undefined) throw new Error('no tab labelled Settings was rendered')

    // Radix's tab trigger selects on `mousedown`, not `click` — `.click()`
    // never reaches that handler in jsdom, so this dispatches the event Radix
    // actually listens for.
    act(() => {
      settingsTab.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }),
      )
    })

    expect(onSelectView).toHaveBeenCalledWith('settings')
  })

  it('removes the inspector only for Settings and restores tab-specific content', () => {
    const surface = renderFrame(
      'overview',
      vi.fn(),
      <SurfaceRight><p data-testid="overview-right">overview</p></SurfaceRight>,
    )

    expect(surface.querySelector('#right [data-testid="overview-right"]')).not.toBeNull()
    expect(surface.querySelector('[data-testid="toggle-right"]')).not.toBeNull()

    act(() => {
      root?.render(
        <AppFrame view="settings" onSelectView={vi.fn()}>
          <SurfaceRight><p data-testid="settings-right">settings</p></SurfaceRight>
        </AppFrame>,
      )
    })
    expect(surface.querySelector('#right')).toBeNull()
    expect(surface.querySelector('[data-testid="toggle-right"]')).toBeNull()
    expect(surface.querySelector('[data-testid="settings-right"]')).toBeNull()

    act(() => {
      root?.render(
        <AppFrame view="traffic" onSelectView={vi.fn()}>
          <SurfaceRight><p data-testid="traffic-right">traffic</p></SurfaceRight>
        </AppFrame>,
      )
    })
    expect(surface.querySelector('#right [data-testid="traffic-right"]')).not.toBeNull()
    expect(surface.querySelector('[data-testid="overview-right"]')).toBeNull()

    act(() => {
      root?.render(
        <AppFrame view="overview" onSelectView={vi.fn()}>
          <SurfaceRight><p data-testid="overview-right">overview</p></SurfaceRight>
        </AppFrame>,
      )
    })
    expect(surface.querySelectorAll('.sb-shell.app')).toHaveLength(1)
    expect(surface.querySelector('#right [data-testid="overview-right"]')).not.toBeNull()
  })

  it('reports sidebar collapse state to rail content', () => {
    const shell = renderFrame(
      'overview',
      vi.fn(),
      <SurfaceRail>
        {(collapsed) => <p data-testid="rail-state">{collapsed ? 'collapsed' : 'expanded'}</p>}
      </SurfaceRail>,
    )
    const toggle = shell.querySelector<HTMLElement>('[data-testid="toggle-left"]')
    if (toggle === null) throw new Error('no sidebar toggle was rendered')

    expect(shell.querySelector('[data-testid="rail-state"]')?.textContent).toBe('expanded')
    expect(toggle.getAttribute('aria-label')).toBe('Hide sidebar')

    act(() => toggle.click())
    act(() => flushResizeObservers())

    expect(shell.querySelector('[data-testid="rail-state"]')?.textContent).toBe('collapsed')
    expect(toggle.getAttribute('aria-label')).toBe('Show sidebar')
  })

  it('routes each slot into its own region of the shell, not another one', () => {
    // Every slot is a portal, and a portal aimed at the wrong node still
    // renders — it just renders in the wrong place, which no other test here
    // would catch.
    const shell = renderFrame(
      'overview',
      vi.fn(),
      <>
        <SurfaceTop>
          <p data-testid="top-content">top</p>
        </SurfaceTop>
        <SurfaceRail>{() => <p data-testid="rail-content">rail</p>}</SurfaceRail>
        <SurfaceRight>
          <p data-testid="right-content">right</p>
        </SurfaceRight>
        <SurfaceStatus>
          <p data-testid="status-content">status</p>
        </SurfaceStatus>
        <p data-testid="main-content">main</p>
      </>,
    )

    const top = shell.querySelector('[data-testid="top-content"]')
    const rail = shell.querySelector('[data-testid="rail-content"]')
    const right = shell.querySelector('[data-testid="right-content"]')
    const status = shell.querySelector('[data-testid="status-content"]')
    const main = shell.querySelector('[data-testid="main-content"]')
    expect(top).not.toBeNull()
    expect(rail).not.toBeNull()
    expect(right).not.toBeNull()
    expect(status).not.toBeNull()
    expect(main).not.toBeNull()

    const leftPanel = shell.querySelector('#left .panel')
    const rightPanel = shell.querySelector('#right .panel')
    const statusbar = shell.querySelector('.statusbar')
    const tabpanel = shell.querySelector('.tabpanel')

    expect(leftPanel?.contains(rail)).toBe(true)
    expect(rightPanel?.contains(right)).toBe(true)
    expect(statusbar?.contains(status)).toBe(true)
    expect(tabpanel?.contains(main)).toBe(true)

    // Proof the top slot landed somewhere of its own, rather than silently
    // inside one of the other three regions.
    expect(leftPanel?.contains(top)).toBe(false)
    expect(rightPanel?.contains(top)).toBe(false)
    expect(statusbar?.contains(top)).toBe(false)
    expect(tabpanel?.contains(top)).toBe(false)
  })

  it('installs its structural styles once across frame remounts', () => {
    document.getElementById('app-frame-styles')?.remove()
    renderFrame('overview', vi.fn(), <p>first frame</p>)

    const styles = document.querySelectorAll('style#app-frame-styles')
    expect(styles).toHaveLength(1)
    expect(styles[0]?.tagName).toBe('STYLE')
    expect(styles[0]?.textContent).toContain('.app-frame__slot--contents')
    expect(styles[0]?.textContent).toContain('display: contents')
    expect(styles[0]?.textContent).toContain('.app-frame__slot--rail')
    expect(styles[0]?.textContent).toContain('flex-direction: column')

    act(() => root?.unmount())
    container?.remove()
    root = null
    container = null
    renderFrame('overview', vi.fn(), <p>second frame</p>)
    expect(document.querySelectorAll('style#app-frame-styles')).toHaveLength(1)
  })

  it('gives its hooks the ids of the frame\'s own tab elements', () => {
    function IdProbe() {
      const triggerId = useTabTriggerId()
      const panelId = useTabPanelId()
      return <span data-testid="ids" data-trigger-id={triggerId} data-panel-id={panelId} />
    }

    const shell = renderFrame('settings', vi.fn(), <IdProbe />)
    const ids = shell.querySelector('[data-testid="ids"]')
    const selectedTab = shell.querySelector('[role="tab"][aria-selected="true"]')
    const tabpanel = shell.querySelector('.tabpanel')

    // Surfaces wire these into `aria-labelledby` / `aria-controls`. An id that
    // names no real element is a dangling ARIA reference — it points at
    // nothing.
    expect(ids?.getAttribute('data-trigger-id')).toBe(selectedTab?.id)
    expect(ids?.getAttribute('data-panel-id')).toBe(tabpanel?.id)
  })
})

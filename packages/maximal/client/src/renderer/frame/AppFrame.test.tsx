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

// `ShellLayout` lays itself out with `react-resizable-panels`, which observes
// its own element for resize so it can recompute panel sizes. jsdom has no
// `ResizeObserver`, and none of the assertions below depend on layout math —
// only on what mounted and where — so a no-op stub is enough to let the tree
// render at all instead of throwing on mount.
class NoopResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = NoopResizeObserver as unknown as typeof ResizeObserver

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
): HTMLElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <AppFrame view={view} onSelectView={onSelectView}>
        {children}
      </AppFrame>,
    )
  })
  return container
}

describe('AppFrame', () => {
  it('mounts exactly one frame root', () => {
    // Every surface used to mount a `ShellLayout` of its own, and the frame's
    // root is `position: fixed; inset: 0` — a second one does not sit beside
    // the first, it covers its chrome.
    const shell = renderFrame('dashboard', vi.fn(), <p>content</p>)

    expect(shell.querySelectorAll('.sb-shell.app')).toHaveLength(1)
  })

  it('renders a title bar', () => {
    // `.titlebar` carries `-webkit-app-region: drag`, the window's only drag
    // region. Without it, the window cannot be moved.
    const shell = renderFrame('dashboard', vi.fn(), <p>content</p>)

    expect(shell.querySelector('.sb-shell.app .titlebar')).not.toBeNull()
  })

  it('lists the three views as tabs, with the current view marked selected', () => {
    const shell = renderFrame('workspace', vi.fn(), <p>content</p>)
    const tabs = [...shell.querySelectorAll('[role="tab"]')]

    expect(tabs.map((tab) => tab.textContent)).toEqual(['Dashboard', 'Runs', 'Settings'])

    const selected = tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true')
    expect(selected).toHaveLength(1)
    expect(selected[0]?.textContent).toBe('Runs')
  })

  it('reports the tab a click lands on through onSelectView', () => {
    const onSelectView = vi.fn()
    const shell = renderFrame('dashboard', onSelectView, <p>content</p>)
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

  it('routes each slot into its own region of the shell, not another one', () => {
    // Every slot is a portal, and a portal aimed at the wrong node still
    // renders — it just renders in the wrong place, which no other test here
    // would catch.
    const shell = renderFrame(
      'dashboard',
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

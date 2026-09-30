import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PRODUCT_TABS, SETTINGS_TAB, type AppTab } from './AppFrame'
import { WorkspaceRail } from './WorkspaceRail'

const terminal: AppTab = {
  id: 'terminal:one',
  title: 'zsh',
  icon: 'terminal',
  kind: 'terminal',
  closable: true,
  sessionId: 'session-one',
}

let container: HTMLElement | null = null

afterEach(() => {
  container?.remove()
  container = null
})

describe('WorkspaceRail', () => {
  it('shows product and terminal documents as titled workbar icons', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => {
      root.render(
        <WorkspaceRail
          tabs={[...PRODUCT_TABS, terminal, SETTINGS_TAB]}
          current={terminal.id}
          onSelect={vi.fn()}
          onOpenMap={vi.fn()}
        />,
      )
    })

    const items = [...container.querySelectorAll<HTMLElement>('.workbar__item')]
    expect(container.querySelector('.workbar__main')?.children).toHaveLength(4)
    expect(items.map((item) => item.title)).toEqual(['Workspace map', 'Overview', 'Traffic', 'zsh'])
    expect(container.querySelector('[data-testid="workbar-terminal-one"]')?.getAttribute('aria-current'))
      .toBe('true')
    expect(container.querySelector('[data-testid="workbar-settings"]')).toBeNull()

    act(() => root.unmount())
  })

  it('selects a document from the rail', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onSelect = vi.fn()
    act(() => {
      root.render(
        <WorkspaceRail
          tabs={[...PRODUCT_TABS, terminal]}
          current="overview"
          onSelect={onSelect}
          onOpenMap={vi.fn()}
        />,
      )
    })

    const traffic = container.querySelector<HTMLElement>('[data-testid="workbar-traffic"]')
    if (traffic === null) throw new Error('Traffic rail item was not rendered')
    act(() => traffic.click())
    expect(onSelect).toHaveBeenCalledWith('traffic')

    act(() => root.unmount())
  })

  it('opens the workspace map without changing the selected tab', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onSelect = vi.fn()
    const onOpenMap = vi.fn()
    act(() => {
      root.render(
        <WorkspaceRail
          tabs={[...PRODUCT_TABS, terminal]}
          current="overview"
          onSelect={onSelect}
          onOpenMap={onOpenMap}
        />,
      )
    })

    const map = container.querySelector<HTMLElement>('[data-testid="workbar-workspace-map"]')
    if (map === null) throw new Error('Workspace map rail item was not rendered')
    act(() => map.click())
    expect(onOpenMap).toHaveBeenCalledOnce()
    expect(onSelect).not.toHaveBeenCalled()

    act(() => root.unmount())
  })
})
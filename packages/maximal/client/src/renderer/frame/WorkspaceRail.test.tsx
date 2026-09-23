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
  it('shows product and terminal documents as titled icons when collapsed', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => {
      root.render(
        <WorkspaceRail
          tabs={[...PRODUCT_TABS, terminal, SETTINGS_TAB]}
          current={terminal.id}
          onSelect={vi.fn()}
        />,
      )
    })

    const items = [...container.querySelectorAll<HTMLElement>('.nav__item')]
    expect(container.querySelector('.nav__content')?.children).toHaveLength(3)
    expect(items.map((item) => item.title)).toEqual(['Overview', 'Traffic', 'zsh'])
    expect(container.querySelector('[data-testid="nav-terminal-one"]')?.getAttribute('aria-current'))
      .toBe('true')
    expect(container.querySelector('[data-testid="nav-settings"]')).toBeNull()

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
        />,
      )
    })

    const traffic = container.querySelector<HTMLElement>('[data-testid="nav-traffic"]')
    if (traffic === null) throw new Error('Traffic rail item was not rendered')
    act(() => traffic.click())
    expect(onSelect).toHaveBeenCalledWith('traffic')

    act(() => root.unmount())
  })
})
import { act } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { WorkspaceRail } from './WorkspaceRail'
import { createMaximalQueryClient } from '../query-client'

let container: HTMLElement | null = null

afterEach(() => {
  container?.remove()
  container = null
})

describe('WorkspaceRail', () => {
  it('shows the configurable workspace destinations', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => {
      root.render(
        <QueryClientProvider client={createMaximalQueryClient()}>
          <WorkspaceRail
            current="overview"
            onSelect={vi.fn()}
          />
        </QueryClientProvider>,
      )
    })

    const items = [...container.querySelectorAll<HTMLElement>('.workbar__item')]
    expect(container.querySelector('.workbar__main')?.children).toHaveLength(6)
    expect(items.map((item) => item.title)).toEqual([
      'Home',
      'Projects',
      'Overview',
      'Traffic',
      'Terminals',
      'Browsers',
    ])
    expect(container.querySelector('[data-testid="workbar-overview"]')?.getAttribute('aria-current'))
      .toBe('true')

    act(() => root.unmount())
  })

  it('selects a document from the rail', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onSelect = vi.fn()
    act(() => {
      root.render(
        <QueryClientProvider client={createMaximalQueryClient()}>
          <WorkspaceRail
            current="overview"
            onSelect={onSelect}
          />
        </QueryClientProvider>,
      )
    })

    const traffic = container.querySelector<HTMLElement>('[data-testid="workbar-traffic"]')
    if (traffic === null) throw new Error('Traffic rail item was not rendered')
    act(() => traffic.click())
    expect(onSelect).toHaveBeenCalledWith('traffic')

    act(() => root.unmount())
  })

  it('selects Home as the docked workspace map', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onSelect = vi.fn()
    act(() => {
      root.render(
        <QueryClientProvider client={createMaximalQueryClient()}>
          <WorkspaceRail
            current="overview"
            onSelect={onSelect}
          />
        </QueryClientProvider>,
      )
    })

    const home = container.querySelector<HTMLElement>('[data-testid="workbar-home"]')
    if (home === null) throw new Error('Home workbar item was not rendered')
    act(() => home.click())
    expect(onSelect).toHaveBeenCalledWith('home')

    act(() => root.unmount())
  })
})
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import * as Tooltip from '@radix-ui/react-tooltip'

import { WorkspaceRail } from '../frame/WorkspaceRail'
import { WorkbarSection } from './WorkbarSection'

let container: HTMLElement | null = null

afterEach(() => {
  localStorage.clear()
  container?.remove()
  container = null
})

describe('WorkbarSection', () => {
  it('updates workbar visibility and persisted ordering', () => {
    container = document.createElement('div')
    container.className = 'sb-shell'
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => {
      root.render(
        <Tooltip.Provider>
          <WorkspaceRail current="home" onSelect={() => undefined} />
          <WorkbarSection />
        </Tooltip.Provider>,
      )
    })

    const browserSwitch = container.querySelector<HTMLButtonElement>(
      '[aria-label="Show Browsers in workbar"]',
    )
    expect(browserSwitch).not.toBeNull()
    act(() => browserSwitch?.click())
    expect(container.querySelector('[data-testid="nav-browsers"]')).toBeNull()

    const moveProjectsUp = container.querySelector<HTMLButtonElement>(
      '[aria-label="Move Projects up"]',
    )
    act(() => moveProjectsUp?.click())
    expect([...container.querySelectorAll<HTMLElement>('.workbar__item')]
      .map((item) => item.title)).toEqual([
        'Projects',
        'Home',
        'Overview',
        'Traffic',
        'Terminals',
      ])

    const saved = JSON.parse(
      localStorage.getItem('maximal.workbar.layout') ?? '{}',
    ) as { order: string[]; visible: string[] }
    expect(saved.order.slice(0, 2)).toEqual(['projects', 'home'])
    expect(saved.visible).not.toContain('browsers')

    act(() => root.unmount())
  })
})

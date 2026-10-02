import { act } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import * as Tooltip from '@radix-ui/react-tooltip'

import { WorkspaceRail } from '../frame/WorkspaceRail'
import { createMaximalQueryClient } from '../query-client'
import { WorkbarSection } from './WorkbarSection'

let container: HTMLElement | null = null

afterEach(() => {
  container?.remove()
  container = null
})

describe('WorkbarSection', () => {
  it('updates shared workbar visibility and ordering', async () => {
    container = document.createElement('div')
    container.className = 'sb-shell'
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => {
      root.render(
        <QueryClientProvider client={createMaximalQueryClient()}>
          <Tooltip.Provider>
            <WorkspaceRail current="home" onSelect={() => undefined} />
            <WorkbarSection />
          </Tooltip.Provider>
        </QueryClientProvider>,
      )
    })

    const browserSwitch = container.querySelector<HTMLButtonElement>(
      '[aria-label="Show Browsers in workbar"]',
    )
    expect(browserSwitch).not.toBeNull()
    await act(async () => {
      browserSwitch?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(container.querySelector('[data-testid="nav-browsers"]')).toBeNull()

    const moveProjectsUp = container.querySelector<HTMLButtonElement>(
      '[aria-label="Move Projects up"]',
    )
    await act(async () => {
      moveProjectsUp?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect([...container.querySelectorAll<HTMLElement>('.workbar__item')]
      .map((item) => item.title)).toEqual([
        'Projects',
        'Home',
        'Overview',
        'Traffic',
        'Terminals',
      ])

    act(() => root.unmount())
  })
})

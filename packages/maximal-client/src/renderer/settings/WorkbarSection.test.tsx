import { act } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Tooltip from '@radix-ui/react-tooltip'

import { WorkspaceRail } from '../frame/WorkspaceRail'
import { createMaximalQueryClient } from '../query-client'
import { WorkbarSection } from './WorkbarSection'
import { createPreviewSettingsCapabilities } from './ui-preview-capabilities'

let container: HTMLElement | null = null

async function settleQueries(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
}

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
    const capabilities = createPreviewSettingsCapabilities()
    const update = vi.spyOn(capabilities.workbar, 'update')
    act(() => {
      root.render(
        <QueryClientProvider client={createMaximalQueryClient()}>
          <Tooltip.Provider>
            <WorkspaceRail
              current="home"
              onSelect={() => undefined}
              workbar={capabilities.workbar}
            />
            <WorkbarSection capabilities={capabilities} />
          </Tooltip.Provider>
        </QueryClientProvider>,
      )
    })
    await settleQueries()

    const browserSwitch = container.querySelector<HTMLButtonElement>(
      '[aria-label="Show Browsers in workbar"]',
    )
    expect(browserSwitch).not.toBeNull()
    await act(async () => {
      browserSwitch?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(container.querySelector('[data-testid="nav-browsers"]')).toBeNull()
    expect(update.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      visible: ['home', 'projects', 'overview', 'traffic', 'terminals'],
    }))

    const moveProjectsUp = container.querySelector<HTMLButtonElement>(
      '[aria-label="Move Projects up"]',
    )
    await vi.waitFor(async () => {
      await settleQueries()
      expect(moveProjectsUp?.disabled).toBe(false)
    })
    await act(async () => {
      moveProjectsUp?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await settleQueries()
    expect([...container.querySelectorAll<HTMLElement>('.workbar__item')]
      .map((item) => item.title)).toEqual([
        'Projects',
        'Home',
        'Overview',
        'Traffic',
        'Terminals',
      ])
    expect(update.mock.lastCall?.[0]).toEqual(expect.objectContaining({
      order: ['projects', 'home', 'overview', 'traffic', 'terminals', 'browsers'],
    }))

    act(() => root.unmount())
  })

  it('rolls back optimistic changes and surfaces persistence failures', async () => {
    container = document.createElement('div')
    container.className = 'sb-shell'
    document.body.appendChild(container)
    const root = createRoot(container)
    const capabilities = createPreviewSettingsCapabilities()
    capabilities.workbar.update = vi.fn(async () => {
      throw new Error('settings file is read-only')
    })
    act(() => {
      root.render(
        <QueryClientProvider client={createMaximalQueryClient()}>
          <Tooltip.Provider>
            <WorkbarSection capabilities={capabilities} />
          </Tooltip.Provider>
        </QueryClientProvider>,
      )
    })
    await settleQueries()

    const browserSwitch = container.querySelector<HTMLButtonElement>(
      '[aria-label="Show Browsers in workbar"]',
    )
    await act(async () => {
      browserSwitch?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(browserSwitch?.getAttribute('aria-checked')).toBe('true')
    expect(container.textContent).toContain(
      'Could not save workbar layout: settings file is read-only',
    )

    act(() => root.unmount())
  })
})

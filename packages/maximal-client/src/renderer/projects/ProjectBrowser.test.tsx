import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ProjectSearchResult } from '@maximal/project-catalog'
import { TooltipProvider } from '@maximal/maximal-electron/renderer'
import type { MaximalHost } from '../../shared/host'
import { ProjectBrowser } from './ProjectBrowser'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

function result(
  id: string,
  change: Partial<ProjectSearchResult> = {},
): ProjectSearchResult {
  return {
    id,
    name: id,
    path: `/work/${id}`,
    kind: 'folder',
    availability: 'available',
    remotes: [],
    markers: [],
    lastSeenAt: '2026-01-01T00:00:00.000Z',
    visitCount: 0,
    pinned: false,
    trusted: true,
    score: 1,
    ...change,
  }
}

function deferred<T>(): {
  promise: Promise<T>
  resolve(value: T): void
  reject(cause: unknown): void
} {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept
    reject = decline
  })
  return { promise, resolve, reject }
}

function projectsApi(
  overrides: Partial<MaximalHost['projects']> = {},
): MaximalHost['projects'] {
  return {
    search: vi.fn(async () => []),
    snapshot: vi.fn(async () => ({ roots: [], projects: [], refreshing: false })),
    addRoot: vi.fn(async () => null),
    updateRoot: vi.fn(),
    removeRoot: vi.fn(async () => {}),
    refresh: vi.fn(async () => ({ roots: [], projects: [], refreshing: false })),
    opened: vi.fn(async () => {}),
    onChange: vi.fn(() => () => {}),
    ...overrides,
  }
}

let reactRoot: Root | undefined
afterEach(() => {
  act(() => reactRoot?.unmount())
  reactRoot = undefined
  document.body.replaceChildren()
  vi.useRealTimers()
})

async function renderBrowser({
  api = projectsApi(),
  open = true,
  onOpenChange = vi.fn(),
  onOpenProject = vi.fn(async () => {}),
  onOpenSettings = vi.fn(),
}: {
  api?: MaximalHost['projects']
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onOpenProject?: (project: ProjectSearchResult) => Promise<void>
  onOpenSettings?: () => void
} = {}): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.append(container)
  reactRoot = createRoot(container)
  await act(async () => {
    reactRoot?.render(
      <TooltipProvider>
        <ProjectBrowser
          open={open}
          onOpenChange={onOpenChange}
          onOpenProject={onOpenProject}
          onOpenSettings={onOpenSettings}
          projectsApi={api}
        />
      </TooltipProvider>,
    )
  })
  return document.body
}

async function runTimers(): Promise<void> {
  await act(async () => vi.advanceTimersByTimeAsync(100))
}

async function typeQuery(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
      ?.set?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function openProject(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  })
}

describe('ProjectBrowser', () => {
  it('renders its search contract and empty result state', async () => {
    vi.useFakeTimers()
    const search = vi.fn(async () => [])
    const container = await renderBrowser({ api: projectsApi({ search }) })
    await runTimers()

    expect(search).toHaveBeenCalledWith('', 75)
    expect(container.querySelector('[data-testid="project-browser"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Search projects"]')
      ?.getAttribute('placeholder')).toBe('Search by name, path, or remote')
    expect(container.querySelector('[role="application"]')?.getAttribute('aria-label'))
      .toBe('Project map canvas')
    expect(container.textContent).toContain('Open project')
    expect(container.textContent).toContain('Search local folders and repositories.')
    expect(container.textContent).toContain(
      'No projects found. Add a discovery folder in Projects settings.',
    )
    expect(container.querySelector('[aria-label="Maximal menu"]')).not.toBeNull()
  })

  it('debounces query changes and rejects stale successes and failures', async () => {
    vi.useFakeTimers()
    const initial = deferred<ProjectSearchResult[]>()
    const invalidated = deferred<ProjectSearchResult[]>()
    const search: MaximalHost['projects']['search'] = vi.fn()
      .mockImplementationOnce(() => initial.promise)
      .mockResolvedValueOnce([result('new-result')])
      .mockImplementationOnce(() => invalidated.promise)
      .mockResolvedValueOnce([result('newest-result')])
    let listener: (() => void) | undefined
    const container = await renderBrowser({
      api: projectsApi({
        search,
        onChange: vi.fn((onChange: () => void) => {
          listener = onChange
          return () => {}
        }),
      }),
    })
    await runTimers()
    expect(container.querySelectorAll('.spatial-canvas__project')).toHaveLength(0)
    const input = container.querySelector<HTMLInputElement>('[aria-label="Search projects"]')!

    await typeQuery(input, 'new')
    expect(search).toHaveBeenCalledTimes(1)
    await act(async () => vi.advanceTimersByTimeAsync(79))
    expect(search).toHaveBeenCalledTimes(1)
    await act(async () => vi.advanceTimersByTimeAsync(1))
    expect(search).toHaveBeenLastCalledWith('new', 75)
    expect(container.textContent).toContain('new-result')

    await act(async () => listener?.())
    await typeQuery(input, 'newest')
    await runTimers()
    expect(container.textContent).toContain('newest-result')

    await act(async () => initial.resolve([result('old-result')]))
    await act(async () => invalidated.reject(new Error('stale failure')))
    expect(container.textContent).not.toContain('old-result')
    expect(container.textContent).not.toContain('stale failure')
    expect(container.textContent).toContain('newest-result')
  })

  it('shows the latest search error and clears it after recovery', async () => {
    vi.useFakeTimers()
    const search: MaximalHost['projects']['search'] = vi.fn()
      .mockRejectedValueOnce(new Error('search unavailable'))
      .mockResolvedValueOnce([result('recovered')])
    let listener: (() => void) | undefined
    const container = await renderBrowser({
      api: projectsApi({
        search,
        onChange: vi.fn((onChange: () => void) => {
          listener = onChange
          return () => {}
        }),
      }),
    })
    await runTimers()
    expect(container.textContent).toContain('search unavailable')
    expect(container.textContent).not.toContain('No projects found')

    await act(async () => listener?.())
    expect(container.textContent).toContain('recovered')
    expect(container.textContent).not.toContain('search unavailable')
  })

  it('presents trust and availability restrictions without hiding results', async () => {
    vi.useFakeTimers()
    const container = await renderBrowser({
      api: projectsApi({
        search: vi.fn(async () => [
          result('restricted', { trusted: false }),
          result('missing', { availability: 'missing', kind: 'repository' }),
        ]),
      }),
    })
    await runTimers()

    const projects = [
      ...container.querySelectorAll<HTMLButtonElement>('.spatial-canvas__project'),
    ]
    expect(projects).toHaveLength(2)
    expect(projects[0]?.disabled).toBe(true)
    expect(projects[0]?.querySelector('.spatial-canvas__project-meta')?.textContent)
      .toBe('folder · Restricted mode')
    expect(projects[1]?.disabled).toBe(true)
    expect(projects[1]?.querySelector('.spatial-canvas__project-meta')?.textContent)
      .toBe('repository · missing')
    expect(projects[0]?.getAttribute('aria-pressed')).toBe('false')
    expect(projects[0]?.textContent).toContain('/work/restricted')
    expect(container.textContent).not.toContain('No projects found')
  })

  it('disables project actions while opening and records a successful visit', async () => {
    vi.useFakeTimers()
    const opening = deferred<void>()
    const opened = vi.fn(async () => {})
    const onOpenProject = vi.fn(() => opening.promise)
    const onOpenChange = vi.fn()
    const container = await renderBrowser({
      api: projectsApi({
        search: vi.fn(async () => [result('ready')]),
        opened,
      }),
      onOpenProject,
      onOpenChange,
    })
    await runTimers()
    const button = container.querySelector<HTMLButtonElement>('.spatial-canvas__project')!

    await openProject(button)
    expect(button.disabled).toBe(true)
    expect(onOpenProject).toHaveBeenCalledWith(expect.objectContaining({ id: 'ready' }))
    expect(opened).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()

    await act(async () => opening.resolve())
    expect(opened).toHaveBeenCalledWith('ready')
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(button.disabled).toBe(false)
  })

  it('reports project-open and visit failures and restores the action', async () => {
    vi.useFakeTimers()
    const opened = vi.fn()
      .mockRejectedValueOnce(new Error('visit failed'))
      .mockResolvedValue(undefined)
    const onOpenProject = vi.fn()
      .mockRejectedValueOnce(new Error('launch failed'))
      .mockResolvedValue(undefined)
    const onOpenChange = vi.fn()
    const container = await renderBrowser({
      api: projectsApi({
        search: vi.fn(async () => [result('ready')]),
        opened,
      }),
      onOpenProject,
      onOpenChange,
    })
    await runTimers()
    const button = container.querySelector<HTMLButtonElement>('.spatial-canvas__project')!

    await openProject(button)
    expect(container.textContent).toContain('launch failed')
    expect(button.disabled).toBe(false)
    expect(opened).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()

    await openProject(button)
    expect(container.textContent).toContain('visit failed')
    expect(button.disabled).toBe(false)
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('runs settings and add-folder actions and reports add failures', async () => {
    vi.useFakeTimers()
    const onOpenSettings = vi.fn()
    const addRoot = vi.fn()
      .mockRejectedValueOnce(new Error('picker failed'))
      .mockResolvedValue(null)
    const container = await renderBrowser({
      api: projectsApi({ addRoot }),
      onOpenSettings,
    })
    await runTimers()
    const menu = container.querySelector<HTMLButtonElement>(
      '[aria-label="Maximal menu"]',
    )!
    const openMenu = async () => {
      await act(async () => {
        menu.dispatchEvent(new MouseEvent('pointerdown', {
          bubbles: true,
          button: 0,
        }))
      })
    }
    const menuItem = (label: string) =>
      [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
        .find((item) => item.textContent === label)!

    await openMenu()
    await act(async () => menuItem('Project settings').click())
    expect(onOpenSettings).toHaveBeenCalledOnce()
    await openMenu()
    await act(async () => menuItem('Add project folder').click())
    expect(addRoot).toHaveBeenCalledOnce()
    expect(container.textContent).toContain('picker failed')
    await openMenu()
    await act(async () => menuItem('Add project folder').click())
    expect(addRoot).toHaveBeenCalledTimes(2)
  })

  it('cancels delayed searches and unsubscribes during cleanup', async () => {
    vi.useFakeTimers()
    const pending = deferred<ProjectSearchResult[]>()
    const unsubscribe = vi.fn()
    const search = vi.fn(() => pending.promise)
    const api = projectsApi({
      search,
      onChange: vi.fn(() => unsubscribe),
    })
    const container = await renderBrowser({ api })
    await runTimers()

    await act(async () => {
      reactRoot?.render(
        <ProjectBrowser
          open={false}
          onOpenChange={vi.fn()}
          onOpenProject={vi.fn(async () => {})}
          onOpenSettings={vi.fn()}
          projectsApi={api}
        />,
      )
    })
    await act(async () => pending.resolve([result('too-late')]))
    expect(container.textContent).not.toContain('too-late')

    act(() => reactRoot?.unmount())
    reactRoot = undefined
    expect(unsubscribe).toHaveBeenCalledTimes(2)
  })

  it('does not search while closed and cancels a pending debounce', async () => {
    vi.useFakeTimers()
    const search = vi.fn(async () => [])
    let listener: (() => void) | undefined
    const api = projectsApi({
      search,
      onChange: vi.fn((onChange: () => void) => {
        listener = onChange
        return () => {}
      }),
    })
    await renderBrowser({ api, open: false })
    await runTimers()
    expect(search).not.toHaveBeenCalled()
    await act(async () => listener?.())
    expect(search).not.toHaveBeenCalled()

    await act(async () => {
      reactRoot?.render(
        <ProjectBrowser
          open
          onOpenChange={vi.fn()}
          onOpenProject={vi.fn(async () => {})}
          onOpenSettings={vi.fn()}
          projectsApi={api}
        />,
      )
    })
    await runTimers()
    const input = document.body.querySelector<HTMLInputElement>('[aria-label="Search projects"]')!
    await typeQuery(input, 'delayed')
    await act(async () => {
      reactRoot?.render(
        <ProjectBrowser
          open={false}
          onOpenChange={vi.fn()}
          onOpenProject={vi.fn(async () => {})}
          onOpenSettings={vi.fn()}
          projectsApi={api}
        />,
      )
    })
    await runTimers()
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('uses a replacement API after its host capability changes', async () => {
    vi.useFakeTimers()
    const firstSearch = vi.fn(async () => [result('first')])
    const firstUnsubscribe = vi.fn()
    const first = projectsApi({
      search: firstSearch,
      onChange: vi.fn(() => firstUnsubscribe),
    })
    await renderBrowser({ api: first })
    await runTimers()
    expect(document.body.textContent).toContain('first')

    const secondSearch = vi.fn(async () => [result('second')])
    let secondListener: (() => void) | undefined
    const second = projectsApi({
      search: secondSearch,
      onChange: vi.fn((listener: () => void) => {
        secondListener = listener
        return () => {}
      }),
    })
    await act(async () => {
      reactRoot?.render(
        <ProjectBrowser
          open
          onOpenChange={vi.fn()}
          onOpenProject={vi.fn(async () => {})}
          onOpenSettings={vi.fn()}
          projectsApi={second}
        />,
      )
    })
    await runTimers()
    expect(firstUnsubscribe).toHaveBeenCalledOnce()
    expect(secondSearch).toHaveBeenCalledWith('', 75)
    expect(document.body.textContent).toContain('second')

    await act(async () => secondListener?.())
    expect(secondSearch).toHaveBeenCalledTimes(2)
  })
})

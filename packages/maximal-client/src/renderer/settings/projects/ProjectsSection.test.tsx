import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DiscoveryRoot, ProjectCatalogSnapshot } from '@maximal/project-catalog'

import type { SettingsCapabilities } from '../capabilities'
import { ProjectsSection } from './ProjectsSection'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const root: DiscoveryRoot = {
  id: 'root-1',
  path: '/work',
  enabled: true,
  trusted: false,
  trustSubtrees: false,
  maxDepth: 4,
  maxEntries: 100,
  maxDurationMs: 1_000,
  includeHidden: false,
  exclusions: ['node_modules'],
  lastScanState: 'complete',
  issueCount: 0,
}

function snapshot(roots: DiscoveryRoot[] = []): ProjectCatalogSnapshot {
  return { roots, projects: [], refreshing: false }
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

function capabilities(
  overrides: Partial<SettingsCapabilities['projects']> = {},
): Pick<SettingsCapabilities, 'projects'> {
  return {
    projects: {
      snapshot: vi.fn(async () => snapshot()),
      addRoot: vi.fn(async () => null),
      updateRoot: vi.fn(async () => root),
      removeRoot: vi.fn(async () => {}),
      refresh: vi.fn(async () => snapshot()),
      subscribe: vi.fn(() => () => {}),
      ...overrides,
    },
  }
}

let reactRoot: Root | undefined
afterEach(() => {
  act(() => reactRoot?.unmount())
  reactRoot = undefined
  document.body.replaceChildren()
})

async function render(
  value: Pick<SettingsCapabilities, 'projects'>,
): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.append(container)
  reactRoot = createRoot(container)
  await act(async () => {
    reactRoot?.render(<ProjectsSection capabilities={value} />)
  })
  return container
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  return [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find((candidate) => candidate.textContent === label)!
}

function switchFor(container: HTMLElement, label: string): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>(
    `[role="switch"][aria-label="${label}"]`,
  )!
}

describe('ProjectsSection', () => {
  it('renders distinct loading and empty states with the discovery contract', async () => {
    const loading = deferred<ProjectCatalogSnapshot>()
    const container = await render(capabilities({ snapshot: () => loading.promise }))

    expect(container.textContent).toContain('Discovery and trust')
    expect(container.textContent).toContain(
      'Choose where Maximal discovers projects and which folders may launch terminals.',
    )
    expect(container.textContent).toContain('Discovery roots')
    expect(container.textContent).toContain(
      'Maximal scans only folders you add. New roots start untrusted.',
    )
    expect(container.textContent).toContain(
      'Trusting a folder permits opening it in a terminal. “Trust subtrees” extends that permission to discovered projects below the selected folder.',
    )
    expect(container.textContent).toContain('Loading project folders…')
    expect(container.textContent).not.toContain('No project folders have been added.')
    expect(button(container, 'Add folder')).not.toBeNull()
    expect(button(container, 'Refresh all')).not.toBeNull()

    await act(async () => loading.resolve(snapshot()))
    expect(container.textContent).not.toContain('Loading project folders…')
    expect(container.textContent).toContain('No project folders have been added.')
  })

  it('renders root status, issue count, trust controls, and exclusions', async () => {
    const value = capabilities({
      snapshot: vi.fn(async () => snapshot([{
        ...root,
        issueCount: 2,
        lastScanState: 'partial',
      }])),
    })
    const container = await render(value)

    expect(container.textContent).toContain('/work')
    expect(container.textContent).toContain('Scan: partial · 2 issues')
    expect(container.textContent).not.toContain('No project folders have been added.')
    expect(container.querySelector('.settings__group')?.getAttribute('data-dividers')).toBe('false')
    expect(container.textContent).toContain('Discover subtrees')
    expect(container.textContent).toContain('Trust this folder')
    expect(container.textContent).toContain('Trust subtrees')
    expect(container.textContent).toContain('Excluded directory names')
    expect(switchFor(container, 'Discover projects under /work').getAttribute('aria-checked'))
      .toBe('true')
    expect(switchFor(container, 'Trust /work').getAttribute('aria-checked')).toBe('false')
    expect(switchFor(container, 'Trust projects below /work').disabled).toBe(true)
    const exclusions = container.querySelector<HTMLInputElement>(
      '[aria-label="Excluded directories for /work"]',
    )!
    expect(exclusions.value).toBe('node_modules')
    expect(exclusions.placeholder).toBe('node_modules, vendor, generated')
    expect(button(container, 'Refresh')).not.toBeNull()
    expect(button(container, 'Remove')).not.toBeNull()
  })

  it('omits the issue suffix when a completed root has no issues', async () => {
    const container = await render(capabilities({
      snapshot: vi.fn(async () => snapshot([root])),
    }))
    const description = [...container.querySelectorAll('p')]
      .find((element) => element.textContent?.startsWith('Scan:'))
    expect(description?.textContent).toBe('Scan: complete')
    expect(container.textContent).not.toContain('issues')
  })

  it('persists each trust toggle and reloads the resulting state', async () => {
    let current = { ...root, trusted: true, trustSubtrees: false }
    const updateRoot = vi.fn(async (
      _id: string,
      update: Parameters<SettingsCapabilities['projects']['updateRoot']>[1],
    ) => {
      current = { ...current, ...update }
      return current
    })
    const value = capabilities({
      snapshot: vi.fn(async () => snapshot([current])),
      updateRoot,
    })
    const container = await render(value)

    await act(async () => switchFor(container, 'Discover projects under /work').click())
    expect(updateRoot).toHaveBeenLastCalledWith('root-1', { enabled: false })
    expect(switchFor(container, 'Discover projects under /work').getAttribute('aria-checked'))
      .toBe('false')

    await act(async () => switchFor(container, 'Trust projects below /work').click())
    expect(updateRoot).toHaveBeenLastCalledWith('root-1', { trustSubtrees: true })
    expect(switchFor(container, 'Trust projects below /work').getAttribute('aria-checked'))
      .toBe('true')

    await act(async () => switchFor(container, 'Trust /work').click())
    expect(updateRoot).toHaveBeenLastCalledWith('root-1', { trusted: false })
    expect(switchFor(container, 'Trust /work').getAttribute('aria-checked')).toBe('false')
  })

  it('normalizes, removes empties, and deduplicates exclusions on blur', async () => {
    let current = { ...root }
    const updateRoot = vi.fn(async (
      _id: string,
      update: Parameters<SettingsCapabilities['projects']['updateRoot']>[1],
    ) => {
      current = { ...current, ...update }
      return current
    })
    const container = await render(capabilities({
      snapshot: vi.fn(async () => snapshot([current])),
      updateRoot,
    }))
    const input = container.querySelector<HTMLInputElement>(
      '[aria-label="Excluded directories for /work"]',
    )!

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
        ?.set?.call(input, ' vendor, , generated, vendor ')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })
    expect(updateRoot).toHaveBeenCalledWith('root-1', {
      exclusions: ['vendor', 'generated'],
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.querySelector<HTMLInputElement>(
      '[aria-label="Excluded directories for /work"]',
    )?.value).toBe('vendor, generated')
  })

  it('runs add, refresh, root refresh, and remove actions before reloading', async () => {
    const addRoot = vi.fn(async () => root)
    const refresh = vi.fn(async () => snapshot([root]))
    const removeRoot = vi.fn(async () => {})
    const snapshotCall = vi.fn(async () => snapshot([root]))
    const container = await render(capabilities({
      snapshot: snapshotCall,
      addRoot,
      refresh,
      removeRoot,
    }))

    await act(async () => button(container, 'Add folder').click())
    expect(addRoot).toHaveBeenCalledOnce()
    expect(snapshotCall).toHaveBeenCalledTimes(2)

    await act(async () => button(container, 'Refresh all').click())
    expect(refresh).toHaveBeenCalledWith()
    expect(snapshotCall).toHaveBeenCalledTimes(3)

    await act(async () => button(container, 'Refresh').click())
    expect(refresh).toHaveBeenCalledWith('root-1')
    expect(snapshotCall).toHaveBeenCalledTimes(4)

    await act(async () => button(container, 'Remove').click())
    expect(removeRoot).toHaveBeenCalledWith('root-1')
    expect(snapshotCall).toHaveBeenCalledTimes(5)
  })

  it.each([
    ['add', 'Add folder'],
    ['refresh all', 'Refresh all'],
    ['refresh root', 'Refresh'],
    ['remove', 'Remove'],
  ])('surfaces a %s action failure without reloading', async (method, label) => {
    const failure = vi.fn(async () => {
      throw new Error(`${method} failed`)
    })
    const snapshotCall = vi.fn(async () => snapshot([root]))
    const overrides = method === 'add'
      ? { addRoot: failure }
      : method === 'remove'
        ? { removeRoot: failure }
        : { refresh: failure }
    const container = await render(capabilities({ snapshot: snapshotCall, ...overrides }))

    await act(async () => button(container, label).click())
    expect(container.textContent).toContain(`${method} failed`)
    expect(snapshotCall).toHaveBeenCalledOnce()
  })

  it('surfaces update and delayed load failures without showing empty state', async () => {
    const loading = deferred<ProjectCatalogSnapshot>()
    const container = await render(capabilities({ snapshot: () => loading.promise }))
    await act(async () => loading.reject(new Error('catalog unavailable')))
    expect(container.textContent).toContain('catalog unavailable')
    expect(container.textContent).not.toContain('No project folders have been added.')
    expect(container.textContent).not.toContain('Loading project folders…')

    const updateRoot = vi.fn(async () => {
      throw new Error('trust update failed')
    })
    const loaded = await render(capabilities({
      snapshot: vi.fn(async () => snapshot([{ ...root, trusted: true }])),
      updateRoot,
    }))
    await act(async () => switchFor(loaded, 'Trust /work').click())
    expect(loaded.textContent).toContain('trust update failed')
  })

  it('rejects stale snapshots, clears recovered errors, and follows invalidations', async () => {
    const initial = deferred<ProjectCatalogSnapshot>()
    const stale = deferred<ProjectCatalogSnapshot>()
    let listener: (() => void) | undefined
    const latest = snapshot([{ ...root, trusted: true }])
    const snapshotCall: SettingsCapabilities['projects']['snapshot'] = vi.fn()
      .mockImplementationOnce(() => initial.promise)
      .mockImplementationOnce(() => stale.promise)
      .mockResolvedValueOnce(latest)
    const container = await render(capabilities({
      snapshot: snapshotCall,
      subscribe: vi.fn((onChange: () => void) => {
        listener = onChange
        return () => {}
      }),
    }))

    await act(async () => listener?.())
    await act(async () => listener?.())
    expect(snapshotCall).toHaveBeenCalledTimes(3)
    expect(switchFor(container, 'Trust /work').getAttribute('aria-checked')).toBe('true')

    await act(async () => initial.reject(new Error('stale initial failure')))
    await act(async () => stale.resolve(snapshot()))
    expect(container.textContent).not.toContain('stale initial failure')
    expect(container.textContent).toContain('/work')
    expect(switchFor(container, 'Trust /work').getAttribute('aria-checked')).toBe('true')
  })

  it('invalidates pending loads and unsubscribes on cleanup', async () => {
    const pending = deferred<ProjectCatalogSnapshot>()
    const unsubscribe = vi.fn()
    const container = await render(capabilities({
      snapshot: () => pending.promise,
      subscribe: vi.fn(() => unsubscribe),
    }))

    act(() => reactRoot?.unmount())
    reactRoot = undefined
    await act(async () => pending.resolve(snapshot([root])))
    expect(container.textContent).not.toContain('/work')
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('clears a current error after a successful invalidation', async () => {
    let listener: (() => void) | undefined
    const snapshotCall: SettingsCapabilities['projects']['snapshot'] = vi.fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(snapshot([root]))
    const container = await render(capabilities({
      snapshot: snapshotCall,
      subscribe: vi.fn((onChange: () => void) => {
        listener = onChange
        return () => {}
      }),
    }))
    expect(container.textContent).toContain('temporary failure')

    await act(async () => listener?.())
    expect(container.textContent).not.toContain('temporary failure')
    expect(container.textContent).toContain('/work')
  })

  it('uses replacement capabilities for subscriptions, loads, and actions', async () => {
    const firstUnsubscribe = vi.fn()
    const first = capabilities({
      snapshot: vi.fn(async () => snapshot()),
      subscribe: vi.fn(() => firstUnsubscribe),
    })
    const container = await render(first)
    const addRoot = vi.fn(async () => root)
    const secondSnapshot = vi.fn(async () => snapshot([root]))
    let secondListener: (() => void) | undefined
    const second = capabilities({
      snapshot: secondSnapshot,
      addRoot,
      subscribe: vi.fn((onChange: () => void) => {
        secondListener = onChange
        return () => {}
      }),
    })

    await act(async () => {
      reactRoot?.render(<ProjectsSection capabilities={second} />)
    })
    expect(firstUnsubscribe).toHaveBeenCalledOnce()
    expect(secondSnapshot).toHaveBeenCalledOnce()
    expect(container.textContent).toContain('/work')

    await act(async () => button(container, 'Add folder').click())
    expect(addRoot).toHaveBeenCalledOnce()
    expect(secondSnapshot).toHaveBeenCalledTimes(2)
    await act(async () => secondListener?.())
    expect(secondSnapshot).toHaveBeenCalledTimes(3)
  })
})

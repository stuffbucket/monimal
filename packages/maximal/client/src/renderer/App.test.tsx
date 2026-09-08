import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { createObservabilitySource, observabilitySource } = vi.hoisted(() => {
  const observabilitySource = { source: 'stable-observability-source' }
  return {
    observabilitySource,
    createObservabilitySource: vi.fn(() => observabilitySource),
  }
})

vi.mock('@stuffbucket/maximal-observability', () => ({
  ObservabilityProvider: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('./traffic/source', () => ({ createObservabilitySource }))
vi.mock('./settings/capabilities', () => ({
  createCoreSettingsCapabilities: () => ({
    account: { status: async () => ({ state: 'authenticated' }) },
    subscribe: () => () => {},
  }),
}))
vi.mock('./first-run/FirstRun', () => ({ FirstRun: () => <p>First run</p> }))
vi.mock('./overview/Overview', () => ({ Overview: () => <p>Overview content</p> }))
vi.mock('./traffic/Traffic', () => ({ Traffic: () => <p>Traffic content</p> }))
vi.mock('./settings/Settings', () => ({ Settings: () => <p>Settings content</p> }))

import { App } from './App'

class NoopResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = NoopResizeObserver as unknown as typeof ResizeObserver
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | null = null
let container: HTMLElement | null = null

afterEach(() => {
  if (root !== null) act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.clearAllMocks()
})

describe('App observability composition', () => {
  it('creates one source and keeps it while switching between overview and traffic', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<App />)
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Overview content')
    expect(createObservabilitySource).toHaveBeenCalledTimes(1)

    const trafficTab = [...container.querySelectorAll('[role="tab"]')].find(
      (tab) => tab.textContent === 'Traffic',
    )
    if (trafficTab === undefined) throw new Error('Traffic tab was not rendered')

    act(() => {
      trafficTab.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          button: 0,
        }),
      )
    })

    expect(container.textContent).toContain('Traffic content')
    expect(createObservabilitySource).toHaveBeenCalledTimes(1)
    expect(observabilitySource).toEqual({
      source: 'stable-observability-source',
    })
  })
})

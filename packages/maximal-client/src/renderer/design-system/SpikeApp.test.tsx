import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { MaximalQueryProvider } from '../query-client'
import { SpikeApp } from './SpikeApp'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

class NoopResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = NoopResizeObserver

const uiModeGet = vi.fn(async () => ({ mode: 'spike' as const, switchable: true }))
let container: HTMLElement
let root: Root

beforeEach(() => {
  Object.assign(window, { maximal: { uiMode: { get: uiModeGet, set: vi.fn(async () => undefined) } } })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

it('mounts the full spike shell filling the window beneath the renderer switch', async () => {
  await act(async () => {
    root.render(<MaximalQueryProvider><SpikeApp /></MaximalQueryProvider>)
  })
  await vi.waitFor(() => {
    expect(container.querySelector('[aria-label="Renderer switch"]')?.textContent)
      .toContain('Showing the Design system spike')
  })

  const shell = container.querySelector('.maximal-workspace-shell')
  expect(shell?.hasAttribute('data-fill')).toBe(true)
  for (const region of ['Project sidebar', 'Canvas sidebar', 'Workspace navigation']) {
    expect(container.querySelector(`[aria-label="${region}"]`), region).not.toBeNull()
  }
  expect(container.querySelector('.maximal-canvas-toolbar')).not.toBeNull()
})

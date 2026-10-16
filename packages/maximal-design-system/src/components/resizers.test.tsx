// @vitest-environment jsdom
import { act, createRef, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EdgeResizer } from './edge-resizer'
import { SidebarSectionSplit } from './sidebar-sections'

let host: HTMLDivElement | undefined
let root: Root | undefined

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = undefined
  host = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function mount(element: ReactNode) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root?.render(element))
}

describe('resizer accessibility values', () => {
  it('reports the measured edge size', () => {
    const resizeTarget = document.createElement('div')
    resizeTarget.getBoundingClientRect = () => ({
      bottom: 200,
      height: 200,
      left: 0,
      right: 320,
      top: 0,
      width: 320,
      x: 0,
      y: 0,
      toJSON: () => undefined,
    })
    const resizeTargetRef = createRef<HTMLElement>()
    resizeTargetRef.current = resizeTarget
    const disconnect = vi.fn()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        disconnect = disconnect
        observe() {
          return undefined
        }
      },
    )

    mount(
      <EdgeResizer
        edge="right"
        onResize={() => undefined}
        resizeTargetRef={resizeTargetRef}
      />,
    )

    expect(
      host?.querySelector('[role="separator"]')?.getAttribute('aria-valuenow'),
    ).toBe('320')
    act(() => root?.unmount())
    root = undefined
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it('reports the measured sidebar section size', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 160,
      height: 160,
      left: 0,
      right: 240,
      top: 0,
      width: 240,
      x: 0,
      y: 0,
      toJSON: () => undefined,
    })

    mount(
      <SidebarSectionSplit
        primary={<div>Primary</div>}
        secondary={<div>Secondary</div>}
      />,
    )

    expect(
      host?.querySelector('[role="separator"]')?.getAttribute('aria-valuenow'),
    ).toBe('160')
  })
})

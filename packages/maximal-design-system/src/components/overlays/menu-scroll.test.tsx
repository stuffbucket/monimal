// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MenuScrollViewport } from './menu-scroll'

const reactTestEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean
}
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let host: HTMLDivElement | undefined

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = undefined
  host = undefined
  vi.restoreAllMocks()
})

/* jsdom has no layout, so the viewport's scroll geometry is supplied. */
function geometry(scrollHeight: number, clientHeight: number) {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(scrollHeight)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(clientHeight)
}

function render() {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => {
    root?.render(
      <div className="maximal-menu" data-testid="scroller">
        <MenuScrollViewport>
          <div role="menuitem">Option</div>
        </MenuScrollViewport>
      </div>,
    )
  })
}

function arrows(): string[] {
  return [...document.querySelectorAll<HTMLElement>('.maximal-menu__scroll-arrow')]
    .map((arrow) => arrow.dataset['direction'] ?? '')
}

function viewport(): HTMLElement {
  const element = document.querySelector<HTMLElement>('[data-testid="scroller"]')
  if (element === null) throw new Error('Missing menu scroller')
  return element
}

describe('MenuScrollViewport', () => {
  it('shows no overflow rows when the items fit', () => {
    geometry(100, 100)
    render()

    expect(arrows()).toEqual([])
  })

  it('shows only the rows toward hidden items', () => {
    geometry(400, 100)
    render()
    expect(arrows()).toEqual(['down'])

    act(() => {
      viewport().scrollTop = 150
      viewport().dispatchEvent(new Event('scroll'))
    })
    expect(arrows()).toEqual(['up', 'down'])

    act(() => {
      viewport().scrollTop = 300
      viewport().dispatchEvent(new Event('scroll'))
    })
    expect(arrows()).toEqual(['up'])
  })

  it('keeps overflow rows out of the accessibility tree and the tab order', () => {
    geometry(400, 100)
    render()

    const arrow = document.querySelector<HTMLElement>('.maximal-menu__scroll-arrow')
    expect(arrow?.getAttribute('aria-hidden')).toBe('true')
    expect(arrow?.tabIndex).toBe(-1)
    expect(arrow?.tagName).toBe('DIV')
  })

  it('scrolls while the pointer rests on a row and stops when it leaves', () => {
    geometry(400, 100)
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback)
      return frames.length
    })
    const cancel = vi.spyOn(window, 'cancelAnimationFrame')
    render()
    const down = document.querySelector<HTMLElement>('[data-direction="down"]')
    if (down === null) throw new Error('Missing down row')

    act(() => {
      down.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
    })
    for (let index = 0; index < 3; index += 1) frames.shift()?.(0)
    expect(viewport().scrollTop).toBeGreaterThan(0)

    act(() => {
      down.dispatchEvent(new PointerEvent('pointerout', { bubbles: true }))
    })
    expect(cancel).toHaveBeenCalled()
  })
})

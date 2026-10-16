// @vitest-environment jsdom
import { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { scrollThumbGeometry } from './scroll-thumb'
import { Scrollbar, type ScrollbarProps } from './scrollbar'

const reactTestEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean
}
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true

describe('scrollThumbGeometry', () => {
  const base = { viewport: 100, track: 100, minimum: 24, maximum: 40 }

  it('hides the thumb when nothing overflows', () => {
    expect(scrollThumbGeometry({ ...base, content: 100, position: 0 }))
      .toEqual({ visible: false, length: 0, offset: 0 })
  })

  it('clamps a long content thumb to the minimum length', () => {
    expect(scrollThumbGeometry({ ...base, content: 10_000, position: 0 }).length).toBe(24)
  })

  it('clamps a short content thumb to the maximum length', () => {
    expect(scrollThumbGeometry({ ...base, content: 110, position: 0 }).length).toBe(40)
  })

  it('keeps proportional lengths between the limits', () => {
    expect(scrollThumbGeometry({ ...base, content: 300, position: 0 }).length).toBeCloseTo(33.33, 1)
  })

  it('never exceeds a track shorter than the minimum', () => {
    expect(scrollThumbGeometry({ ...base, track: 16, content: 10_000, position: 0 }).length).toBe(16)
  })

  it('maps the scroll range onto the travel the clamped thumb leaves', () => {
    const start = scrollThumbGeometry({ ...base, content: 10_000, position: 0 })
    const end = scrollThumbGeometry({ ...base, content: 10_000, position: 9_900 })
    const beyond = scrollThumbGeometry({ ...base, content: 10_000, position: 20_000 })
    expect(start.offset).toBe(0)
    expect(end.offset).toBe(76)
    expect(beyond.offset).toBe(76)
  })
})

let root: Root | undefined
let host: HTMLDivElement | undefined

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = undefined
  host = undefined
  vi.restoreAllMocks()
})

function Harness(props: Omit<ScrollbarProps, 'scroller'>) {
  const scroller = useRef<HTMLDivElement>(null)
  return (
    <div>
      <div data-testid="scroller" ref={scroller}>
        <div>content</div>
      </div>
      <Scrollbar {...props} scroller={scroller} />
    </div>
  )
}

function render(props: Omit<ScrollbarProps, 'scroller'> = {}) {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root?.render(<Harness {...props} />))
}

function track(): HTMLElement {
  const element = document.querySelector<HTMLElement>('.maximal-scrollbar')
  if (element === null) throw new Error('Missing scrollbar')
  return element
}

function thumb(): HTMLElement {
  const element = document.querySelector<HTMLElement>('.maximal-scrollbar__thumb')
  if (element === null) throw new Error('Missing thumb')
  return element
}

describe('Scrollbar', () => {
  it('reports overflow and sizes the thumb along its axis', () => {
    render()

    expect(track().dataset['orientation']).toBe('vertical')
    expect(track().hasAttribute('data-overflowing')).toBe(true)
    expect(thumb().style.height).toBe('10px')
    expect(thumb().style.transform).toBe('translateY(0px)')
  })

  it('stays out of the accessibility tree without a label', () => {
    render()

    expect(thumb().getAttribute('aria-hidden')).toBe('true')
    expect(thumb().hasAttribute('tabindex')).toBe(false)
  })

  it('is a keyboard-operable scrollbar when labelled', () => {
    render({ label: 'Scroll rows' })
    const scroller = document.querySelector<HTMLElement>('[data-testid="scroller"]')
    const scrollBy = vi.fn()
    if (scroller) scroller.scrollBy = scrollBy

    expect(thumb().getAttribute('role')).toBe('scrollbar')
    expect(thumb().getAttribute('aria-label')).toBe('Scroll rows')
    expect(thumb().getAttribute('aria-valuemax')).toBe('900')
    act(() => {
      thumb().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }))
    })
    expect(scrollBy).toHaveBeenCalledOnce()
  })

  it('is revealed while scrolling, hovered, or dragged, and the stylesheet owns the dwell', () => {
    render({ visibility: 'auto' })
    const scroller = document.querySelector<HTMLElement>('[data-testid="scroller"]')
    if (scroller === null) throw new Error('Missing scroller')
    const revealed = () => track().hasAttribute('data-revealed')

    expect(track().dataset['visibility']).toBe('auto')
    expect(revealed()).toBe(false)

    act(() => scroller.dispatchEvent(new Event('scroll')))
    expect(revealed()).toBe(true)
    vi.useFakeTimers()
    act(() => scroller.dispatchEvent(new Event('scrollend')))
    act(() => vi.runAllTimers())
    vi.useRealTimers()
    expect(revealed()).toBe(false)

    act(() => scroller.dispatchEvent(new PointerEvent('pointerenter')))
    expect(revealed()).toBe(true)
    act(() => scroller.dispatchEvent(new PointerEvent('pointerleave')))
    expect(revealed()).toBe(false)
  })

  it('marks the thumb hovered and dragged for its grown state', () => {
    render()
    thumb().setPointerCapture = vi.fn()
    thumb().hasPointerCapture = vi.fn(() => true)
    thumb().releasePointerCapture = vi.fn()

    act(() => thumb().dispatchEvent(new PointerEvent('pointerover', { bubbles: true })))
    expect(thumb().hasAttribute('data-hovered')).toBe(true)
    expect(track().hasAttribute('data-revealed')).toBe(true)
    act(() => thumb().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(thumb().hasAttribute('data-dragging')).toBe(true)
    act(() => thumb().dispatchEvent(new PointerEvent('pointerup', { bubbles: true })))
    expect(thumb().hasAttribute('data-dragging')).toBe(false)
    act(() => thumb().dispatchEvent(new PointerEvent('pointerout', { bubbles: true })))
    expect(thumb().hasAttribute('data-hovered')).toBe(false)
  })
})

import { ChevronDown, ChevronUp } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
  type RefCallback,
  type RefObject,
} from 'react'

import { Scrollbar } from '../scrollbar'

/* Pixels per animation frame while the pointer rests on an overflow row. */
const SCROLL_STEP = 4

type ScrollDirection = 'up' | 'down'

function MenuScrollArrow({
  direction,
  scroller,
}: {
  direction: ScrollDirection
  scroller: RefObject<HTMLElement | null>
}) {
  const frame = useRef(0)
  const stop = useCallback(() => cancelAnimationFrame(frame.current), [])
  const start = () => {
    stop()
    const step = () => {
      const element = scroller.current
      if (element === null) return
      element.scrollTop += direction === 'up' ? -SCROLL_STEP : SCROLL_STEP
      frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
  }

  useEffect(() => stop, [stop])

  return (
    <div
      aria-hidden
      className="maximal-menu__scroll-arrow"
      data-direction={direction}
      onPointerEnter={start}
      onPointerLeave={stop}
    >
      {direction === 'up' ? <ChevronUp /> : <ChevronDown />}
    </div>
  )
}

/**
 * Overflow rows for a scrolling menu popup. The popup stays the scroll
 * container, so it keeps its focusable scroll region; the rows stick to its
 * edges, scroll on pointer hover, and take no focus.
 */
export function MenuScrollViewport({ children }: { children: ReactNode }) {
  const content = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLElement | null>(null)
  const [overflow, setOverflow] = useState({ up: false, down: false })

  const measure = useCallback(() => {
    const element = scroller.current
    if (element === null) return
    const up = element.scrollTop > 0
    const down = element.scrollTop + element.clientHeight < element.scrollHeight - 1
    setOverflow((current) =>
      current.up === up && current.down === down ? current : { up, down })
  }, [])

  useLayoutEffect(() => {
    const element = content.current?.parentElement ?? null
    scroller.current = element
    if (element === null) return undefined
    measure()
    element.addEventListener('scroll', measure, { passive: true })
    const observer = typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(measure)
    observer?.observe(element)
    if (content.current) observer?.observe(content.current)
    return () => {
      element.removeEventListener('scroll', measure)
      observer?.disconnect()
    }
  }, [measure])

  return (
    <>
      {overflow.up ? <MenuScrollArrow direction="up" scroller={scroller} /> : null}
      <div className="maximal-menu__content" ref={content}>
        {children}
      </div>
      {overflow.down ? <MenuScrollArrow direction="down" scroller={scroller} /> : null}
    </>
  )
}

/** Joins a menu's own popup ref with a consumer-supplied one. */
export function mergeRefs<Value>(...refs: Array<Ref<Value> | undefined>): RefCallback<Value> {
  return (value) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(value)
      else if (ref) ref.current = value
    }
  }
}

/**
 * The scrollbar for a menu popup, drawn beside it in the positioner, which
 * shares the popup's box without scrolling.
 */
export function MenuPopupScrollbar({ popup }: { popup: RefObject<HTMLElement | null> }) {
  return <Scrollbar scroller={popup} />
}

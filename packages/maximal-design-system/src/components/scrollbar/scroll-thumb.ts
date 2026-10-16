import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

export type ScrollbarOrientation = 'vertical' | 'horizontal'

/* Where `scrollend` is unavailable, scrolling counts as ended after this quiet period. */
const SCROLL_IDLE_FALLBACK = 150

export interface ScrollThumbGeometry {
  visible: boolean
  length: number
  offset: number
}

/**
 * The thumb's length is proportional to the visible fraction of the content,
 * clamped to the thumb's minimum and maximum, and its offset maps the scroll
 * position onto the track space the clamped thumb leaves.
 */
export function scrollThumbGeometry({
  viewport,
  content,
  position,
  track,
  minimum,
  maximum,
}: {
  viewport: number
  content: number
  position: number
  track: number
  minimum: number
  maximum: number
}): ScrollThumbGeometry {
  const range = content - viewport
  if (range <= 0 || track <= 0) return { visible: false, length: 0, offset: 0 }
  const proportional = track * (viewport / content)
  const length = Math.min(track, Math.max(minimum, Math.min(maximum, proportional)))
  const progress = Math.min(1, Math.max(0, position / range))
  return { visible: true, length, offset: progress * (track - length) }
}

/* The longest duration in a computed `transition-duration` list, in seconds. */
function seconds(value: string): number {
  return Math.max(0, ...value.split(',').map((part) => {
    const parsed = Number.parseFloat(part)
    if (!Number.isFinite(parsed)) return 0
    return part.trim().endsWith('ms') ? parsed / 1000 : parsed
  }))
}

function pixels(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export interface ScrollThumbState {
  visible: boolean
  /** The scroller or the scrollbar is under the pointer. */
  hovered: boolean
  scrolling: boolean
  dragging: boolean
  /** The thumb itself is under the pointer. */
  thumbHovered: boolean
  position: number
  range: number
}

/**
 * Keeps a thumb element sized and placed for a native scroll container.
 * Length limits come from the thumb's own min and max size in CSS.
 */
export function useScrollThumb({
  scroller,
  track,
  thumb,
  orientation,
}: {
  scroller: RefObject<HTMLElement | null>
  track: RefObject<HTMLElement | null>
  thumb: RefObject<HTMLElement | null>
  orientation: ScrollbarOrientation
}) {
  const vertical = orientation === 'vertical'
  const [state, setState] = useState<ScrollThumbState>({
    visible: false,
    hovered: false,
    scrolling: false,
    dragging: false,
    thumbHovered: false,
    position: 0,
    range: 0,
  })
  const dragging = useRef<{ coordinate: number; position: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const measure = useCallback(() => {
    const scrollElement = scroller.current
    const trackElement = track.current
    const thumbElement = thumb.current
    if (!scrollElement || !trackElement || !thumbElement) return
    const styles = getComputedStyle(thumbElement)
    const trackSize = vertical ? trackElement.clientHeight : trackElement.clientWidth
    const position = vertical ? scrollElement.scrollTop : scrollElement.scrollLeft
    const geometry = scrollThumbGeometry({
      viewport: vertical ? scrollElement.clientHeight : scrollElement.clientWidth,
      content: vertical ? scrollElement.scrollHeight : scrollElement.scrollWidth,
      position,
      track: trackSize,
      minimum: pixels(vertical ? styles.minHeight : styles.minWidth, 0),
      maximum: pixels(vertical ? styles.maxHeight : styles.maxWidth, trackSize),
    })
    thumbElement.style.setProperty(vertical ? 'height' : 'width', `${String(geometry.length)}px`)
    thumbElement.style.setProperty(
      'transform',
      vertical
        ? `translateY(${String(geometry.offset)}px)`
        : `translateX(${String(geometry.offset)}px)`,
    )
    const range = vertical
      ? scrollElement.scrollHeight - scrollElement.clientHeight
      : scrollElement.scrollWidth - scrollElement.clientWidth
    setState((current) =>
      current.visible === geometry.visible
      && current.position === position
      && current.range === range
        ? current
        : { ...current, visible: geometry.visible, position, range })
  }, [scroller, thumb, track, vertical])

  const update = useCallback((patch: Partial<ScrollThumbState>) => {
    setState((current) =>
      Object.entries(patch).every(([key, value]) => current[key as keyof ScrollThumbState] === value)
        ? current
        : { ...current, ...patch })
  }, [])

  /* Scrolling ends once the reveal transition has finished, so even a brief scroll shows the bar fully before it dwells. */
  const endScroll = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    const trackElement = track.current
    const reveal = trackElement ? getComputedStyle(trackElement).transitionDuration : '0s'
    timer.current = setTimeout(() => {
      timer.current = null
      update({ scrolling: false })
    }, seconds(reveal) * 1000)
  }, [track, update])

  /* Marks scroll activity; the stylesheet's dwell keeps the bar shown after it ends. */
  const reveal = useCallback(() => {
    update({ scrolling: true })
    if (timer.current) clearTimeout(timer.current)
    if (!('onscrollend' in window)) timer.current = setTimeout(endScroll, SCROLL_IDLE_FALLBACK)
  }, [endScroll, update])

  useEffect(() => {
    const scrollElement = scroller.current
    if (!scrollElement) return undefined
    const handleScroll = () => {
      measure()
      reveal()
    }
    const handleEnter = () => update({ hovered: true })
    const handleLeave = () => update({ hovered: false })
    scrollElement.addEventListener('scroll', handleScroll, { passive: true })
    scrollElement.addEventListener('scrollend', endScroll)
    scrollElement.addEventListener('pointerenter', handleEnter)
    scrollElement.addEventListener('pointerleave', handleLeave)
    const observer = typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(measure)
    observer?.observe(scrollElement)
    for (const child of Array.from(scrollElement.children)) observer?.observe(child)
    measure()
    return () => {
      scrollElement.removeEventListener('scroll', handleScroll)
      scrollElement.removeEventListener('scrollend', endScroll)
      scrollElement.removeEventListener('pointerenter', handleEnter)
      scrollElement.removeEventListener('pointerleave', handleLeave)
      observer?.disconnect()
    }
  }, [endScroll, measure, reveal, scroller, update])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    const scrollElement = scroller.current
    if (!scrollElement) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragging.current = {
      coordinate: vertical ? event.clientY : event.clientX,
      position: vertical ? scrollElement.scrollTop : scrollElement.scrollLeft,
    }
    update({ dragging: true })
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const scrollElement = scroller.current
    const trackElement = track.current
    const thumbElement = thumb.current
    const drag = dragging.current
    if (!scrollElement || !trackElement || !thumbElement || !drag) return
    const trackSize = vertical ? trackElement.clientHeight : trackElement.clientWidth
    const thumbSize = vertical ? thumbElement.offsetHeight : thumbElement.offsetWidth
    const travel = trackSize - thumbSize
    if (travel <= 0) return
    const range = vertical
      ? scrollElement.scrollHeight - scrollElement.clientHeight
      : scrollElement.scrollWidth - scrollElement.clientWidth
    const delta = ((vertical ? event.clientY : event.clientX) - drag.coordinate) / travel * range
    if (vertical) scrollElement.scrollTop = drag.position + delta
    else scrollElement.scrollLeft = drag.position + delta
  }

  const onPointerEnd = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragging.current = null
    update({ dragging: false })
  }

  return {
    ...state,
    reveal,
    measure,
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onPointerEnter: () => update({ thumbHovered: true }),
      onPointerLeave: () => update({ thumbHovered: false }),
    },
  }
}

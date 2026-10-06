import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

export type ResizerEdge = 'top' | 'right' | 'bottom' | 'left'

interface ScrollThumb {
  offset: number
  size: number
  visible: boolean
}

export interface EdgeResizerProps {
  edge: ResizerEdge
  resizeTargetRef: RefObject<HTMLElement | null>
  onResize: (size: number) => void
  scrollTargetRef?: RefObject<HTMLElement | null>
  overlap?: boolean
  label?: string
  keyboardStep?: number
}

export function EdgeResizer({
  edge,
  resizeTargetRef,
  onResize,
  scrollTargetRef,
  overlap = false,
  label = `Resize ${edge} edge`,
  keyboardStep = 8,
}: EdgeResizerProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const resizerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ coordinate: number; size: number } | null>(null)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [scrollActive, setScrollActive] = useState(false)
  const [currentSize, setCurrentSize] = useState<number>()
  const [thumb, setThumb] = useState<ScrollThumb>({
    offset: 0,
    size: 0,
    visible: false,
  })

  const updateThumb = useCallback(() => {
    const scrollTarget = scrollTargetRef?.current
    const track = trackRef.current
    if (!scrollTarget || !track) {
      setThumb({ offset: 0, size: 0, visible: false })
      return
    }

    const verticalTrack = edge === 'left' || edge === 'right'
    const viewportSize = verticalTrack
      ? scrollTarget.clientHeight
      : scrollTarget.clientWidth
    const contentSize = verticalTrack
      ? scrollTarget.scrollHeight
      : scrollTarget.scrollWidth
    const scrollPosition = verticalTrack
      ? scrollTarget.scrollTop
      : scrollTarget.scrollLeft
    const scrollRange = contentSize - viewportSize
    const trackSize = verticalTrack ? track.clientHeight : track.clientWidth
    if (scrollRange <= 0 || trackSize <= 0) {
      setThumb({ offset: 0, size: trackSize, visible: false })
      return
    }

    const size = trackSize * (viewportSize / contentSize)
    const offset = (scrollPosition / scrollRange) * (trackSize - size)
    setThumb({ offset, size, visible: true })
  }, [edge, scrollTargetRef])

  const revealScrollThumb = useCallback(() => {
    setScrollActive(true)
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    fadeTimerRef.current = setTimeout(() => {
      setScrollActive(false)
      fadeTimerRef.current = null
    }, 700)
  }, [])

  useEffect(() => {
    const scrollTarget = scrollTargetRef?.current
    if (!scrollTarget) return

    const handleScroll = () => {
      updateThumb()
      revealScrollThumb()
    }
    const observer = new ResizeObserver(updateThumb)

    scrollTarget.addEventListener('scroll', handleScroll, { passive: true })
    observer.observe(scrollTarget)
    if (scrollTarget.firstElementChild) observer.observe(scrollTarget.firstElementChild)
    updateThumb()

    return () => {
      scrollTarget.removeEventListener('scroll', handleScroll)
      observer.disconnect()
    }
  }, [revealScrollThumb, scrollTargetRef, updateThumb])

  useEffect(
    () => () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    },
    [],
  )

  useEffect(() => {
    const resizer = resizerRef.current
    if (!resizer) return

    const handleWheel = (event: WheelEvent) => {
      const scrollTarget = scrollTargetRef?.current
      if (!scrollTarget) return

      event.preventDefault()
      const verticalTrack = edge === 'left' || edge === 'right'
      scrollTarget.scrollBy(
        verticalTrack
          ? { top: event.deltaY }
          : { left: event.deltaX || event.deltaY },
      )
      revealScrollThumb()
    }

    resizer.addEventListener('wheel', handleWheel, { passive: false })
    return () => resizer.removeEventListener('wheel', handleWheel)
  }, [edge, revealScrollThumb, scrollTargetRef])

  const horizontal = edge === 'left' || edge === 'right'
  const resize = (size: number) => {
    onResize(size)
    const bounds = resizeTargetRef.current?.getBoundingClientRect()
    setCurrentSize(bounds ? (horizontal ? bounds.width : bounds.height) : size)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = resizeTargetRef.current
    if (!target) return

    event.currentTarget.setPointerCapture(event.pointerId)
    const bounds = target.getBoundingClientRect()
    dragRef.current = {
      coordinate: horizontal ? event.clientX : event.clientY,
      size: horizontal ? bounds.width : bounds.height,
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId)) return

    const coordinate = horizontal ? event.clientX : event.clientY
    const direction = edge === 'right' || edge === 'bottom' ? 1 : -1
    resize(drag.size + (coordinate - drag.coordinate) * direction)
  }

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragRef.current = null
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = resizeTargetRef.current
    if (!target) return

    const bounds = target.getBoundingClientRect()
    const size = horizontal ? bounds.width : bounds.height
    const decreaseKey = horizontal ? 'ArrowLeft' : 'ArrowUp'
    const increaseKey = horizontal ? 'ArrowRight' : 'ArrowDown'
    if (event.key !== decreaseKey && event.key !== increaseKey) return

    event.preventDefault()
    const movement = event.key === increaseKey ? keyboardStep : -keyboardStep
    const direction = edge === 'right' || edge === 'bottom' ? 1 : -1
    resize(size + movement * direction)
  }

  return (
    <div
      aria-label={label}
      aria-orientation={horizontal ? 'vertical' : 'horizontal'}
      aria-valuenow={currentSize}
      className="maximal-edge-resizer"
      data-edge={edge}
      data-overlap={overlap ? '' : undefined}
      data-scroll-active={scrollActive ? '' : undefined}
      onPointerCancel={handlePointerEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onKeyDown={handleKeyDown}
      ref={resizerRef}
      role="separator"
      tabIndex={0}
    >
      <div className="maximal-edge-resizer__track" ref={trackRef}>
        {thumb.visible ? (
          <span
            className="maximal-edge-resizer__thumb"
            style={
              horizontal
                ? {
                    blockSize: `${thumb.size}px`,
                    transform: `translateY(${thumb.offset}px)`,
                  }
                : {
                    inlineSize: `${thumb.size}px`,
                    transform: `translateX(${thumb.offset}px)`,
                  }
            }
          />
        ) : null}
      </div>
    </div>
  )
}

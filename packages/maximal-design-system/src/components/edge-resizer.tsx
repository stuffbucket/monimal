import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react'

import { useScrollThumb } from './scrollbar/scroll-thumb'

export type ResizerEdge = 'top' | 'right' | 'bottom' | 'left'

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
  const thumbRef = useRef<HTMLSpanElement>(null)
  const [currentSize, setCurrentSize] = useState<number>()
  const horizontal = edge === 'left' || edge === 'right'
  const fallbackScroller = useRef<HTMLElement | null>(null)
  const scrollThumb = useScrollThumb({
    scroller: scrollTargetRef ?? fallbackScroller,
    track: trackRef,
    thumb: thumbRef,
    orientation: horizontal ? 'vertical' : 'horizontal',
  })
  const revealScrollThumb = scrollThumb.reveal

  useEffect(() => {
    const resizeTarget = resizeTargetRef.current
    if (!resizeTarget) return

    const updateCurrentSize = () => {
      const bounds = resizeTarget.getBoundingClientRect()
      setCurrentSize(horizontal ? bounds.width : bounds.height)
    }
    const observer = new ResizeObserver(updateCurrentSize)
    observer.observe(resizeTarget)
    updateCurrentSize()
    return () => observer.disconnect()
  }, [horizontal, resizeTargetRef])

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
      data-scroll-active={scrollThumb.scrolling || scrollThumb.hovered ? '' : undefined}
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
        <span
          aria-hidden
          className="maximal-edge-resizer__thumb maximal-scrollbar__thumb"
          data-overflowing={scrollThumb.visible ? '' : undefined}
          ref={thumbRef}
        />
      </div>
    </div>
  )
}

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  useRef,
} from 'react'

import { type ScrollbarOrientation, useScrollThumb } from './scroll-thumb'

export type { ScrollbarOrientation } from './scroll-thumb'

/**
 * `auto` reveals the scrollbar while its scroller is hovered, scrolled, or
 * dragged, then dwells before fading; `always` keeps it shown.
 */
export type ScrollbarVisibility = 'auto' | 'always'

export interface ScrollbarProps {
  /** The native scroll container the scrollbar reports and controls. */
  scroller: RefObject<HTMLElement | null>
  orientation?: ScrollbarOrientation
  visibility?: ScrollbarVisibility
  /**
   * Names a keyboard-operable scrollbar. Omit it where the scroller is
   * already keyboard-scrollable, such as a menu, to keep the thumb out of the
   * tab order and the accessibility tree.
   */
  label?: string | undefined
  className?: string | undefined
}

/**
 * The design system's scrollbar for either axis: a transparent track along
 * the scroller's end edge and a thumb clamped between the thumb's minimum and
 * maximum length. Render it inside a positioned element that shares the
 * scroller's box and does not itself scroll. To hide scrollbars, omit it.
 */
export function Scrollbar({
  scroller,
  orientation = 'vertical',
  visibility = 'auto',
  label,
  className,
}: ScrollbarProps) {
  const track = useRef<HTMLDivElement>(null)
  const thumb = useRef<HTMLSpanElement>(null)
  const state = useScrollThumb({ scroller, track, thumb, orientation })
  const vertical = orientation === 'vertical'

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLSpanElement>) => {
    const scrollElement = scroller.current
    const back = vertical ? 'ArrowUp' : 'ArrowLeft'
    const forward = vertical ? 'ArrowDown' : 'ArrowRight'
    if (!scrollElement || (event.key !== back && event.key !== forward)) return
    event.preventDefault()
    const step = Number.parseFloat(getComputedStyle(scrollElement).getPropertyValue('--spacer-3'))
    const amount = event.key === forward ? step : -step
    scrollElement.scrollBy(vertical ? { top: amount } : { left: amount })
    state.reveal()
  }

  const accessible = label === undefined
    ? { 'aria-hidden': true }
    : {
        'aria-label': label,
        'aria-orientation': orientation,
        'aria-valuemax': Math.max(0, Math.round(state.range)),
        'aria-valuemin': 0,
        'aria-valuenow': Math.round(state.position),
        onKeyDown: handleKeyDown,
        role: 'scrollbar',
        tabIndex: 0,
      }

  return (
    <div
      className={['maximal-scrollbar', className].filter(Boolean).join(' ')}
      data-orientation={orientation}
      data-overflowing={state.visible ? '' : undefined}
      data-revealed={
        state.hovered || state.scrolling || state.dragging || state.thumbHovered ? '' : undefined
      }
      data-visibility={visibility}
      ref={track}
    >
      <span
        {...accessible}
        {...state.dragHandlers}
        className="maximal-scrollbar__thumb"
        data-dragging={state.dragging ? '' : undefined}
        data-hovered={state.thumbHovered ? '' : undefined}
        ref={thumb}
      />
    </div>
  )
}

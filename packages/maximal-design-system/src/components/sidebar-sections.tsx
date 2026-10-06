import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

export interface SidebarSectionProps {
  title?: string
  leading?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  scroll?: 'none' | 'horizontal'
  label?: string
}

export function SidebarSection({
  title,
  leading,
  actions,
  children,
  className,
  scroll = 'none',
  label = 'Sidebar section',
}: SidebarSectionProps) {
  const titleId = useId()
  const classes = ['maximal-sidebar-section', className].filter(Boolean).join(' ')

  return (
    <section
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : label}
      className={classes}
    >
      {title || leading || actions ? (
        <header className="maximal-sidebar-section__header">
          {leading ? (
            <span className="maximal-sidebar-section__leading">{leading}</span>
          ) : null}
          {title ? <h3 id={titleId}>{title}</h3> : null}
          {actions ? (
            <div className="maximal-sidebar-section__actions">{actions}</div>
          ) : null}
        </header>
      ) : null}
      {scroll === 'horizontal' ? (
        <HorizontalScrollArea>{children}</HorizontalScrollArea>
      ) : (
        <div className="maximal-sidebar-section__content">{children}</div>
      )}
    </section>
  )
}

export interface SidebarSectionSplitProps {
  primary: ReactNode
  secondary: ReactNode
  primarySize?: number
  onPrimarySizeChange?: (size: number) => void
  label?: string
}

export function SidebarSectionSplit({
  primary,
  secondary,
  primarySize,
  onPrimarySizeChange,
  label = 'Resize sidebar sections',
}: SidebarSectionSplitProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const primaryRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ coordinate: number; size: number } | null>(null)
  const maximumPrimaryRef = useRef(0)
  const [currentSize, setCurrentSize] = useState<number>()
  const [bounds, setBounds] = useState({ minimum: 0, maximum: 0 })

  useLayoutEffect(() => {
    if (primarySize === undefined) return
    rootRef.current?.style.setProperty(
      '--maximal-sidebar-primary-size',
      `${primarySize}px`,
    )
  }, [primarySize])

  const tokenValue = (name: string) => {
    const root = rootRef.current
    if (!root) return 0
    return Number.parseFloat(getComputedStyle(root).getPropertyValue(name))
  }

  const resize = (requestedSize: number) => {
    const root = rootRef.current
    const primaryElement = primaryRef.current
    if (!root || !primaryElement) return

    const sectionHeader = primaryElement.querySelector<HTMLElement>(
      '.maximal-sidebar-section__header',
    )
    const sectionContent = primaryElement.querySelector<HTMLElement>(
      '.maximal-sidebar-section__content',
    )
    const secondaryElement = root.querySelector<HTMLElement>(
      '.maximal-sidebar-section-split__secondary',
    )
    const primaryRow = sectionContent?.querySelector<HTMLElement>(
      '.maximal-project-page-row',
    )
    const secondaryHeader = secondaryElement?.querySelector<HTMLElement>(
      '.maximal-sidebar-section__header',
    )
    const secondaryRow = secondaryElement?.querySelector<HTMLElement>('button')
    const fallbackHeadingHeight = tokenValue('--height-row-standard')
    const fallbackRowHeight = tokenValue('--height-control-compact')
    const minimumPrimary =
      (sectionHeader?.offsetHeight ?? fallbackHeadingHeight) +
      (primaryRow?.offsetHeight ?? fallbackRowHeight)
    const minimumSecondary =
      (secondaryHeader?.offsetHeight ?? fallbackHeadingHeight) +
      (secondaryRow?.offsetHeight ?? fallbackRowHeight)
    const measuredContentHeight =
      (sectionHeader?.offsetHeight ?? 0) +
      (sectionContent?.scrollHeight ?? primaryElement.scrollHeight)
    maximumPrimaryRef.current = Math.max(
      maximumPrimaryRef.current,
      measuredContentHeight,
      primaryElement.getBoundingClientRect().height,
    )
    const contentMaximum = maximumPrimaryRef.current
    const availableMaximum = root.clientHeight - minimumSecondary
    const maximumPrimary = Math.max(
      minimumPrimary,
      Math.min(contentMaximum, availableMaximum),
    )
    const nextSize = Math.min(maximumPrimary, Math.max(minimumPrimary, requestedSize))

    root.style.setProperty('--maximal-sidebar-primary-size', `${nextSize}px`)
    setBounds({ minimum: minimumPrimary, maximum: maximumPrimary })
    setCurrentSize(nextSize)
    onPrimarySizeChange?.(nextSize)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const primaryElement = primaryRef.current
    if (!primaryElement) return

    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      coordinate: event.clientY,
      size: primaryElement.getBoundingClientRect().height,
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    resize(drag.size + event.clientY - drag.coordinate)
  }

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragRef.current = null
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return

    event.preventDefault()
    const currentHeight = primaryRef.current?.getBoundingClientRect().height ?? 0
    const step = tokenValue('--spacer-2')
    resize(currentHeight + (event.key === 'ArrowDown' ? step : -step))
  }

  return (
    <div className="maximal-sidebar-section-split" ref={rootRef}>
      <div className="maximal-sidebar-section-split__primary" ref={primaryRef}>
        {primary}
      </div>
      <div
        aria-label={label}
        aria-orientation="horizontal"
        aria-valuemax={bounds.maximum || undefined}
        aria-valuemin={bounds.minimum || undefined}
        aria-valuenow={currentSize}
        className="maximal-sidebar-section-split__handle"
        onKeyDown={handleKeyDown}
        onPointerCancel={handlePointerEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        role="separator"
        tabIndex={0}
      >
        <span />
      </div>
      <div className="maximal-sidebar-section-split__secondary">{secondary}</div>
    </div>
  )
}

function HorizontalScrollArea({ children }: { children: ReactNode }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ coordinate: number; scrollLeft: number } | null>(null)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [active, setActive] = useState(false)
  const [thumb, setThumb] = useState({ offset: 0, size: 0, visible: false })

  const updateThumb = useCallback(() => {
    const viewport = viewportRef.current
    const track = trackRef.current
    if (!viewport || !track) return

    const scrollRange = viewport.scrollWidth - viewport.clientWidth
    if (scrollRange <= 0 || track.clientWidth <= 0) {
      setThumb({ offset: 0, size: track.clientWidth, visible: false })
      return
    }

    const size = track.clientWidth * (viewport.clientWidth / viewport.scrollWidth)
    const offset =
      (viewport.scrollLeft / scrollRange) * (track.clientWidth - size)
    setThumb({ offset, size, visible: true })
  }, [])

  const reveal = useCallback(() => {
    setActive(true)
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    fadeTimerRef.current = setTimeout(() => {
      setActive(false)
      fadeTimerRef.current = null
    }, 700)
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const handleScroll = () => {
      updateThumb()
      reveal()
    }
    const observer = new ResizeObserver(updateThumb)
    viewport.addEventListener('scroll', handleScroll, { passive: true })
    observer.observe(viewport)
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild)
    updateThumb()

    return () => {
      viewport.removeEventListener('scroll', handleScroll)
      observer.disconnect()
    }
  }, [reveal, updateThumb])

  useEffect(
    () => () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    },
    [],
  )

  const handlePointerDown = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const viewport = viewportRef.current
    if (!viewport) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      coordinate: event.clientX,
      scrollLeft: viewport.scrollLeft,
    }
    reveal()
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const viewport = viewportRef.current
    const track = trackRef.current
    const drag = dragRef.current
    if (
      !viewport ||
      !track ||
      !drag ||
      !event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      return
    }

    const scrollRange = viewport.scrollWidth - viewport.clientWidth
    const thumbRange = track.clientWidth - thumb.size
    if (thumbRange <= 0) return
    viewport.scrollLeft =
      drag.scrollLeft +
      ((event.clientX - drag.coordinate) / thumbRange) * scrollRange
  }

  const handlePointerEnd = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragRef.current = null
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLSpanElement>) => {
    const viewport = viewportRef.current
    if (
      !viewport ||
      (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
    ) {
      return
    }

    event.preventDefault()
    const step = Number.parseFloat(
      getComputedStyle(viewport).getPropertyValue('--spacer-2'),
    )
    viewport.scrollBy({
      left: event.key === 'ArrowRight' ? step : -step,
    })
    reveal()
  }

  return (
    <div className="maximal-horizontal-scroll-area">
      <div
        className="maximal-horizontal-scroll-area__viewport"
        ref={viewportRef}
      >
        <div className="maximal-horizontal-scroll-area__content">{children}</div>
      </div>
      <div
        className="maximal-horizontal-scroll-area__track"
        data-scroll-active={active ? '' : undefined}
        ref={trackRef}
      >
        {thumb.visible ? (
          <span
            aria-label="Scroll sidebar content horizontally"
            aria-orientation="horizontal"
            aria-valuemax={Math.max(
              0,
              (viewportRef.current?.scrollWidth ?? 0) -
                (viewportRef.current?.clientWidth ?? 0),
            )}
            aria-valuemin={0}
            aria-valuenow={viewportRef.current?.scrollLeft ?? 0}
            className="maximal-horizontal-scroll-area__thumb"
            onKeyDown={handleKeyDown}
            onPointerCancel={handlePointerEnd}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            role="scrollbar"
            style={{
              inlineSize: `${thumb.size}px`,
              transform: `translateX(${thumb.offset}px)`,
            }}
            tabIndex={0}
          />
        ) : null}
      </div>
    </div>
  )
}

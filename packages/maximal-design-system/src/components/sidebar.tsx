import {
  type ReactNode,
  useLayoutEffect,
  useRef,
} from 'react'

import { SidebarIcon } from '../icons'
import { IconButton } from '../primitives/button'
import { EdgeResizer } from './edge-resizer'

export type SidebarSide = 'left' | 'right'

export interface ToggleSidebarProps {
  side: SidebarSide
  open: boolean
  onPressedChange: (open: boolean) => void
  label?: string
  controls?: string
}

export function ToggleSidebar({
  side,
  open,
  onPressedChange,
  label = `${open ? 'Hide' : 'Show'} ${side} sidebar`,
  controls,
}: ToggleSidebarProps) {
  return (
    <IconButton
      aria-controls={controls}
      aria-keyshortcuts="Shift+Meta+/"
      aria-pressed={open}
      className="maximal-toggle-sidebar"
      label={label}
      onClick={() => onPressedChange(!open)}
    >
      <SidebarIcon />
    </IconButton>
  )
}

export interface SidebarProps {
  id: string
  side: SidebarSide
  title?: string
  label?: string
  headerContent?: ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  resizable?: boolean
  overlapResizer?: boolean
  showToggle?: boolean
  toggleLabel?: string
  collapsedContent?: ReactNode
  size?: number
  onSizeChange?: (size: number) => void
  scrollTop?: number
  onScrollTopChange?: (scrollTop: number) => void
  bodyScrollable?: boolean
}

export function Sidebar({
  id,
  side,
  title,
  label,
  headerContent,
  open,
  onOpenChange,
  children,
  resizable = false,
  overlapResizer = true,
  showToggle = side === 'left',
  toggleLabel,
  collapsedContent,
  size,
  onSizeChange,
  scrollTop,
  onScrollTopChange,
  bodyScrollable = true,
}: SidebarProps) {
  const sidebarLabel = label ?? title ?? `${side} panel`
  const positionRef = useRef<HTMLElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (size === undefined) return
    positionRef.current?.style.setProperty('--maximal-sidebar-size', `${size}px`)
  }, [size])

  useLayoutEffect(() => {
    if (scrollTop === undefined || !open) return
    const body = bodyRef.current
    if (body) body.scrollTop = scrollTop
  }, [open, scrollTop])

  const handleResize = (nextSize: number) => {
    const position = positionRef.current
    if (!position) return

    position.style.setProperty('--maximal-sidebar-size', `${nextSize}px`)
    onSizeChange?.(position.getBoundingClientRect().width)
  }

  return (
    <aside
      aria-label={`${sidebarLabel} sidebar`}
      className="maximal-sidebar"
      data-has-collapsed-content={collapsedContent ? '' : undefined}
      data-open={open ? '' : undefined}
      data-side={side}
      id={id}
      ref={positionRef}
    >
      <div className="maximal-sidebar__container" hidden={!open}>
        <header
          className="maximal-sidebar__header maximal-sidebar__header--bottom-border maximal-sidebar__header--small-bottom-padding"
          data-custom-content={headerContent ? '' : undefined}
          data-has-toggle={showToggle ? '' : undefined}
        >
          {headerContent ?? (title ? <h2>{title}</h2> : null)}
          {showToggle ? (
            <ToggleSidebar
              controls={id}
              label={toggleLabel}
              onPressedChange={onOpenChange}
              open={open}
              side={side}
            />
          ) : null}
        </header>
        <div
          className="maximal-sidebar__body"
          data-contained={bodyScrollable ? undefined : ''}
          onScroll={(event) => onScrollTopChange?.(event.currentTarget.scrollTop)}
          ref={bodyRef}
        >
          {children}
        </div>
      </div>
      {!open && collapsedContent ? (
        <div className="maximal-sidebar__collapsed-content">
          {collapsedContent}
        </div>
      ) : null}
      {open && resizable ? (
        <EdgeResizer
          edge={side === 'left' ? 'right' : 'left'}
          label={`Resize ${sidebarLabel} sidebar`}
          onResize={handleResize}
          overlap={overlapResizer}
          resizeTargetRef={positionRef}
          scrollTargetRef={bodyScrollable ? bodyRef : undefined}
        />
      ) : null}
    </aside>
  )
}

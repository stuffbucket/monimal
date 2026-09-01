import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { getTabPanelId, getTabTriggerId, ShellLayout, type Tab } from 'stuffbucket-electron/renderer'

/**
 * The application's one frame.
 *
 * Every surface used to mount a `ShellLayout` of its own, which had two
 * consequences. The frame's root is `position: fixed; inset: 0`, so a mounted
 * frame covered any sibling chrome — the view switcher among it, which is why a
 * signed-in user had no way to reach Settings. And Settings mounted no frame at
 * all, so it rendered without the title bar that carries the window's only drag
 * region.
 *
 * One frame, mounted here, fixes both. Surfaces no longer own a frame; they
 * render their content and push their peripheral parts into this one's slots.
 *
 * The document tabs are the views. That is the shell's own model rather than an
 * adaptation of it: a tab strip lists what is open, and Dashboard, Runs and
 * Settings are the three things this application can have open. It also puts
 * navigation inside the title bar, which is the one region always on screen.
 */

/** The persisted panel-size key. One shell, so one id. */
const LAYOUT_ID = 'maximal'
const TAB_ID_BASE = `${LAYOUT_ID}-documents`

export type View = 'dashboard' | 'workspace' | 'settings'

/*
 * Tab identity is the view id, so the persisted active tab and the active view
 * cannot drift apart. `icon` and `title` are the strip's; the rail and the
 * heading below read the same names from here.
 */
const VIEW_TABS: Array<Tab & { id: View }> = [
  { id: 'dashboard', title: 'Dashboard', icon: 'document' },
  { id: 'workspace', title: 'Runs', icon: 'folder' },
  { id: 'settings', title: 'Settings', icon: 'settings' },
]

/**
 * What a surface can reach in the frame around it.
 *
 * The four element slots are DOM nodes rather than state, and surfaces fill
 * them with `createPortal` during their own render. State would mean an effect
 * that sets a React element, and a fresh element every render is never equal to
 * the last one, so that effect would re-fire on its own output. Portals have no
 * such loop: nothing here re-renders when a surface's content changes.
 */
interface FrameContextValue {
  /** True while the left panel is collapsed to its icon width. */
  railCollapsed: boolean
  /** The active tab's trigger, for a surface heading's `aria-labelledby`. */
  tabTriggerId: string
  /** The panel the frame renders a surface into, for a control's
   *  `aria-controls`. The element belongs to the frame, so a surface cannot
   *  derive this id and has to be told it. */
  tabPanelId: string
  top: HTMLElement | null
  rail: HTMLElement | null
  right: HTMLElement | null
  status: HTMLElement | null
}

const FrameContext = createContext<FrameContextValue | null>(null)

function useFrame(): FrameContextValue {
  const frame = useContext(FrameContext)
  if (frame === null) throw new Error('frame slots are only available inside AppFrame')
  return frame
}

/** The id naming the active tab, for a surface's own `aria-labelledby`. */
export function useTabTriggerId(): string {
  return useFrame().tabTriggerId
}

/** The id of the panel the surface is rendered into, for `aria-controls` on a
 *  control that changes what the panel shows. */
export function useTabPanelId(): string {
  return useFrame().tabPanelId
}

/*
 * A slot's target does not exist on the frame's first render — it is a ref
 * captured into state — so every one of these returns null once and portals
 * from the second render on. That is a mount-order detail, not a loading state:
 * both renders happen before paint.
 */

/** Full width, under the title bar. For anything addressing the whole window. */
export function SurfaceTop({ children }: { children: ReactNode }): ReactElement | null {
  const { top } = useFrame()
  return top === null ? null : createPortal(children, top)
}

/** The left panel: this view's own navigation, the shell's sidebar. */
export function SurfaceRail({
  children,
}: {
  children: (collapsed: boolean) => ReactNode
}): ReactElement | null {
  const { rail, railCollapsed } = useFrame()
  return rail === null ? null : createPortal(children(railCollapsed), rail)
}

/** The right panel. */
export function SurfaceRight({ children }: { children: ReactNode }): ReactElement | null {
  const { right } = useFrame()
  return right === null ? null : createPortal(children, right)
}

/** The status bar's leading items. */
export function SurfaceStatus({ children }: { children: ReactNode }): ReactElement | null {
  const { status } = useFrame()
  return status === null ? null : createPortal(children, status)
}

/**
 * Reports the left panel's collapsed state upward.
 *
 * Renders nothing. It exists only so the write happens in an effect belonging
 * to a component inside the frame, and it cannot loop: the value is a boolean,
 * so a repeat set is a no-op React bails on.
 */
function RailCollapse({
  collapsed,
  onChange,
}: {
  collapsed: boolean
  onChange: (collapsed: boolean) => void
}): null {
  useEffect(() => {
    onChange(collapsed)
  }, [collapsed, onChange])
  return null
}

export function AppFrame({
  view,
  onSelectView,
  children,
}: {
  view: View
  onSelectView: (view: View) => void
  children: ReactNode
}): ReactElement {
  const [top, setTop] = useState<HTMLElement | null>(null)
  const [rail, setRail] = useState<HTMLElement | null>(null)
  const [right, setRight] = useState<HTMLElement | null>(null)
  const [status, setStatus] = useState<HTMLElement | null>(null)
  const [railCollapsed, setRailCollapsed] = useState(false)

  const frame = useMemo<FrameContextValue>(
    () => ({
      railCollapsed,
      tabTriggerId: getTabTriggerId(TAB_ID_BASE, view),
      tabPanelId: getTabPanelId(TAB_ID_BASE, view),
      top,
      rail,
      right,
      status,
    }),
    [railCollapsed, view, top, rail, right, status],
  )

  return (
    <FrameContext.Provider value={frame}>
      <ShellLayout
        layoutId={LAYOUT_ID}
        tabs={VIEW_TABS}
        activeTab={view}
        onSelectTab={(id) => {
          // A lookup rather than a cast: the strip is typed by its own tabs, so
          // this is the one place that has to prove an id is a view.
          const next = VIEW_TABS.find((tab) => tab.id === id)
          if (next !== undefined) onSelectView(next.id)
        }}
        tabsLabel="Views"
        top={<div ref={setTop} className="app-frame__slot" />}
        left={(collapsed) => (
          <>
            {/*
             * The frame hands `collapsed` to this render prop and nowhere else,
             * and the rail's real content lives in a portal that cannot see it.
             * `RailCollapse` carries it up to the context — from an effect, and
             * from a component of its own, because writing it here would be a
             * parent's state set during a child's render.
             */}
            <RailCollapse collapsed={collapsed} onChange={setRailCollapsed} />
            <div ref={setRail} className="app-frame__slot app-frame__slot--rail" />
          </>
        )}
        main={children}
        right={<div ref={setRight} className="app-frame__slot app-frame__slot--fill" />}
        status={<div ref={setStatus} className="app-frame__slot app-frame__slot--contents" />}
      />
    </FrameContext.Provider>
  )
}

// ---- Styles ----
//
// Slot wrappers are plumbing and must not be visible in the layout. A portal
// target is a real element between the panel and the content the panel styles,
// so each one has to hand its box back.
//
// `display: contents` does that literally, and the status bar needs exactly it:
// `.statusbar` is a flex row whose children are its items, and a wrapper would
// otherwise make every item one item. The rail and the right panel instead
// stretch, because their content expects to fill the panel it was written for.
const APP_FRAME_CSS = `
.sb-shell .app-frame__slot--contents {
  display: contents;
}

.sb-shell .app-frame__slot--rail,
.sb-shell .app-frame__slot--fill {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}
`

const APP_FRAME_STYLE_ID = 'app-frame-styles'

if (typeof document !== 'undefined' && !document.getElementById(APP_FRAME_STYLE_ID)) {
  const style = document.createElement('style')
  style.id = APP_FRAME_STYLE_ID
  style.textContent = APP_FRAME_CSS
  document.head.appendChild(style)
}

import {
  type ReactNode,
  type Ref,
  useEffect,
  useRef,
  useState,
} from 'react'

import { Sidebar } from '../components/sidebar'
import { TabBar, type TabBarItem } from '../components/tab-bar'

export interface WorkspaceSidebarSlot {
  label: string
  header?: ReactNode
  content: ReactNode
  toggleLabel?: string
  bodyScrollable?: boolean
}

export interface WorkspaceNavigationSlot {
  label?: string
  header?: ReactNode
  items?: ReactNode
  footer?: ReactNode
}

export interface WorkspaceShellProps {
  tabs: readonly TabBarItem[]
  activeTab: string
  onActiveTabChange: (tab: string) => void
  renderPanel: (item: TabBarItem) => ReactNode
  onCloseTab?: (tab: string) => void
  tabLeading?: ReactNode
  tabTrailing?: ReactNode
  navigation?: WorkspaceNavigationSlot
  leftSidebar?: WorkspaceSidebarSlot
  rightSidebar?: WorkspaceSidebarSlot
  sidebarsOpen: boolean
  onSidebarsOpenChange: (open: boolean) => void
  /** Main-area content shown only while the sidebars are collapsed. */
  compactContent?: ReactNode
  /** Main-area content drawn above the tab panels. */
  mainOverlay?: ReactNode
  mainRef?: Ref<HTMLElement>
  backgroundVisible?: boolean
  /** Fills the host viewport instead of drawing a floating window frame. */
  fill?: boolean
  children?: ReactNode
}

export function WorkspaceShell({
  tabs,
  activeTab,
  onActiveTabChange,
  renderPanel,
  onCloseTab,
  tabLeading,
  tabTrailing,
  navigation,
  leftSidebar,
  rightSidebar,
  sidebarsOpen,
  onSidebarsOpenChange,
  compactContent,
  mainOverlay,
  mainRef,
  backgroundVisible = false,
  fill = false,
  children,
}: WorkspaceShellProps) {
  const [leftSidebarSize, setLeftSidebarSize] = useState<number>()
  const [rightSidebarSize, setRightSidebarSize] = useState<number>()
  const [leftSidebarScrollTop, setLeftSidebarScrollTop] = useState(0)
  const [rightSidebarScrollTop, setRightSidebarScrollTop] = useState(0)
  const sidebarToggle = useRef({ sidebarsOpen, onSidebarsOpenChange })
  sidebarToggle.current = { sidebarsOpen, onSidebarsOpenChange }

  useEffect(() => {
    const handleToggleShortcut = (event: KeyboardEvent) => {
      if (!event.metaKey || !event.shiftKey || event.code !== 'Slash') return

      event.preventDefault()
      const toggle = sidebarToggle.current
      toggle.onSidebarsOpenChange(!toggle.sidebarsOpen)
    }

    window.addEventListener('keydown', handleToggleShortcut)
    return () => window.removeEventListener('keydown', handleToggleShortcut)
  }, [])

  return (
    <div
      className="maximal-workspace-shell"
      data-fill={fill ? '' : undefined}
      data-workspace-mode={sidebarsOpen ? 'expanded' : 'compact'}
    >
      {navigation ? (
        <nav
          className="maximal-workspace-shell__navigation-bar"
          aria-label={navigation.label ?? 'Workspace navigation'}
        >
          <div className="maximal-workspace-shell__navigation-header">
            {navigation.header}
          </div>
          <div className="maximal-workspace-shell__navigation-default">
            {navigation.items}
          </div>
          <div className="maximal-workspace-shell__navigation-footer">
            {navigation.footer}
          </div>
        </nav>
      ) : null}

      {leftSidebar ? (
        <Sidebar
          bodyScrollable={leftSidebar.bodyScrollable}
          headerContent={leftSidebar.header}
          id="workspace-left-sidebar"
          onOpenChange={onSidebarsOpenChange}
          onScrollTopChange={setLeftSidebarScrollTop}
          onSizeChange={setLeftSidebarSize}
          open={sidebarsOpen}
          resizable
          scrollTop={leftSidebarScrollTop}
          side="left"
          size={leftSidebarSize}
          label={leftSidebar.label}
          toggleLabel={leftSidebar.toggleLabel}
        >
          {leftSidebar.content}
        </Sidebar>
      ) : null}

      <main
        className="maximal-workspace-shell__main"
        data-background-visible={backgroundVisible ? '' : undefined}
        ref={mainRef}
      >
        {!sidebarsOpen ? compactContent : null}
        <TabBar
          items={tabs}
          value={activeTab}
          onValueChange={onActiveTabChange}
          onClose={onCloseTab}
          leading={tabLeading}
          trailing={tabTrailing}
          renderPanel={renderPanel}
        />
        {mainOverlay}
      </main>

      {rightSidebar ? (
        <Sidebar
          bodyScrollable={rightSidebar.bodyScrollable}
          headerContent={rightSidebar.header}
          id="workspace-right-sidebar"
          label={rightSidebar.label}
          onOpenChange={onSidebarsOpenChange}
          onScrollTopChange={setRightSidebarScrollTop}
          onSizeChange={setRightSidebarSize}
          open={sidebarsOpen}
          resizable
          scrollTop={rightSidebarScrollTop}
          showToggle={false}
          side="right"
          size={rightSidebarSize}
        >
          {rightSidebar.content}
        </Sidebar>
      ) : null}
      {children}
    </div>
  )
}

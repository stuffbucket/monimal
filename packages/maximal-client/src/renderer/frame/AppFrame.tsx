import { type ReactElement, type ReactNode } from 'react'
import { FolderSearch, Globe, Sparkles } from 'lucide-react'
import {
  AppFrame as PackageAppFrame,
  IconButton,
  type Tab,
  type TabTransferOptions,
} from '@maximal/maximal-electron/renderer'

import { WORKBAR_ITEMS, type WorkbarItemId } from './workbar-layout'
import { ensureAppFrameStyles } from './app-frame-styles'
import { documentTabs as frameDocumentTabs } from './document-tabs'

export {
  Status,
  SurfaceActivity,
  SurfaceRail,
  SurfaceRight,
  SurfaceTop,
  useTabPanelId,
  useTabTriggerId,
} from '@maximal/maximal-electron/renderer'

const LAYOUT_ID = 'maximal'
const LEFT_PANEL_SIZE = {
  default: '228px',
  min: '168px',
  max: '320px',
  collapsed: '0',
}
const COLLAPSED_LAYOUTS = {
  both: { left: 0, main: 100, right: 0 },
  left: { left: 0, main: 100 },
  right: { main: 100, right: 0 },
}

export type View = WorkbarItemId | 'settings'
export type Surface = View | 'browser' | 'projects' | 'terminal'

export interface AppTab extends Tab {
  kind: Surface
  sessionId?: string
  browserId?: string
  url?: string
  browserOwner?: 'agent' | 'user'
  browserControl?: 'user' | 'agent-shared' | 'agent-exclusive'
  terminalSessionIds?: string[]
  customTitle?: boolean
  canRunInBackground?: boolean
}

export const PRODUCT_TABS: AppTab[] = WORKBAR_ITEMS
  .filter((item) => item.id !== 'projects')
  .map((item) => ({
    id: item.id,
    title: item.label,
    icon: item.icon,
    kind: item.id,
    closable: false,
  }))

// The project browser opens on demand as a closable document, like Settings,
// even though its Projects workbar destination is permanent.
export const PROJECTS_TAB: AppTab = {
  id: 'projects',
  title: 'Projects',
  icon: 'folder',
  kind: 'projects',
  closable: true,
}

export const SETTINGS_TAB: AppTab = {
  id: 'settings',
  title: 'Settings',
  icon: 'settings',
  kind: 'settings',
  closable: true,
}

export function AppFrame({
  tabs,
  activeTab,
  surface,
  onSelectTab,
  onCloseTab,
  onNewTab,
  tabTransfer,
  onOpenAssistant,
  onOpenBrowser,
  onOpenProjects,
  children,
}: {
  tabs: AppTab[]
  activeTab: string
  surface: Surface
  onSelectTab: (id: string) => void
  onCloseTab?: (id: string) => void
  onNewTab?: () => void
  tabTransfer?: TabTransferOptions<AppTab>
  onOpenAssistant?: () => void
  onOpenBrowser?: () => void
  onOpenProjects?: () => void
  children: ReactNode
}): ReactElement {
  ensureAppFrameStyles()
  const documentTabs = frameDocumentTabs(tabs)
  const documentLabel = tabs.find(({ id }) => id === activeTab)?.title
  const withLeft = surface !== 'terminal' && surface !== 'browser'
  const withRight = surface === 'overview' || surface === 'traffic' || surface === 'terminal'
  const initialDocumentLayout = withLeft
    ? (withRight ? COLLAPSED_LAYOUTS.both : COLLAPSED_LAYOUTS.left)
    : (withRight ? COLLAPSED_LAYOUTS.right : undefined)

  return (
    <PackageAppFrame
      layoutId={LAYOUT_ID}
      tabs={documentTabs}
      activeTab={activeTab}
      documentLabel={documentLabel}
      onSelectTab={onSelectTab}
      onCloseTab={onCloseTab}
      onNewTab={onNewTab}
      tabTransfer={tabTransfer}
      tabsLabel="Views"
      newTabLabel="New terminal"
      titleBarActions={onOpenProjects || onOpenAssistant || onOpenBrowser ? (
        <>
          {onOpenProjects ? (
            <IconButton
              label="Open Projects"
              onClick={onOpenProjects}
              testId="open-projects"
            >
              <FolderSearch size={16} />
            </IconButton>
          ) : null}
          {onOpenAssistant ? (
            <IconButton
              label="Open Assistant"
              onClick={onOpenAssistant}
              testId="open-assistant"
            >
              <Sparkles size={16} />
            </IconButton>
          ) : null}
          {onOpenBrowser ? (
            <IconButton
              label="Open Browser"
              onClick={onOpenBrowser}
              testId="open-browser"
            >
              <Globe size={16} />
            </IconButton>
          ) : null}
        </>
      ) : undefined}
      initialDocumentLayout={initialDocumentLayout}
      leftSize={LEFT_PANEL_SIZE}
      withActivity
      withLeft={withLeft}
      withRight={withRight}
    >
      {children}
    </PackageAppFrame>
  )
}

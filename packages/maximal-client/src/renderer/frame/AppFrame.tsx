import { type ReactElement, type ReactNode } from 'react'
import { FolderSearch, Globe, Sparkles } from 'lucide-react'
import {
  AppFrame as PackageAppFrame,
  IconButton,
  type Tab,
  type TabTransferOptions,
} from '@maximal/maximal-electron/renderer'

export {
  SurfaceActivity,
  SurfaceRail,
  SurfaceRight,
  SurfaceStatus,
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

export type View = 'overview' | 'traffic' | 'settings'
export type Surface = View | 'browser' | 'terminal'

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

export const PRODUCT_TABS: AppTab[] = [
  { id: 'overview', title: 'Overview', icon: 'document', kind: 'overview', closable: false },
  { id: 'traffic', title: 'Traffic', icon: 'folder', kind: 'traffic', closable: false },
]

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
  return (
    <PackageAppFrame
      layoutId={LAYOUT_ID}
      tabs={tabs}
      activeTab={activeTab}
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
      leftSize={LEFT_PANEL_SIZE}
      withActivity
      withLeft={surface !== 'terminal' && surface !== 'browser'}
      withRight={surface === 'overview' || surface === 'traffic' || surface === 'terminal'}
      withStatus={surface !== 'terminal' && surface !== 'browser'}
    >
      {children}
    </PackageAppFrame>
  )
}

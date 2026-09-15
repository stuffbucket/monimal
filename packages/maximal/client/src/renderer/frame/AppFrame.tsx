import { type ReactElement, type ReactNode } from 'react'
import {
  AppFrame as PackageAppFrame,
  type Tab,
  type TabTransferOptions,
} from 'stuffbucket-electron/renderer'

export {
  SurfaceRail,
  SurfaceRight,
  SurfaceStatus,
  SurfaceTop,
  useTabPanelId,
  useTabTriggerId,
} from 'stuffbucket-electron/renderer'

const LAYOUT_ID = 'maximal'

export type View = 'overview' | 'traffic' | 'settings'
export type Surface = View | 'terminal'

export interface AppTab extends Tab {
  kind: Surface
  sessionId?: string
}

export const PRODUCT_TABS: AppTab[] = [
  { id: 'overview', title: 'Overview', icon: 'document', kind: 'overview', closable: false },
  { id: 'traffic', title: 'Traffic', icon: 'folder', kind: 'traffic', closable: false },
  { id: 'settings', title: 'Settings', icon: 'settings', kind: 'settings', closable: false },
]

export function AppFrame({
  tabs,
  activeTab,
  surface,
  onSelectTab,
  onCloseTab,
  onNewTab,
  tabTransfer,
  children,
}: {
  tabs: AppTab[]
  activeTab: string
  surface: Surface
  onSelectTab: (id: string) => void
  onCloseTab?: (id: string) => void
  onNewTab?: () => void
  tabTransfer?: TabTransferOptions<AppTab>
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
      withLeft={surface !== 'terminal'}
      withRight={surface === 'overview' || surface === 'traffic'}
      withStatus={surface !== 'terminal' && surface !== 'settings'}
    >
      {children}
    </PackageAppFrame>
  )
}

import { type ReactElement, type ReactNode } from 'react'
import { FolderSearch, Settings as SettingsIcon, Sparkles } from 'lucide-react'
import {
  AppFrame as PackageAppFrame,
  IconButton,
  Profile,
  type Account,
  type SettingsSurface,
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
export type Surface = View | 'terminal'

export interface AppTab extends Tab {
  kind: Surface
  sessionId?: string
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
  account,
  onOpenProfileSurface,
  onSignIn,
  onSignOut,
  onOpenAssistant,
  onOpenProjects,
  settingsOpen = false,
  onToggleSettings,
  children,
}: {
  tabs: AppTab[]
  activeTab: string
  surface: Surface
  onSelectTab: (id: string) => void
  onCloseTab?: (id: string) => void
  onNewTab?: () => void
  tabTransfer?: TabTransferOptions<AppTab>
  account?: Account
  onOpenProfileSurface?: (surface: SettingsSurface) => void
  onSignIn?: () => void
  onSignOut?: () => void
  onOpenAssistant?: () => void
  onOpenProjects?: () => void
  settingsOpen?: boolean
  onToggleSettings?: () => void
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
      titleBarActions={onToggleSettings ? (
        <>
          {onOpenProjects ? (
            <IconButton
              label="Open Projects"
              onClick={onOpenProjects}
              testId="open-projects"
            >
              <FolderSearch size={15} />
            </IconButton>
          ) : null}
          {onOpenAssistant ? (
            <IconButton
              label="Open Assistant"
              onClick={onOpenAssistant}
              testId="open-assistant"
            >
              <Sparkles size={15} />
            </IconButton>
          ) : null}
          {onOpenProfileSurface ? (
            <Profile
              account={account}
              onOpen={onOpenProfileSurface}
              onSignIn={onSignIn}
              onSignOut={onSignOut}
            />
          ) : null}
          <IconButton
            label={settingsOpen ? 'Close Settings' : 'Open Settings'}
            active={settingsOpen}
            onClick={onToggleSettings}
            testId="toggle-settings"
          >
            <SettingsIcon size={15} />
          </IconButton>
        </>
      ) : undefined}
      leftSize={LEFT_PANEL_SIZE}
      withActivity
      withLeft={surface !== 'terminal'}
      withRight={surface === 'overview' || surface === 'traffic'}
      withStatus={surface !== 'terminal'}
    >
      {children}
    </PackageAppFrame>
  )
}

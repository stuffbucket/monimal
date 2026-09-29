import { type ReactElement, type ReactNode } from 'react'
import {
  Circle,
  CircleDot,
  History,
  Settings as SettingsIcon,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import {
  AppFrame as PackageAppFrame,
  IconButton,
  Menu,
  Profile,
  type Account,
  type SettingsSurface,
  type Tab,
  type TabTransferOptions,
} from '@maximal/maximal-electron/renderer'
import type { AssistantChat } from '@maximal/maximal-harness'

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

export type View = 'overview' | 'traffic' | 'settings' | 'assistant'
export type Surface = View | 'terminal'

export interface AppTab extends Tab {
  kind: Surface
  sessionId?: string
  customTitle?: boolean
  canRunInBackground?: boolean
  assistantChatId?: string
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

export const ASSISTANT_TAB: AppTab = {
  id: 'assistant',
  title: 'Assistant',
  icon: 'document',
  kind: 'assistant',
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
  assistant,
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
  assistant?: {
    recent: AssistantChat[]
    hotkey: string
    onToggle: () => void
    onOpenChat: (id: string) => void
    onShowMore: () => void
  }
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
          {assistant ? (
            <Menu
              align="end"
              testId="assistant-menu"
              header="Recent chats"
              trigger={(
                <IconButton
                  label="Assistant"
                  testId="open-assistant"
                >
                  <Sparkles size={15} />
                </IconButton>
              )}
              items={[
                {
                  id: 'toggle',
                  label: `Open or close Assistant · ${assistant.hotkey}`,
                  icon: Sparkles,
                  onSelect: assistant.onToggle,
                },
                ...assistant.recent.map((chat) => ({
                  id: `chat-${chat.id}`,
                  label: chat.title,
                  icon: chat.attention === 'notification'
                    ? TriangleAlert
                    : chat.attention === 'unread'
                      ? CircleDot
                      : Circle,
                  onSelect: () => assistant.onOpenChat(chat.id),
                })),
                {
                  id: 'show-more',
                  label: 'Show more…',
                  icon: History,
                  onSelect: assistant.onShowMore,
                },
              ]}
            />
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

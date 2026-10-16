import { type ReactElement, type ReactNode } from 'react'
import {
  Circle,
  CircleDot,
  FolderSearch,
  Globe,
  History,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import {
  IconButton,
  MenuGroup,
  MenuItem,
  MenuRoot,
  Tooltip,
} from '@maximal/maximal-design-system'
import {
  AppFrame as PackageAppFrame,
  SHELL_PANEL_SIZES,
  type Tab,
  type TabTransferOptions,
} from '@maximal/maximal-electron/renderer'
import type { AssistantChat } from '@maximal/maximal-harness'

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
const LEFT_PANEL_SIZE = { ...SHELL_PANEL_SIZES.sidebar, collapsed: '0' }
const COLLAPSED_LAYOUTS = {
  both: { left: 0, main: 100, right: 0 },
  left: { left: 0, main: 100 },
  right: { main: 100, right: 0 },
}

export type View = WorkbarItemId | 'settings'
export type Surface = View | 'assistant' | 'browser' | 'terminal'

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
  assistantChatId?: string
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
  assistant,
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
  assistant?: {
    recent: AssistantChat[]
    hotkey: string
    onToggle: () => void
    onOpenChat: (id: string) => void
    onShowMore: () => void
  }
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
      titleBarActions={onOpenProjects || assistant || onOpenBrowser ? (
        <>
          {onOpenProjects ? (
            <Tooltip
              trigger={(
                <IconButton
                  data-testid="open-projects"
                  label="Open Projects"
                  onClick={onOpenProjects}
                >
                  <FolderSearch size={16} />
                </IconButton>
              )}
            >
              Open Projects
            </Tooltip>
          ) : null}
          {assistant ? (
            <MenuRoot
              align="end"
              popupProps={{ 'data-testid': 'assistant-menu' }}
              trigger={(
                <IconButton
                  data-testid="open-assistant"
                  label="Assistant"
                >
                  <Sparkles size={16} />
                </IconButton>
              )}
            >
              <MenuGroup label="Recent chats">
                <MenuItem
                  data-testid="menu-toggle"
                  leading={<Sparkles aria-hidden size={16} />}
                  onClick={assistant.onToggle}
                  trailing={assistant.hotkey}
                >
                  Open or close Assistant
                </MenuItem>
                {assistant.recent.map((chat) => {
                  const AttentionIcon = chat.attention === 'notification'
                    ? TriangleAlert
                    : chat.attention === 'unread'
                      ? CircleDot
                      : Circle
                  return (
                    <MenuItem
                      data-testid={`menu-chat-${chat.id}`}
                      key={chat.id}
                      leading={<AttentionIcon aria-hidden size={16} />}
                      onClick={() => assistant.onOpenChat(chat.id)}
                    >
                      {chat.title}
                    </MenuItem>
                  )
                })}
                <MenuItem
                  data-testid="menu-show-more"
                  leading={<History aria-hidden size={16} />}
                  onClick={assistant.onShowMore}
                >
                  Show more…
                </MenuItem>
              </MenuGroup>
            </MenuRoot>
          ) : null}
          {onOpenBrowser ? (
            <Tooltip
              trigger={(
                <IconButton
                  data-testid="open-browser"
                  label="Open Browser"
                  onClick={onOpenBrowser}
                >
                  <Globe size={16} />
                </IconButton>
              )}
            >
              Open Browser
            </Tooltip>
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

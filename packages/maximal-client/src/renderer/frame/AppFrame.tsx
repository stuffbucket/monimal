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
  AppFrame as PackageAppFrame,
  IconButton,
  Menu,
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
            <IconButton
              label="Open Projects"
              onClick={onOpenProjects}
              testId="open-projects"
            >
              <FolderSearch size={16} />
            </IconButton>
          ) : null}
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
                  <Sparkles size={16} />
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

import type { ReactElement } from 'react'
import {
  Workbar,
  type Account,
  type ShellIconName,
  type SettingsSurface,
  type WorkbarItem,
} from '@maximal/maximal-electron/renderer'

import type { AppTab } from './AppFrame'

export function WorkspaceRail({
  tabs,
  current,
  onSelect,
  onOpenMap,
  account,
  onOpenProfileSurface,
  onSignIn,
  onSignOut,
  settingsOpen,
  onToggleSettings,
}: {
  tabs: AppTab[]
  current: string
  onSelect: (id: string) => void
  onOpenMap: () => void
  account?: Account
  onOpenProfileSurface?: (surface: SettingsSurface) => void
  onSignIn?: () => void
  onSignOut?: () => void
  settingsOpen?: boolean
  onToggleSettings?: () => void
}): ReactElement {
  const workspaceTabs = tabs.filter((tab) => tab.kind !== 'settings')
  const items: WorkbarItem<string>[] = [
    { id: 'workspace-map', label: 'Workspace map', icon: 'map' },
    ...workspaceTabs.map((tab) => ({
      id: tab.id,
      label: tab.title,
      icon: (tab.icon ?? 'document') satisfies ShellIconName,
    })),
  ]

  return (
    <Workbar
      items={items}
      current={current}
      onSelect={(id) => id === 'workspace-map' ? onOpenMap() : onSelect(id)}
      account={account}
      onOpenProfileSurface={onOpenProfileSurface}
      onSignIn={onSignIn}
      onSignOut={onSignOut}
      settingsOpen={settingsOpen}
      onToggleSettings={onToggleSettings}
      label="Workspace views"
      testId="workspace-rail"
    />
  )
}
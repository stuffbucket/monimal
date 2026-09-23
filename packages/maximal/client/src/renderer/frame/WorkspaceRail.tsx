import { FileText, Folder, SquareTerminal } from 'lucide-react'
import type { ComponentType, ReactElement } from 'react'
import { NavRail, type NavRailSection } from 'stuffbucket-electron/renderer'

import type { AppTab } from './AppFrame'

function tabIcon(tab: AppTab): ComponentType<{ size?: number }> {
  switch (tab.kind) {
    case 'traffic':
      return Folder
    case 'terminal':
      return SquareTerminal
    case 'overview':
    case 'settings':
      return FileText
  }
}

export function WorkspaceRail({
  tabs,
  current,
  onSelect,
}: {
  tabs: AppTab[]
  current: string
  onSelect: (id: string) => void
}): ReactElement {
  const workspaceTabs = tabs.filter((tab) => tab.kind !== 'settings')
  const icons = new Map(workspaceTabs.map((tab) => [tab.id, tabIcon(tab)]))
  const sections: NavRailSection<string>[] = [{
    id: 'workspace',
    label: 'Workspace',
    items: workspaceTabs.map((tab) => ({ id: tab.id, label: tab.title, count: 0 })),
  }]

  return (
    <NavRail
      sections={sections}
      current={current}
      onSelect={onSelect}
      collapsed
      icon={(entry) => icons.get(entry.id) ?? FileText}
      label="Workspace views"
      testId="workspace-rail"
    />
  )
}
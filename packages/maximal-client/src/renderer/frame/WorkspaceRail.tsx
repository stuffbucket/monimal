import {
  FileText,
  Folder,
  Globe,
  Map as MapIcon,
  Sparkles,
  SquareTerminal,
} from 'lucide-react'
import type { ComponentType, ReactElement } from 'react'
import { NavRail, type NavRailSection } from '@maximal/maximal-electron/renderer'

import type { AppTab } from './AppFrame'

function tabIcon(tab: AppTab): ComponentType<{ size?: number }> {
  switch (tab.kind) {
    case 'browser':
      return Globe
    case 'traffic':
      return Folder
    case 'terminal':
      return SquareTerminal
    case 'assistant':
      return Sparkles
    case 'overview':
    case 'settings':
      return FileText
  }
}

export function WorkspaceRail({
  tabs,
  current,
  onSelect,
  onOpenMap,
}: {
  tabs: AppTab[]
  current: string
  onSelect: (id: string) => void
  onOpenMap: () => void
}): ReactElement {
  const workspaceTabs = tabs.filter((tab) => tab.kind !== 'settings')
  const icons = new Map(workspaceTabs.map((tab) => [tab.id, tabIcon(tab)]))
  const sections: NavRailSection<string>[] = [{
    id: 'workspace',
    label: 'Workspace',
    items: [
      { id: 'workspace-map', label: 'Workspace map', count: 0 },
      ...workspaceTabs.map((tab) => ({ id: tab.id, label: tab.title, count: 0 })),
    ],
  }]
  icons.set('workspace-map', MapIcon)

  return (
    <NavRail
      sections={sections}
      current={current}
      onSelect={(id) => id === 'workspace-map' ? onOpenMap() : onSelect(id)}
      collapsed
      icon={(entry) => icons.get(entry.id) ?? FileText}
      label="Workspace views"
      testId="workspace-rail"
    />
  )
}
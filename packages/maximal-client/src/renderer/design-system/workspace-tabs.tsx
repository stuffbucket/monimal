import type { ReactElement } from 'react'
import {
  AiIcon,
  CommandIcon,
  FolderIcon,
  GridIcon,
  HomeIcon,
  SettingsIcon,
  WidgetIcon,
  type TabBarItem,
} from '@maximal/maximal-design-system'

import type { AppTab, Surface } from '../frame/AppFrame'

const SURFACE_ICONS: Record<Surface, () => ReactElement> = {
  home: () => <HomeIcon />,
  projects: () => <FolderIcon />,
  overview: () => <GridIcon />,
  traffic: () => <GridIcon />,
  terminals: () => <CommandIcon />,
  terminal: () => <CommandIcon />,
  browsers: () => <WidgetIcon />,
  browser: () => <WidgetIcon />,
  assistant: () => <AiIcon />,
  settings: () => <SettingsIcon />,
}

/** Surfaces this renderer draws itself; every other surface is a placeholder. */
export const PORTED_SURFACES: ReadonlySet<Surface> = new Set(['terminal'])

export function workspaceTabItem(tab: AppTab): TabBarItem {
  return {
    id: tab.id,
    label: tab.title,
    icon: SURFACE_ICONS[tab.kind](),
    closable: tab.kind === 'terminal' || tab.closable === true,
    keepMounted: tab.kind === 'terminal',
  }
}

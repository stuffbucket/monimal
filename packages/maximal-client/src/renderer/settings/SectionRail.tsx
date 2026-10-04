import type { ComponentType, ReactElement } from 'react'
import { ScrollArea, Tooltip } from '@maximal/maximal-electron/renderer'

import type { SettingsSectionId } from '../../shared/settings-sections'

/** Settings' persistent single-section navigation. */
export interface SettingsSection {
  id: SettingsSectionId
  label: string
  icon: ComponentType<{ size?: number }>
}

export function SectionRail({
  sections,
  current,
  controls,
  onSelect,
  collapsed,
}: {
  sections: readonly SettingsSection[]
  current: SettingsSectionId
  controls: string
  onSelect: (id: SettingsSectionId) => void
  collapsed: boolean
}): ReactElement {
  return (
    <ScrollArea as="nav" className="settings-rail" aria-label="Settings sections">
      {sections.map(({ id, label, icon: Icon }) => (
        <Tooltip key={id} content={collapsed ? label : undefined} side="right">
          <button
            type="button"
            className="settings-rail__link"
            aria-current={current === id ? 'page' : undefined}
            aria-controls={controls}
            aria-label={collapsed ? label : undefined}
            onClick={() => onSelect(id)}
            data-testid={`settings-rail-${id}`}
          >
            <Icon size={16} />
            {!collapsed && <span>{label}</span>}
          </button>
        </Tooltip>
      ))}
    </ScrollArea>
  )
}

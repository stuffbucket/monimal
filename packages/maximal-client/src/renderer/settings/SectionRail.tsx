import type { ComponentType, ReactElement } from 'react'

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
    <nav className="settings-rail" aria-label="Settings sections">
      {sections.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className="settings-rail__link"
          aria-current={current === id ? 'page' : undefined}
          aria-controls={controls}
          aria-label={collapsed ? label : undefined}
          title={collapsed ? label : undefined}
          onClick={() => onSelect(id)}
          data-testid={`settings-rail-${id}`}
        >
          <Icon size={16} />
          {!collapsed && <span>{label}</span>}
        </button>
      ))}
    </nav>
  )
}

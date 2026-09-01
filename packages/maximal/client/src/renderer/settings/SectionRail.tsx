import type { ComponentType, ReactElement } from 'react'

/**
 * Settings' left rail: in-page navigation to the sections below it.
 *
 * It jumps the scroll position and claims nothing else. `current` is "the
 * section you last jumped to", which is why the buttons carry `aria-current`
 * and not a selected state — nothing here filters or selects.
 *
 * Targets are found by the heading id each section already declares for its own
 * `aria-labelledby`, so a section is reachable from here without exporting a ref
 * or being wrapped in anything. A section that is not on screen yet — one whose
 * data has not arrived — simply does not scroll, rather than throwing.
 */

export interface SettingsSection {
  /** The section's `<h2>` id. Also the scroll target. */
  id: string
  label: string
  /** Shown in place of the label once the rail narrows to an icon column. */
  icon: ComponentType<{ size?: number }>
}

export function SectionRail({
  sections,
  current,
  onSelect,
  collapsed,
}: {
  sections: readonly SettingsSection[]
  current: string | null
  onSelect: (id: string) => void
  collapsed: boolean
}): ReactElement {
  return (
    <nav className="settings-rail" aria-label="Settings sections">
      {!collapsed && <h2 className="settings-rail__heading">On this page</h2>}
      {sections.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className="settings-rail__link"
          aria-current={current === id}
          title={collapsed ? label : undefined}
          onClick={() => onSelect(id)}
          data-testid={`settings-rail-${id}`}
        >
          {/* The icon is always drawn and the label only when there is room.
              An initial was the obvious stand-in and the wrong one: Account and
              Accounts share a first letter, so the collapsed rail showed the
              same mark twice. The name still reaches a pointer through `title`,
              and a screen reader through the button's own text. */}
          <Icon size={16} />
          {!collapsed && <span>{label}</span>}
        </button>
      ))}
    </nav>
  )
}

import type { ReactElement } from 'react'

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
      {sections.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          className="settings-rail__link"
          aria-current={current === id}
          title={collapsed ? label : undefined}
          onClick={() => onSelect(id)}
          data-testid={`settings-rail-${id}`}
        >
          {/* Collapsed, the rail is an icon column and there are no icons for
              these yet, so the initial stands in — a letter is at least a
              stable, distinguishable mark rather than three identical dots. */}
          <span aria-hidden="true" className="settings-rail__mark">
            {label.slice(0, 1)}
          </span>
          {!collapsed && <span>{label}</span>}
        </button>
      ))}
    </nav>
  )
}

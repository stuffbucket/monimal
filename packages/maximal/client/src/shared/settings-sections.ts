/**
 * What sections the Settings surface has, in navigation order.
 *
 * The single source of truth for three consumers that used to each keep their
 * own list: the in-page rail, the page itself, and the application menu. Before
 * this, `Settings.tsx` hard-coded the rail's entries AND rendered the panels as
 * a second hand-written list, so the two could disagree — and adding the menu
 * would have made three lists to keep in step.
 *
 * ## Why this is in `shared/` and carries no icon
 *
 * The main process builds a native menu from these labels, and main must not
 * import React. An icon is a React component, so pairing one with a section
 * here would pull `lucide-react` into the main bundle for the sake of a menu
 * that cannot draw it. The icon and the panel are joined to these ids in
 * `renderer/settings/manifest.ts`, which is the half only the renderer needs.
 *
 * ## Why the ids look like heading ids
 *
 * Because they are. Each panel declares an `<h1 id>` for its own
 * `aria-labelledby`, and the rail selects that panel. Reusing the id avoids a
 * second section key that could drift from the heading it names.
 *
 *
 * Every section remains visible against every supported Core version. A method
 * unavailable in an older Core is an explicit panel state, not a disappearing
 * destination in the rail or native menu.
 */

/**
 * The ids, as a literal tuple.
 *
 * A tuple rather than a plain array so the union below is exact, which is what
 * makes the renderer's icon-and-panel table a total function of this list: a
 * section added here and forgotten there is a type error rather than a section
 * that appears in the rail and scrolls to nothing.
 */
export const SETTINGS_SECTION_IDS = [
  'settings-account-heading',
  'settings-general-heading',
  'settings-connections-heading',
  'settings-models-heading',
  'settings-local-models-heading',
  'settings-usage-heading',
  'settings-logs-heading',
  'settings-diagnostics-heading',
] as const

export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number]
export const DEFAULT_SETTINGS_SECTION_ID = SETTINGS_SECTION_IDS[0]

export interface SettingsSectionSpec {
  /** The section's `<h2>` id and navigation identity. */
  id: SettingsSectionId
  /**
   * What the section is called, in the rail and in the application menu.
   *
   * Product copy, so it is format-neutral: it names the thing being configured
   * and never the surface configuring it.
   */
  label: string
}

/** Array order is rendered order. No `order` field: that buys tie-breaking
 *  between independently-registered contributors, and there is one list. */
export const SETTINGS_SECTIONS: readonly SettingsSectionSpec[] = [
  { id: 'settings-account-heading', label: 'Account' },
  { id: 'settings-general-heading', label: 'General' },
  { id: 'settings-connections-heading', label: 'Connections' },
  { id: 'settings-models-heading', label: 'Models' },
  { id: 'settings-local-models-heading', label: 'Local models' },
  { id: 'settings-usage-heading', label: 'Usage' },
  { id: 'settings-logs-heading', label: 'Logs' },
  { id: 'settings-diagnostics-heading', label: 'Diagnostics' },
]

/**
 * Whether a value names a section.
 *
 * The renderer narrows the application menu's payload through this rather than
 * asserting it. Main only ever sends ids from the list above, so this is not a
 * trust boundary — it is what lets the id stay a union instead of a `string`
 * cast that would go stale the day a section is renamed.
 */
export function isSettingsSectionId(value: unknown): value is SettingsSectionId {
  return (
    typeof value === 'string' &&
    (SETTINGS_SECTION_IDS as readonly string[]).includes(value)
  )
}

const LEGACY_CONNECTION_SECTION_IDS = new Set([
  'settings-apps-heading',
  'settings-endpoint-heading',
  'settings-api-keys-heading',
])

/** Map one-cycle legacy section requests onto their consolidated destination. */
export function settingsSectionIdFrom(value: unknown): SettingsSectionId | null {
  if (typeof value === 'string' && LEGACY_CONNECTION_SECTION_IDS.has(value)) {
    return 'settings-connections-heading'
  }
  return isSettingsSectionId(value) ? value : null
}

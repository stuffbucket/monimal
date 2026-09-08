/**
 * What sections the Settings surface has, in the order it renders them.
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
 * Because they are. Each panel already declares an `<h2 id>` for its own
 * `aria-labelledby`, and the rail scrolls to it. Reusing that id rather than
 * inventing a parallel key means a section is reachable without exporting a ref
 * or being wrapped in anything, and there is no second name to keep in step.
 *
 * ## `requires`
 *
 * `server/discover` advertises the control methods the running core actually
 * offers, and `main/control-session.ts` already keeps that set. A section that
 * names methods it cannot work without is hidden when the core does not offer
 * them, which is how a client built against a newer core stays usable against
 * an older one. No section needs it yet; `visibleSections` is the mechanism.
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
  'settings-accounts-heading',
  'settings-connection-heading',
] as const

export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number]

export interface SettingsSectionSpec {
  /** The section's `<h2>` id, and the scroll target the rail jumps to. */
  id: SettingsSectionId
  /**
   * What the section is called, in the rail and in the application menu.
   *
   * Product copy, so it is format-neutral: it names the thing being configured
   * and never the surface configuring it.
   */
  label: string
  /** Control methods the panel cannot work without. Absent from
   *  `server/discover` — section hidden. */
  requires?: readonly string[]
}

/** Array order is rendered order. No `order` field: that buys tie-breaking
 *  between independently-registered contributors, and there is one list. */
export const SETTINGS_SECTIONS: readonly SettingsSectionSpec[] = [
  { id: 'settings-account-heading', label: 'Account' },
  { id: 'settings-accounts-heading', label: 'Accounts' },
  { id: 'settings-connection-heading', label: 'Connection' },
]

/**
 * The sections a core advertising `methods` can actually back.
 *
 * `undefined` means the advertised set is not known yet — the core is still
 * starting, or discovery has not answered. Every section is shown in that
 * case, deliberately: hiding on "not known yet" would empty the surface during
 * every boot and every sidecar restart, which reads as breakage rather than as
 * waiting.
 */
export function visibleSections(
  sections: readonly SettingsSectionSpec[],
  methods: ReadonlySet<string> | undefined,
): readonly SettingsSectionSpec[] {
  if (methods === undefined) return sections
  return sections.filter(
    (section) => section.requires?.every((method) => methods.has(method)) ?? true,
  )
}

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

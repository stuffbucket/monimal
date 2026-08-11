/**
 * What a tab shows besides its title, and what it says while showing it.
 *
 * Three signals compete for one place before the label, so the resolution has
 * to be stated once rather than decided by the order of three `&&` in JSX. It
 * lives here, apart from React, because `npm run mutate` cannot load a
 * component.
 *
 * The accessible text is the other half. A dot, a rule down an edge and a
 * travelling bar are all invisible to a screen reader and all fail WCAG 1.4.1
 * on their own, so every signal contributes words to the tab's name.
 */

/** How a tab carries a signal the dot is the wrong size for. */
export const TAB_EMPHASIS = ['attention', 'busy'] as const;

export type TabEmphasis = (typeof TAB_EMPHASIS)[number];

/**
 * The icons the shell sources.
 *
 * A name rather than a component, because a tab is data: it crosses a session
 * store, `JSON.stringify`, and in a consumer an IPC boundary, none of which
 * carry a function. A consumer with a glyph the shell does not source passes a
 * component through `TabBar`'s `icon` instead.
 */
export const TAB_ICON_NAMES = ['document', 'folder', 'settings', 'terminal'] as const;

export type TabIconName = (typeof TAB_ICON_NAMES)[number];

/** The parts of a tab that are neither its identity nor its title. */
export interface TabAdornment {
  status?: string;
  /** Overrides the words a known status contributes. */
  statusLabel?: string;
  emphasis?: TabEmphasis;
  icon?: TabIconName;
}

/**
 * The words for the statuses the stylesheet colours.
 *
 * Only these four. A status outside the set draws the default grey dot, which
 * carries no colour information and so needs no words to replace.
 *
 * A map rather than a record, here and below, because the key is optional. A
 * record cannot be indexed by `string | undefined`, so it would need a guard in
 * front of a lookup that already answers undefined for an absent key — a branch
 * no test can distinguish, which `npm run mutate` reports and is right to.
 */
export const STATUS_LABELS: ReadonlyMap<string | undefined, string> = new Map([
  ['blocked', 'Blocked'],
  ['done', 'Done'],
  ['failed', 'Failed'],
  ['running', 'Running'],
]);

/**
 * What each emphasis is called, for a screen reader.
 *
 * A tab signals attention and busy visually. Neither reaches a reader, so the
 * label joins the tab's accessible name and the signal stops being decoration.
 */
export const EMPHASIS_LABELS: ReadonlyMap<TabEmphasis | undefined, string> = new Map([
  ['attention', 'Needs attention'],
  ['busy', 'Working'],
]);

/** Which of the three the one slot draws. */
export type TabSlot = 'custom' | 'status' | 'icon' | 'none';

/**
 * What goes before the label, given whether the caller supplied a component.
 *
 * The slot is one place, so this is a precedence and not a layout. A caller's
 * own component wins, because it is the only one of the three that was asked
 * for at this call site. Status beats the sourced icon: what a tab is stays
 * true, what it is doing does not, and the perishable signal is the one worth
 * a glyph.
 */
export function tabSlot(tab: TabAdornment, custom: boolean): TabSlot {
  if (custom) return 'custom';
  if (tab.status !== undefined) return 'status';
  if (tab.icon !== undefined) return 'icon';
  return 'none';
}

/**
 * The words a tab's non-textual signals add to its accessible name.
 *
 * Both are read, not the one that won the slot: emphasis is drawn on the tab
 * rather than in it, so a busy tab showing a status dot carries two signals and
 * owes two words.
 */
export function adornmentLabel(tab: TabAdornment): string | undefined {
  const words = [
    tab.statusLabel ?? STATUS_LABELS.get(tab.status),
    EMPHASIS_LABELS.get(tab.emphasis),
  ].filter((word) => word !== undefined);
  return words.length === 0 ? undefined : words.join(', ');
}

import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronDown } from 'lucide-react';
import { useState, type ComponentType } from 'react';

/** One row in a section: an icon, a label, a count, and an optional dot. */
export interface NavRailEntry<Id extends string, Status extends string = string> {
  id: Id;
  label: string;
  /** The number at the end of the row. Zero draws nothing. */
  count: number;
  /** Drives the status dot. Absent on an entry with no lifecycle. */
  status?: Status;
}

/**
 * A labelled group of entries, drawn as a collapsible section.
 *
 * `label` is the heading, and the heading is the disclosure control. A rail is
 * a list of these, so a navigation of several labelled groups is several
 * sections and no markup of the caller's own.
 */
export interface NavRailSection<Id extends string, Status extends string = string> {
  id: string;
  label: string;
  items: NavRailEntry<Id, Status>[];
}

/**
 * The collapsible left navigation: any number of labelled groups of entries.
 *
 * Two independent collapse behaviours, which is what Figma does:
 *
 * - The whole panel collapses to an icon rail. `collapsed` drives that, and the
 *   panel width is owned by `react-resizable-panels` in `ShellLayout`.
 * - Each section collapses on its own, through Radix `Collapsible`. The
 *   heading is the trigger, and the group's own state is held here.
 *
 * Generic over the view id so a caller keeps its own union, rather than being
 * handed a `string` back in `onSelect`.
 *
 * The heading, the chevron, the count and the status dot are the rail's, and
 * the only decoration a section takes is its label. Style them through the
 * class names in the shipped stylesheet: `nav__heading`, `nav__chevron`,
 * `nav__item` and `nav__item-count`, all under `.sb-shell`.
 */
export function NavRail<Id extends string, Status extends string = string>({
  sections,
  current,
  onSelect,
  collapsed,
  icon,
  label = 'Primary',
  testId = 'left-nav',
}: {
  /** One collapsible labelled group each, in the order they are drawn. */
  sections: NavRailSection<Id, Status>[];
  /** The selected entry's id, across every section. */
  current: Id;
  onSelect: (id: Id) => void;
  /** Narrows the rail to an icon column. `ShellLayout` passes this in. */
  collapsed: boolean;
  /** The icon component for a row, chosen from whatever the entry carries. */
  icon: (entry: NavRailEntry<Id, Status>) => ComponentType<{ size?: number }>;
  /** Only one rail on a page may be the primary navigation. */
  label?: string;
  testId?: string;
}) {
  // Unset means open. Seeding this with every section id would say the same
  // thing at more length, and would go stale when a section is added.
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <nav
      className={`nav${collapsed ? ' nav--collapsed' : ''}`}
      aria-label={label}
      data-testid={testId}
    >
      {sections.map((section, index) => (
        <Collapsible.Root
          key={section.id}
          className="nav__section"
          open={collapsed ? true : (open[section.id] ?? true)}
          onOpenChange={(next) =>
            setOpen((prev) => ({ ...prev, [section.id]: next }))
          }
        >
          {collapsed ? (
            // The heading's space, kept. Removing it shifted every icon below.
            <span className="nav__break" data-first={index === 0 || undefined} />
          ) : (
            <Collapsible.Trigger className="nav__heading">
              <ChevronDown className="nav__chevron" size={12} />
              <span>{section.label}</span>
            </Collapsible.Trigger>
          )}

          <Collapsible.Content>
            {section.items.map((entry) => {
              const Icon = icon(entry);
              return (
                <button
                  key={entry.id}
                  type="button"
                  className="nav__item"
                  aria-current={entry.id === current}
                  data-status={entry.status}
                  onClick={() => onSelect(entry.id)}
                  title={collapsed ? entry.label : undefined}
                  // A colon is legal in an id and not in a test selector. The
                  // production ids contain none, so this is a no-op for them.
                  data-testid={`nav-${entry.id.replace(':', '-')}`}
                >
                  <Icon size={16} />
                  <span className="nav__label">{entry.label}</span>
                  {entry.count > 0 && (
                    <span className="nav__item-count">{entry.count}</span>
                  )}
                </button>
              );
            })}
          </Collapsible.Content>
        </Collapsible.Root>
      ))}
    </nav>
  );
}

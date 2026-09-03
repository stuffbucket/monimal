import { LayoutGrid, List, X } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';

import { useComponentStyles } from '../../lib/component-styles.js';

import { IconButton } from './Button.js';

/** Grid and list are the two content modes a canvas offers. */
export type ViewMode = 'grid' | 'list';

/** The grid and list switch. */
export function ViewModeSwitch({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label="View mode">
      <button
        type="button"
        aria-pressed={mode === 'grid'}
        aria-label="Grid view"
        onClick={() => onChange('grid')}
        data-testid="mode-grid"
      >
        <LayoutGrid size={14} />
      </button>
      <button
        type="button"
        aria-pressed={mode === 'list'}
        aria-label="List view"
        onClick={() => onChange('list')}
        data-testid="mode-list"
      >
        <List size={14} />
      </button>
    </div>
  );
}

/** A canvas heading, with the view-mode switch pushed to the right. */
export function Toolbar({
  title,
  mode,
  onModeChange,
  as: Heading = 'h1',
}: {
  title: string;
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  /** A document has one h1. A second toolbar on the page needs h2. */
  as?: 'h1' | 'h2' | 'h3';
}) {
  return (
    <div className="toolbar">
      <Heading className="toolbar__title">{title}</Heading>
      <span className="toolbar__grow" />
      <ViewModeSwitch mode={mode} onChange={onModeChange} />
    </div>
  );
}

/**
 * What a canvas shows when it has nothing to show.
 *
 * The icon is the caller's, because it should match what the view holds rather
 * than be generic.
 */
export function EmptyState({
  icon: Icon,
  message,
}: {
  icon: ComponentType<{ size?: number }>;
  message: string;
}) {
  return (
    <div className="empty">
      <Icon size={24} />
      <p>{message}</p>
    </div>
  );
}

/**
 * A filled pill carrying a state.
 *
 * `status` reaches the markup as `data-status`, and the shipped stylesheet maps
 * no value of it to a colour: a status vocabulary is the host's, so every state
 * draws the same neutral fill until the host says otherwise. Two rules do it:
 *
 * ```css
 * .sb-shell .chip[data-status='failed'] { --shell-status: #f87171 }
 * .sb-shell .chip[data-status='done']   { --shell-status: #4ade80 }
 * ```
 *
 * `--shell-status` is the label and `--shell-status-muted` the fill.
 */
export function StatusChip({ status, label }: { status: string; label: string }) {
  return (
    <span className="chip" data-status={status}>
      {label}
    </span>
  );
}

/**
 * The rules a tag draws itself with.
 *
 * They travel with the component so exporting one ships the other.
 * `src/renderer/lib/component-styles.ts` says why.
 */
const TAG_STYLES = `
.sb-shell .tag {
  display: inline-flex;
  align-items: center;
  padding: 1px var(--shell-space-2);
  border-radius: var(--shell-radius-pill);
  border: 1px solid var(--shell-border);
  font-size: var(--shell-text-xs);
  color: var(--shell-text-subtle);
  white-space: nowrap;
}
`;

/**
 * A label on a value, not a state.
 *
 * `StatusChip` reads its colour from `--shell-status`, which only a status
 * vocabulary sets. A tag says "Vision" or "Coming soon" — a property of the
 * thing, true whatever state it is in — so it is outlined rather than filled
 * and carries no status attribute for a host to colour.
 */
export function Tag({ children }: { children: ReactNode }) {
  useComponentStyles('tag', TAG_STYLES);

  return <span className="tag">{children}</span>;
}

/**
 * The rules a note draws itself with.
 *
 * They travel with the component so exporting one ships the other.
 * `src/renderer/lib/component-styles.ts` says why.
 */
const NOTE_STYLES = `
.sb-shell .note {
  margin: 0;
  font-size: var(--shell-text-sm);
  line-height: var(--shell-leading-base);
  color: var(--shell-text-muted);
}

/*
 * The status colour, on the same mapping every other stateful control here
 * uses: the component passes the state through to data-status and a host
 * writes the --shell-status rules. The package promises no vocabulary of
 * states, so a note with an unrecognised one is a quiet note rather than an
 * unstyled one.
 */
.sb-shell .note[data-status] {
  color: var(--shell-status, var(--shell-text-muted));
}
`;

/**
 * A line of explanation, or of trouble, under the thing it is about.
 *
 * It earns a place here the way `controls/index.ts` says a primitive has to:
 * a consuming application hand-rolled it sixteen times across five files as
 * `.settings-note`, with a plain, a warning and an error tone, and this
 * package styles `.settings__description` and `.settings__note` for the same
 * job without ever exposing either. Three spellings of one thing.
 *
 * Not `Banner`. That is a strip with an action and a dismiss control, and it
 * announces itself as a region; this is a sentence. Reaching for `Banner`
 * because a note has a colour is how a form gets four dismissable regions
 * under it.
 *
 * `live` is the reason this is a component rather than a class name. Every one
 * of the client's error notes carried `role="alert"` and `aria-live` by hand,
 * and half of the polite ones did not — a message that replaces itself and is
 * never announced. Passing the intent instead of the attributes is what makes
 * that decidable once.
 */
export function Note({
  children,
  status,
  live,
  testId,
}: {
  children: ReactNode;
  /** A state a host has a `--shell-status` rule for. Absent means quiet. */
  status?: string;
  /**
   * How a replacement is announced. `assertive` interrupts, and is for a
   * failure the person has to act on; `polite` waits, and is for progress.
   */
  live?: 'polite' | 'assertive';
  testId?: string;
}) {
  useComponentStyles('note', NOTE_STYLES);

  return (
    <p
      className="note"
      data-status={status}
      data-testid={testId}
      role={live === 'assertive' ? 'alert' : undefined}
      aria-live={live}
    >
      {children}
    </p>
  );
}

/**
 * The chrome of a side panel: a title, and what is in it.
 *
 * It used to carry its own collapse button, which sat about forty pixels below
 * the title bar's panel toggle, wore the same icon and did the same thing. The
 * title bar's is the one that survives: it is symmetric with the left rail's
 * toggle, and it is still there when the panel is shut, so it can reopen it.
 * This one could only ever close.
 */
export function InspectorPanel({
  title,
  children,
  testId = 'inspector',
}: {
  title: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div className="inspector" data-testid={testId}>
      <header className="inspector__header">
        <h2 className="inspector__title">{title}</h2>
      </header>

      <div className="inspector__body">{children}</div>
    </div>
  );
}

/**
 * A full-width notice.
 *
 * The usual occupant of `ShellLayout`'s `top` slot: something that addresses
 * the whole window rather than one panel.
 *
 * `status` reaches the markup as `data-status` and draws no colour on its own:
 * the shipped stylesheet maps no value of it. The host sets `--shell-status`,
 * the text, and `--shell-status-muted`, the fill.
 */
export function Banner({
  status,
  children,
  action,
  onDismiss,
  testId,
}: {
  status?: string;
  children: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
  testId?: string;
}) {
  return (
    <div className="banner" role="status" data-status={status} data-testid={testId}>
      <span>{children}</span>
      <span className="banner__grow" />
      {action}
      {onDismiss && (
        <IconButton label="Dismiss" onClick={onDismiss}>
          <X size={14} />
        </IconButton>
      )}
    </div>
  );
}

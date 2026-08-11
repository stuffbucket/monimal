import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import type { ViewMode } from './controls/Layout.js';

/**
 * The same union `ViewModeSwitch` sets, under the name the canvas reads it by.
 * One declaration, so the switch and the canvas cannot drift apart.
 */
export type CanvasViewMode = ViewMode;

/**
 * The options a caller rendered.
 *
 * Direct children only, because that is the one place `role="option"` is legal
 * inside a listbox. A caller who wraps a tile in a layout element gets an
 * invalid structure that axe reports, and gets no keyboard model, rather than a
 * keyboard model over markup a screen reader cannot read.
 */
function optionsIn(container: HTMLElement | null): HTMLElement[] {
  if (container === null) return [];
  return [...container.querySelectorAll<HTMLElement>(':scope > [role="option"]')];
}

/** One step per key. A listbox is linear in both orientations. */
const STEPS: Record<string, number | undefined> = {
  ArrowDown: 1,
  ArrowRight: 1,
  ArrowUp: -1,
  ArrowLeft: -1,
};

/** Where a key sends focus, or `undefined` for a key the listbox does not own. */
function destination(key: string, from: number, count: number): number | undefined {
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  const step = STEPS[key];
  if (step === undefined) return undefined;
  // Clamped rather than wrapped, which is what a native select does.
  return Math.min(count - 1, Math.max(0, from + step));
}

/**
 * A grid of cards or a dense list, over anything with an id.
 *
 * This used to import `Item` from `lib/data.ts` — a module whose own docstring
 * says to replace it with a real data source — and hardcode an icon map of
 * `file | component | prototype`. A consumer could not use the canvas without
 * adopting the sample data's shape.
 *
 * The frame is the part worth sharing: the empty branch, the scroll container,
 * the grid-or-list switch. What a card looks like is the caller's.
 *
 * ## The option contract
 *
 * The item container is a `role="listbox"`, so **every item must render exactly
 * one element carrying `role="option"` and `aria-selected`, and that element
 * must be what `renderCard` or `renderRow` returns** — not something inside a
 * wrapper. `Card` and `Row` from this package are that element already, which is
 * what they are for. Anything else is an invalid structure that a screen reader
 * reports incoherently.
 *
 * ## The keyboard model, which is this component's and not the caller's
 *
 * A listbox owes its user one tab stop and arrow keys between options, and the
 * canvas supplies both over the elements the caller returned. It finds them in
 * the DOM, so a caller writes no `tabIndex` and no key handler:
 *
 * - Tab reaches the selected option, or the first option when nothing is
 *   selected. The rest carry `tabIndex = -1`, so Tab leaves the listbox rather
 *   than walking every item. The selected one is read from `aria-selected` on
 *   the markup, not from `selectedId`, because the attribute is what the role
 *   requires and the DOM is where a caller's answer to it lands.
 * - Arrow keys move focus, clamped at both ends. All four move linearly in item
 *   order: this declares `listbox`, not `grid`, and a grid is a different role
 *   with a different model.
 * - Enter and Space click the focused option, which is how the canvas reaches a
 *   selection it does not own. The default action is cancelled first, so a
 *   `<button>` option does not also fire its own click and one keypress stays
 *   one activation.
 *
 * Selection does not follow focus. `selectedId` is the caller's state and the
 * canvas has no route into it other than the option's own click handler.
 *
 * A key that arrives from a control *inside* an option is left alone, so a
 * button or a field nested in a tile keeps every key of its own.
 *
 * Issue #171.
 */
export function Canvas<T extends { id: string }>({
  items,
  mode,
  selectedId,
  renderCard,
  renderRow,
  empty,
  gridModifier,
  label = 'Items',
  testId = 'canvas',
}: {
  items: T[];
  mode: CanvasViewMode;
  /** Which item is selected. The option markup carries `aria-selected` for it. */
  selectedId: string | undefined;
  /**
   * One item as a card.
   *
   * Must return one element with `role="option"` and `aria-selected`, and no
   * `tabIndex`: the canvas owns the tab stop. `Card` from this package is that
   * element.
   */
  renderCard: (item: T, selected: boolean) => ReactNode;
  /** One item as a row, on `renderCard`'s terms. `Row` is that element. */
  renderRow: (item: T, selected: boolean) => ReactNode;
  empty: ReactNode;
  /** An extra class on the grid, for a view that needs different columns. */
  gridModifier?: string;
  /** Names the listbox for a screen reader. */
  label?: string;
  testId?: string;
}) {
  const list = useRef<HTMLDivElement | null>(null);
  // Which option Tab returns to, once the user has moved. Null until then, so
  // the tab stop starts on the selection rather than on a remembered position.
  const [focused, setFocused] = useState<number | null>(null);

  // No dependency list. The caller owns the option elements and can replace any
  // of them on any render, and a tab stop that survives on a detached node is
  // no tab stop at all.
  useEffect(() => {
    const options = optionsIn(list.current);
    if (options.length === 0) return;
    const selected = options.findIndex(
      (option) => option.getAttribute('aria-selected') === 'true',
    );
    const stop = Math.min(options.length - 1, Math.max(0, focused ?? selected));
    options.forEach((option, index) => {
      option.tabIndex = index === stop ? 0 : -1;
    });
  });

  // A click focuses the option it lands on, so this covers the pointer as well
  // as the keys below: the tab stop follows whatever the user last touched.
  function claimTabStop(event: FocusEvent<HTMLDivElement>) {
    const index = optionsIn(list.current).indexOf(event.target as HTMLElement);
    if (index >= 0) setFocused(index);
  }

  function drive(event: KeyboardEvent<HTMLDivElement>) {
    const options = optionsIn(list.current);
    /* The option itself, never a control inside one: `indexOf` rather than
       `closest`, so a nested button keeps Enter and a nested field keeps the
       arrow keys that move its caret. */
    const from = options.indexOf(event.target as HTMLElement);
    if (from < 0) return;

    const to = destination(event.key, from, options.length);
    if (to !== undefined) {
      event.preventDefault();
      options[to]?.focus();
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      options[from]?.click();
    }
  }

  if (items.length === 0) {
    return <div className="canvas">{empty}</div>;
  }

  const grid = mode === 'grid' ? `grid${gridModifier ? ` ${gridModifier}` : ''}` : 'list';

  return (
    <div className="canvas" data-testid={testId}>
      {/* The tiles are `role="option"`, which only means anything inside a
          listbox. `aria-label` because the list has no visible heading of its
          own; the toolbar above it is a sibling, not a label. */}
      <div
        ref={list}
        className={grid}
        role="listbox"
        aria-label={label}
        data-testid={`view-${mode}`}
        onFocus={claimTabStop}
        onKeyDown={drive}
      >
        {items.map((item) => {
          const selected = item.id === selectedId;
          const render = mode === 'list' ? renderRow : renderCard;
          return <Fragment key={item.id}>{render(item, selected)}</Fragment>;
        })}
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';

/**
 * A selectable tile.
 *
 * A canvas draws four of these: a card and a row in the application, a card and
 * a row in the capture fixture. All four had their semantics written out by
 * hand, and all four got them wrong the same way.
 *
 * `role="option"` rather than a plain button. `aria-selected` is not a
 * permitted attribute on `role="button"` — axe reports it as critical — so the
 * tiles were announcing nothing about selection despite carrying the
 * attribute. That was the exact claim this component's own comment used to
 * make about hand-written tiles.
 *
 * An option has to live in a listbox to mean anything, which `Canvas` now
 * supplies. The attribute is unchanged, so `.card[aria-selected='true']` in
 * the stylesheet still does what it did.
 *
 * There is no `tabIndex` here, and passing one is not a thing this takes.
 * Inside `Canvas` the listbox owns the tab stop and the arrow keys, and it
 * writes `tabIndex` on this element from the outside.
 *
 * `modifier` adds the view's own class beside the base one. `status` sets
 * `data-status`, which the stylesheet colours from.
 */
function Selectable({
  base,
  modifier,
  selected,
  onSelect,
  status,
  testId,
  children,
}: {
  base: 'card' | 'row';
  modifier?: string;
  selected: boolean;
  onSelect: () => void;
  status?: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      className={modifier ? `${base} ${modifier}` : base}
      aria-selected={selected}
      onClick={onSelect}
      data-status={status}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

export type TileProps = Omit<Parameters<typeof Selectable>[0], 'base'>;

/**
 * A tile in a grid.
 *
 * A selectable option, not a container: `selected` and `onSelect` are
 * required, and `Row` is the same component drawn for a dense list. Neither
 * lays its children out — pass `modifier` and style that class yourself.
 *
 * `status` reaches the markup as `data-status` and no stylesheet here maps a
 * value of it, on `StatusChip`'s terms: a status vocabulary is the host's. On a
 * tile it does one thing, which is to publish `--shell-status` and
 * `--shell-status-muted` to everything inside once the host writes the rule
 * that sets them. The tile itself draws no colour from it, so a `modifier`
 * class that reads the pair is how a status reaches the tile's own border.
 */
export function Card(props: TileProps) {
  return <Selectable base="card" {...props} />;
}

/**
 * A tile in a dense list.
 *
 * `Card` under another name and another base class. See it for the rest.
 */
export function Row(props: TileProps) {
  return <Selectable base="row" {...props} />;
}

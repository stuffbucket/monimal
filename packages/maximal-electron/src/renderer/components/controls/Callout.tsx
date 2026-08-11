import { useId, type ReactNode } from 'react';

/**
 * A titled region that calls something out of the flow and offers actions on
 * it.
 *
 * Not a variant of `Card`. `Card` and `Row` are one selectable option under two
 * names — `role="option"`, `selected` and `onSelect` both required, drawn inside
 * `Canvas`'s listbox — so a decorative container variant would put two unrelated
 * jobs on one component. Not `Banner` either: that is a strip in `ShellLayout`'s
 * top slot with `role="status"`, which announces itself and then stops
 * mattering. This sits in the content, keeps its heading, and is the thing being
 * read rather than a report about something else.
 *
 * The content is entirely the caller's, and so are the actions. Three consumers
 * put a command chip, a diff summary and a plain sentence in the same shape, so
 * the container is the part that is shared.
 *
 * `status` reaches the markup as `data-status`, and the shipped stylesheet maps
 * no value of it to a colour: a status vocabulary is the host's. Unmapped, the
 * outline and the heading draw in `--shell-text-subtle` and the fill in
 * `--shell-active`, which is a plain outlined box rather than an amber one
 * nobody chose. `--shell-status` colours the outline and the heading,
 * `--shell-status-muted` the fill.
 */
export function Callout({
  title,
  status,
  actions,
  children,
  as: Heading = 'h2',
  testId,
}: {
  /** The heading, and the accessible name of the region. */
  title: string;
  status?: string;
  /** Buttons, in a row that wraps. Two side by side is the common case. */
  actions?: ReactNode;
  children: ReactNode;
  /** `h3` when the callout sits under a heading of its own, such as an
   * `InspectorPanel` title. */
  as?: 'h2' | 'h3';
  testId?: string;
}) {
  const titleId = useId();

  return (
    <section
      className="callout"
      aria-labelledby={titleId}
      data-status={status}
      data-testid={testId}
    >
      <Heading className="callout__title" id={titleId}>
        {title}
      </Heading>

      <div className="callout__body">{children}</div>

      {actions !== undefined && <div className="callout__actions">{actions}</div>}
    </section>
  );
}

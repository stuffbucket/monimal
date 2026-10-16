import { useId, type ReactElement, type ReactNode } from 'react'

/**
 * Hint and error text for a design-system control that has no description slot
 * of its own (`Select`, `Slider`, `NumberInput`). The control owns its label;
 * this owns the text under it and hands back the ids to describe it with.
 */
export function ControlNotes({
  hint,
  error,
  children,
}: {
  hint?: ReactNode
  error?: ReactNode
  children: (describedBy: string | undefined) => ReactNode
}): ReactElement {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className="control-notes">
      {children(describedBy)}
      {hint ? (
        <p className="settings-list__detail" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="control-notes__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

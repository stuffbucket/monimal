import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';

import { useComponentStyles } from '../../lib/component-styles.js';
import { useShellPortalContainer } from './Overlays.js';

const EDITABLE_LABEL_STYLES = `
.sb-shell .editable-label {
  display: inline-block;
  max-width: min(100%, 30ch);
  min-width: 0;
  overflow: hidden;
  color: inherit;
  font: inherit;
  text-align: inherit;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
}

.sb-shell .editable-label[aria-disabled='true'] {
  cursor: not-allowed;
  opacity: var(--shell-disabled-opacity, 0.5);
}

.sb-shell .editable-label[data-state='editing'] {
  min-width: var(--shell-space-2);
  pointer-events: none;
  visibility: hidden;
  white-space: pre;
}

.sb-shell .editable-label:focus-visible {
  outline: var(--shell-border-width-thin) solid var(--shell-focus, var(--shell-accent));
  outline-offset: 0;
}

.sb-shell .editable-label__input:focus {
  outline: none;
}

.sb-shell .editable-label__input {
  width: 100%;
  min-width: 0;
  padding: 0;
  color: inherit;
  font: inherit;
  text-align: inherit;
  background: transparent;
  border: 0;
  border-radius: 0;
}

.sb-shell .editable-label__input::selection {
  color: inherit;
  background: var(--shell-accent-muted);
}

.sb-shell .editable-label__input--anchored {
  position: fixed;
}
`;

export type EditableLabelState =
  | 'inactive'
  | 'active'
  | 'editing';

export interface EditableLabelProps {
  value: string;
  state: EditableLabelState;
  onActivate: () => void;
  onStateChange: (state: EditableLabelState) => void;
  onCommit: (value: string) => void;
  ariaLabel?: string;
  disabled?: boolean;
  /**
   * Gives a standalone label button semantics and keyboard focus. Leave false
   * when the owning molecule, such as a tab, supplies those semantics.
   */
  focusable?: boolean;
  testId?: string;
}

/** A label with explicit owner-inactive, owner-active, and editing states. */
export function EditableLabel({
  value,
  state,
  onActivate,
  onStateChange,
  onCommit,
  ariaLabel,
  disabled = false,
  focusable = false,
  testId,
}: EditableLabelProps) {
  useComponentStyles('editable-label', EDITABLE_LABEL_STYLES);
  const label = useRef<HTMLSpanElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const portalContainer = useShellPortalContainer();
  const finishing = useRef(false);
  const restoreLabelFocus = useRef(false);
  const [draft, setDraft] = useState(value);
  const [editorStyle, setEditorStyle] = useState<CSSProperties>();

  useEffect(() => setDraft(value), [value]);

  useLayoutEffect(() => {
    if (state === 'editing') {
      finishing.current = false;
      input.current?.focus();
      input.current?.select();
    }
    if (state === 'active' && restoreLabelFocus.current) {
      restoreLabelFocus.current = false;
      label.current?.focus();
    }
  }, [state]);

  useLayoutEffect(() => {
    if (state !== 'editing' || label.current === null) return;
    const anchor = label.current;
    const view = anchor.ownerDocument.defaultView;
    const position = (): void => {
      const rect = anchor.getBoundingClientRect();
      const typography = getComputedStyle(anchor);
      setEditorStyle({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        color: typography.color,
        fontFamily: typography.fontFamily,
        fontSize: typography.fontSize,
        fontStyle: typography.fontStyle,
        fontWeight: typography.fontWeight,
        letterSpacing: typography.letterSpacing,
        lineHeight: typography.lineHeight,
      });
    };

    position();
    const observer = typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(position);
    observer?.observe(anchor);
    view?.addEventListener('resize', position);
    view?.addEventListener('scroll', position, true);
    return () => {
      observer?.disconnect();
      view?.removeEventListener('resize', position);
      view?.removeEventListener('scroll', position, true);
    };
  }, [draft, state]);

  useLayoutEffect(() => {
    const editor = input.current;
    if (
      state === 'editing'
      && editor !== null
      && editor.scrollWidth <= editor.clientWidth + 1
    ) {
      editor.scrollLeft = 0;
    }
  }, [draft, editorStyle, state]);

  const activate = (): void => {
    onActivate();
    onStateChange('active');
  };

  const beginEditing = (): void => {
    onStateChange('editing');
  };

  const finishEditing = (): void => {
    if (finishing.current) return;
    finishing.current = true;
    restoreLabelFocus.current = focusable;
    const nextValue = draft.trim().length === 0 ? value : draft;
    setDraft(nextValue);
    onCommit(nextValue);
    onStateChange('active');
  };

  const cancelEditing = (): void => {
    if (finishing.current) return;
    finishing.current = true;
    restoreLabelFocus.current = focusable;
    setDraft(value);
    onStateChange('active');
  };

  const handleLabelKeyDown = (event: KeyboardEvent<HTMLSpanElement>): void => {
    if (disabled) return;

    if (event.key === 'F2') {
      event.preventDefault();
      if (state === 'inactive') onActivate();
      beginEditing();
      return;
    }

    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (state === 'inactive') activate();
    else if (state === 'active' && event.key === 'Enter') beginEditing();
  };

  const editor = state === 'editing' && portalContainer !== undefined
    ? createPortal(
      <input
        ref={input}
        className="editable-label__input editable-label__input--anchored"
        style={editorStyle}
        value={draft}
        aria-label={ariaLabel}
        disabled={disabled}
        data-state={state}
        data-testid={testId}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={finishEditing}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') {
            event.preventDefault();
            finishEditing();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            cancelEditing();
          }
        }}
      />,
      portalContainer,
    )
    : null;

  return (
    <>
      <span
        ref={label}
        className="editable-label"
        role={focusable ? 'button' : undefined}
        tabIndex={focusable && !disabled ? 0 : undefined}
        aria-label={focusable ? ariaLabel : undefined}
        aria-disabled={focusable && disabled ? true : undefined}
        data-shell-selectable="true"
        data-state={state}
        data-testid={testId}
        onKeyDown={focusable ? handleLabelKeyDown : undefined}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => {
          event.stopPropagation();
          event.preventDefault();
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (disabled) return;
          if (state === 'inactive') activate();
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          if (disabled) return;
          event.preventDefault();
          if (state === 'inactive') onActivate();
          beginEditing();
        }}
      >
        {state === 'editing' ? draft : value}
      </span>
      {editor}
    </>
  );
}

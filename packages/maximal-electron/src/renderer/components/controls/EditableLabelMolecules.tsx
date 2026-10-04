import {
  createElement,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from 'react';

import { useComponentStyles } from '../../lib/component-styles.js';
import {
  EditableLabel,
  type EditableLabelState,
} from './EditableLabel.js';

const EDITABLE_LABEL_MOLECULE_STYLES = `
.sb-shell .editable-heading,
.sb-shell .editable-label-owner {
  min-width: 0;
}

.sb-shell .editable-heading {
  display: flex;
  align-items: center;
}

.sb-shell .editable-list-item {
  display: flex;
  align-items: center;
}

.sb-shell .editable-label-owner {
  display: inline-flex;
  align-items: center;
  color: inherit;
  font: inherit;
  background: transparent;
  border: 0;
}

.sb-shell .editable-label-owner[aria-selected='true'],
.sb-shell .editable-label-owner[data-active] {
  color: var(--maximal-color-text-default);
}
`;

interface EditableMoleculeProps {
  value: string;
  active: boolean;
  onActivate: () => void;
  onCommit: (value: string) => void;
  disabled?: boolean;
  testId?: string;
}

function useMoleculeState(active: boolean) {
  const [state, setState] = useState<EditableLabelState>(
    active ? 'active' : 'inactive',
  );

  useEffect(() => {
    setState((current) => {
      if (!active) return 'inactive';
      return current === 'inactive' ? 'active' : current;
    });
  }, [active]);

  return [state, setState] as const;
}

function useEditableOwner({
  active,
  onActivate,
}: {
  active: boolean;
  onActivate: () => void;
}) {
  const [state, setState] = useMoleculeState(active);
  const owner = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (state === 'active') owner.current?.focus();
  }, [state]);

  const activate = (): void => {
    owner.current?.focus();
    onActivate();
    setState('active');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'F2') {
      event.preventDefault();
      if (!active) onActivate();
      setState('editing');
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (!active) activate();
    else if (event.key === 'Enter') setState('editing');
  };

  return { state, setState, owner, activate, onKeyDown };
}

/** A user-owned heading whose text can be selected and edited. */
export function EditableHeading({
  value,
  onCommit,
  level = 2,
  disabled,
  testId,
}: {
  value: string;
  onCommit: (value: string) => void;
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  disabled?: boolean;
  testId?: string;
}): ReactElement {
  useComponentStyles('editable-label-molecules', EDITABLE_LABEL_MOLECULE_STYLES);
  const [state, setState] = useState<EditableLabelState>('inactive');

  return createElement(
    `h${level}`,
    { className: 'editable-heading', 'data-testid': testId },
    <EditableLabel
      value={value}
      state={state}
      onActivate={() => setState('active')}
      onStateChange={setState}
      onCommit={onCommit}
      ariaLabel={`Rename ${value}`}
      disabled={disabled}
      focusable
    />,
  );
}

function EditableOwnerLabel({
  value,
  active,
  onActivate,
  onCommit,
  disabled,
  testId,
  kind,
  role,
  ariaSelected,
}: EditableMoleculeProps & {
  kind: 'list-item' | 'tab' | 'menubar-item';
  role?: 'tab' | 'menuitem';
  ariaSelected?: boolean;
}) {
  const interaction = useEditableOwner({ active, onActivate });
  return (
    <button
      ref={interaction.owner}
      type="button"
      role={role}
      className="editable-label-owner"
      data-kind={kind}
      aria-selected={ariaSelected}
      disabled={disabled}
      data-active={active || undefined}
      data-testid={testId}
      onClick={() => {
        if (!active) interaction.activate();
      }}
      onKeyDown={interaction.onKeyDown}
    >
      <EditableLabel
        value={value}
        state={interaction.state}
        onActivate={interaction.activate}
        onStateChange={interaction.setState}
        onCommit={onCommit}
        ariaLabel={`Rename ${value}`}
        disabled={disabled}
      />
    </button>
  );
}

/** A selectable list row with an editable user-owned label. */
export function EditableListItem(props: EditableMoleculeProps): ReactElement {
  useComponentStyles('editable-label-molecules', EDITABLE_LABEL_MOLECULE_STYLES);
  return (
    <li className="editable-list-item">
      <EditableOwnerLabel {...props} kind="list-item" />
    </li>
  );
}

/** A tab whose active label supports selection and inline renaming. */
export function EditableTab(props: EditableMoleculeProps): ReactElement {
  useComponentStyles('editable-label-molecules', EDITABLE_LABEL_MOLECULE_STYLES);
  return (
    <EditableOwnerLabel
      {...props}
      kind="tab"
      role="tab"
      ariaSelected={props.active}
    />
  );
}

/** A menu-bar item whose user-owned name is edited outside the menu item. */
export function EditableMenubarItem(props: EditableMoleculeProps): ReactElement {
  useComponentStyles('editable-label-molecules', EDITABLE_LABEL_MOLECULE_STYLES);
  return (
    <EditableOwnerLabel
      {...props}
      kind="menubar-item"
      role="menuitem"
    />
  );
}

export type { EditableMoleculeProps };

import { useEffect, useState } from 'react';

import { useComponentStyles } from '../../lib/component-styles.js';
import type { FieldControl } from './Fields.js';

const NUMBER_INPUT_STYLES = `
.sb-shell .number-input {
  width: 100%;
  height: var(--shell-control-height, var(--shell-control-md));
  padding: 0 var(--shell-space-2);
  color: var(--shell-text);
  font: inherit;
  font-size: var(--shell-text-base);
  background: var(--shell-field-background);
  border: 1px solid var(--shell-input-border);
  border-radius: var(--shell-radius);
}

.sb-shell .number-input:focus {
  border-color: var(--shell-focus, var(--shell-accent));
  outline: none;
  box-shadow: 0 0 0 var(--shell-focus-ring-width) var(--shell-focus, var(--shell-accent));
}

.sb-shell .number-input:disabled {
  opacity: var(--shell-disabled-opacity, 0.5);
  cursor: not-allowed;
}
`;

/** A numeric input that commits a valid bounded value on blur or Enter. */
export function NumberInput({
  value,
  onCommit,
  min,
  max,
  step,
  disabled,
  testId,
  ...field
}: {
  value: number;
  onCommit: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  testId?: string;
} & Partial<FieldControl>) {
  useComponentStyles('number-input', NUMBER_INPUT_STYLES);
  const [draft, setDraft] = useState(String(value));

  useEffect(() => setDraft(String(value)), [value]);

  const commit = (): void => {
    const next = Number(draft);
    if (
      !Number.isFinite(next)
      || (min !== undefined && next < min)
      || (max !== undefined && next > max)
    ) {
      setDraft(String(value));
      return;
    }
    onCommit(next);
  };

  return (
    <input
      className="number-input"
      type="number"
      value={draft}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDraft(String(value));
          event.currentTarget.blur();
        }
      }}
      data-testid={testId}
      {...field}
    />
  );
}

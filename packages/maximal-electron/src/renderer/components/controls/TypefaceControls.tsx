import type { ReactNode } from 'react';

import { useComponentStyles } from '../../lib/component-styles.js';
import { NumberInput } from './NumberInput.js';
import { Select, type Option } from './Fields.js';
import {
  UnitValueInput,
  type UnitValueInputProps,
} from './UnitValueInput.js';

const TYPEFACE_CONTROLS_STYLES = `
.sb-shell .typeface-controls {
  display: grid;
  gap: var(--shell-space-3);
  min-width: 0;
}

.sb-shell .typeface-controls__font {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: var(--shell-space-2);
}

.sb-shell .typeface-controls__field {
  display: grid;
  gap: var(--shell-space-1);
  min-width: 0;
  color: var(--maximal-color-text-secondary);
  font-size: var(--shell-text-xs);
  font-weight: var(--shell-weight-md);
}

.sb-shell .typeface-controls__field select,
.sb-shell .typeface-controls__field .number-input {
  width: 100%;
  min-width: 0;
}

.sb-shell .typeface-controls__field .number-input {
  font-variant-numeric: tabular-nums;
  background: var(--shell-field-background);
  border-color: transparent;
}

.sb-shell .typeface-controls__field .number-input:hover:not(:disabled) {
  border-color: var(--maximal-color-border-strong-hover);
}

.sb-shell .typeface-controls__metrics {
  display: grid;
  grid-template-columns:
    repeat(
      auto-fit,
      minmax(min(100%, calc(var(--shell-control-lg) * 4)), 1fr)
    );
  gap: var(--shell-space-2);
}

.sb-shell .typeface-controls__extras {
  display: grid;
  gap: var(--shell-space-3);
  min-width: 0;
  padding-top: var(--shell-space-1);
}
`;

export interface TypefaceSelectField {
  label: string;
  ariaLabel?: string;
  value: string;
  options: Option<string>[];
  testId?: string;
  onChange: (value: string) => void;
}

export interface TypefaceWeightField {
  label?: string;
  ariaLabel?: string;
  value: number;
  minimum: number;
  maximum: number;
  step: number;
  testId?: string;
  onCommit: (value: number) => void;
}

export interface TypefaceMetric<Unit extends string = string>
  extends Omit<UnitValueInputProps<Unit>, 'id'> {
  id: string;
}

/** Composes compact family, style, weight, and unit-aware type metrics. */
export function TypefaceControls({
  family,
  style,
  weight,
  metrics,
  children,
}: {
  family: TypefaceSelectField;
  style: TypefaceSelectField;
  weight: TypefaceWeightField;
  metrics: readonly TypefaceMetric[];
  children?: ReactNode;
}) {
  useComponentStyles('typeface-controls', TYPEFACE_CONTROLS_STYLES);
  return (
    <div className="typeface-controls">
      <div className="typeface-controls__font">
        <label className="typeface-controls__field">
          <span>{family.label}</span>
          <Select
            aria-label={family.ariaLabel ?? family.label}
            value={family.value}
            options={family.options}
            onChange={family.onChange}
            testId={family.testId}
          />
        </label>
        <label className="typeface-controls__field">
          <span>{style.label}</span>
          <Select
            aria-label={style.ariaLabel ?? style.label}
            value={style.value}
            options={style.options}
            onChange={style.onChange}
            testId={style.testId}
          />
        </label>
      </div>
      <div className="typeface-controls__metrics">
        <label className="typeface-controls__field">
          <span>{weight.label ?? 'Weight'}</span>
          <NumberInput
            aria-label={weight.ariaLabel ?? weight.label ?? 'Typeface weight'}
            value={weight.value}
            min={weight.minimum}
            max={weight.maximum}
            step={weight.step}
            onCommit={weight.onCommit}
            testId={weight.testId}
          />
        </label>
        {metrics.map(({ id, ...metric }) => (
          <UnitValueInput key={id} id={id} {...metric} />
        ))}
      </div>
      {children === undefined ? null : (
        <div className="typeface-controls__extras">{children}</div>
      )}
    </div>
  );
}

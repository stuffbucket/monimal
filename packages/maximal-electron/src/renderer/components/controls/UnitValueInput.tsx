import {
  useEffect,
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
} from 'react';

import { useComponentStyles } from '../../lib/component-styles.js';
import type { FieldControl } from './Fields.js';

const UNIT_VALUE_INPUT_STYLES = `
.sb-shell .unit-value-input {
  display: grid;
  gap: var(--shell-space-1);
  min-width: 0;
}

.sb-shell .unit-value-input__label {
  overflow: hidden;
  color: var(--maximal-color-text-secondary);
  font-size: var(--shell-text-xs);
  font-weight: var(--shell-weight-md);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sb-shell .unit-value-input__control {
  position: relative;
  min-width: 0;
}

.sb-shell .unit-value-input__input {
  width: 100%;
  height: var(--shell-control-height, var(--shell-control-md));
  padding:
    0
    calc(var(--shell-control-lg) + var(--shell-space-2))
    0
    var(--shell-space-2);
  color: var(--maximal-color-text-default);
  font: inherit;
  font-size: var(--shell-text-base);
  font-variant-numeric: tabular-nums;
  background: var(--shell-field-background);
  border: 1px solid transparent;
  border-radius: var(--shell-radius);
}

.sb-shell .unit-value-input__input:hover:not(:disabled) {
  border-color: var(--maximal-color-border-strong-hover);
}

.sb-shell .unit-value-input__input:focus {
  border-color: var(--maximal-color-border-selected);
  outline: none;
  box-shadow: 0 0 0 var(--shell-focus-ring-width) var(--maximal-color-bg-selected);
}

.sb-shell .unit-value-input__input[aria-invalid='true'] {
  border-color: var(--maximal-color-border-danger);
}

.sb-shell .unit-value-input__unit {
  position: absolute;
  top: 0;
  right: var(--shell-space-1);
  width: var(--shell-control-lg);
  height: 100%;
  padding: 0;
  color: var(--maximal-color-text-tertiary);
  font: inherit;
  font-size: var(--shell-text-xs);
  text-align: center;
  appearance: none;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.sb-shell .unit-value-input__unit:focus-visible {
  border-radius: var(--shell-radius);
  outline: var(--shell-focus-ring-width) solid var(--maximal-color-border-selected);
  outline-offset: calc(-1 * var(--shell-focus-ring-width));
}

.sb-shell .unit-value-input__error {
  margin: 0;
  color: var(--maximal-color-text-danger);
  font-size: var(--shell-text-xs);
}
`;

export interface MeasurementUnit<Unit extends string = string> {
  value: Unit;
  label: string;
  aliases?: readonly string[];
  step: number;
  fromCanonical: (value: number) => number;
  toCanonical: (value: number) => number;
}

export interface UnitValueInputProps<Unit extends string = string>
  extends Partial<FieldControl> {
  label: string;
  value: number;
  units: readonly MeasurementUnit<Unit>[];
  defaultUnit: Unit;
  minimum?: number;
  maximum?: number;
  canonicalStep?: number;
  autoValue?: number;
  autoLabel?: string;
  storageKey?: string;
  disabled?: boolean;
  testId?: string;
  onCommit: (value: number) => void;
}

interface Presentation<Unit extends string> {
  unit: Unit;
  manual: boolean;
}

function storedPresentation<Unit extends string>(
  storageKey: string | undefined,
  units: readonly MeasurementUnit<Unit>[],
  defaultUnit: Unit,
  manual: boolean,
): Presentation<Unit> {
  if (storageKey === undefined || typeof localStorage === 'undefined') {
    return { unit: defaultUnit, manual };
  }
  const [storedUnit, storedMode] = (localStorage.getItem(storageKey) ?? '').split('|');
  const unit = units.some(({ value }) => value === storedUnit)
    ? storedUnit as Unit
    : defaultUnit;
  return {
    unit,
    manual: storedMode === 'manual' || (storedMode !== 'auto' && manual),
  };
}

function decimalPlaces(step: number): number {
  const text = String(step);
  return text.includes('.') ? text.length - text.indexOf('.') - 1 : 0;
}

function formatted(value: number, step: number): string {
  return Number(value.toFixed(decimalPlaces(step) + 2)).toString();
}

function parsedDraft<Unit extends string>(
  draft: string,
  units: readonly MeasurementUnit<Unit>[],
  current: MeasurementUnit<Unit>,
): { value: number; unit: MeasurementUnit<Unit> } | null {
  const match = draft.trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*([^\d\s+-]+)?$/u);
  if (match === null) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const suffix = match[2]?.toLocaleLowerCase();
  if (suffix === undefined) return { value, unit: current };
  const unit = units.find((candidate) =>
    [candidate.value, candidate.label, ...(candidate.aliases ?? [])]
      .some((name) => name.toLocaleLowerCase() === suffix));
  return unit === undefined ? null : { value, unit };
}

/** Edits one canonical number through user-selectable presentation units. */
export function UnitValueInput<Unit extends string>({
  label,
  value,
  units,
  defaultUnit,
  minimum,
  maximum,
  canonicalStep,
  autoValue,
  autoLabel = 'Auto',
  storageKey,
  disabled,
  testId,
  onCommit,
  id,
  ...field
}: UnitValueInputProps<Unit>) {
  useComponentStyles('unit-value-input', UNIT_VALUE_INPUT_STYLES);
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const initialManual = autoValue === undefined || value !== autoValue;
  const [presentation, setPresentation] = useState(() =>
    storedPresentation(storageKey, units, defaultUnit, initialManual));
  const selectedUnit = useMemo(
    () => units.find(({ value: unit }) => unit === presentation.unit) ?? units[0],
    [presentation.unit, units],
  );
  if (selectedUnit === undefined) throw new Error('UnitValueInput requires at least one unit');
  const displayValue = formatted(selectedUnit.fromCanonical(value), selectedUnit.step);
  const [draft, setDraft] = useState(presentation.manual ? displayValue : '');
  const [error, setError] = useState<string>();

  useEffect(() => {
    setDraft(presentation.manual ? displayValue : '');
  }, [displayValue, presentation.manual]);

  const persist = (next: Presentation<Unit>): void => {
    setPresentation(next);
    if (storageKey !== undefined && typeof localStorage !== 'undefined') {
      localStorage.setItem(storageKey, `${next.unit}|${next.manual ? 'manual' : 'auto'}`);
    }
  };

  const commit = (): void => {
    if (draft.trim() === '' && autoValue !== undefined) {
      setError(undefined);
      persist({ ...presentation, manual: false });
      onCommit(autoValue);
      return;
    }
    const parsed = parsedDraft(draft, units, selectedUnit);
    if (parsed === null) {
      setError(`Enter a number using ${units.map(({ label: unit }) => unit).join(', ')}.`);
      return;
    }
    const converted = parsed.unit.toCanonical(parsed.value);
    const canonical = canonicalStep === undefined
      ? converted
      : Number((Math.round(converted / canonicalStep) * canonicalStep).toFixed(10));
    if (
      !Number.isFinite(canonical)
      || (minimum !== undefined && canonical < minimum)
      || (maximum !== undefined && canonical > maximum)
    ) {
      setError('The value is outside the supported range.');
      return;
    }
    const next = { unit: parsed.unit.value, manual: true };
    setError(undefined);
    persist(next);
    setDraft(formatted(parsed.value, parsed.unit.step));
    onCommit(canonical);
  };

  const keyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') event.currentTarget.blur();
    if (event.key === 'Escape') {
      setError(undefined);
      setDraft(presentation.manual ? displayValue : '');
      event.currentTarget.blur();
    }
  };

  return (
    <label className="unit-value-input" htmlFor={inputId}>
      <span className="unit-value-input__label">{label}</span>
      <span className="unit-value-input__control">
        <input
          {...field}
          id={inputId}
          className="unit-value-input__input"
          type="text"
          inputMode="decimal"
          value={draft}
          placeholder={autoValue === undefined ? undefined : autoLabel}
          disabled={disabled}
          aria-invalid={error === undefined ? field['aria-invalid'] : true}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(undefined);
          }}
          onBlur={commit}
          onKeyDown={keyDown}
          data-testid={testId}
        />
        <select
          className="unit-value-input__unit"
          value={selectedUnit.value}
          disabled={disabled}
          aria-label={`${label} unit`}
          data-testid={testId === undefined ? undefined : `${testId}-unit`}
          onChange={(event) => {
            const next = event.target.value as Unit;
            const nextUnit = units.find(({ value: unit }) => unit === next);
            if (nextUnit === undefined) return;
            persist({ ...presentation, unit: next });
            setDraft(presentation.manual
              ? formatted(nextUnit.fromCanonical(value), nextUnit.step)
              : '');
          }}
        >
          {units.map((unit) => (
            <option key={unit.value} value={unit.value}>{unit.label}</option>
          ))}
        </select>
      </span>
      {error === undefined ? null : (
        <span className="unit-value-input__error" role="alert">{error}</span>
      )}
    </label>
  );
}

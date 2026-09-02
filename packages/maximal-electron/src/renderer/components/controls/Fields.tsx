import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { createContext, useContext, useId, type ReactNode } from 'react';

import { useComponentStyles } from '../../lib/component-styles.js';

/**
 * Form controls.
 *
 * There was no `<input>` and no `<form>` anywhere in this repository before
 * these: one `<textarea>` in the overlay and one `<select>` in the inspector,
 * each carrying its own idea of a border and a background. They now agree,
 * because `--bg-input` and `--border-input` exist.
 *
 * Native elements wherever the platform already does the work. Radix only for
 * the radio group, whose roving focus is not worth hand-rolling.
 */

/** What `FormField` hands to the control it wraps. */
export interface FieldControl {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': boolean | undefined;
}

/**
 * A labelled control, with hint and error text wired to it.
 *
 * The wiring is the point. A hint nobody's screen reader reads and an error
 * that is only a colour are both easy to write by hand and easy to get wrong,
 * so this owns `aria-describedby` and `aria-invalid` and hands them down.
 */
export function FormField({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (field: FieldControl) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="form-field">
      <label className="form-field__label" htmlFor={id}>
        {label}
      </label>
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })}
      {hint && (
        <p className="form-field__hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="form-field__error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** A single-line text input. */
export function TextInput({
  value,
  onChange,
  placeholder,
  disabled,
  type = 'text',
  testId,
  ...field
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: 'text' | 'search' | 'password';
  testId?: string;
} & Partial<FieldControl>) {
  return (
    <input
      className="input"
      type={type}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      data-testid={testId}
      {...field}
    />
  );
}

/** A multi-line text input. */
export function Textarea({
  value,
  onChange,
  placeholder,
  disabled,
  rows = 3,
  onKeyDown,
  testId,
  ...field
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  testId?: string;
} & Partial<FieldControl>) {
  return (
    <textarea
      className="input input--multiline"
      rows={rows}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      data-testid={testId}
      {...field}
    />
  );
}

export interface Option<T extends string> {
  value: T;
  label: string;
}

/** A native select. The platform's own popup beats a rebuilt one. */
export function Select<T extends string>({
  value,
  onChange,
  options,
  disabled,
  testId,
  ...field
}: {
  value: T;
  onChange: (next: T) => void;
  options: Option<T>[];
  disabled?: boolean;
  testId?: string;
} & Partial<FieldControl>) {
  return (
    <select
      className="input input--select"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as T)}
      data-testid={testId}
      {...field}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** A checkbox with its label. */
export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
  testId,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <label className="checkbox">
      <input
        type="checkbox"
        className="checkbox__box"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        data-testid={testId}
      />
      <span>{label}</span>
    </label>
  );
}

/** A set of exclusive choices. Radix supplies the roving focus. */
export function RadioGroup<T extends string>({
  value,
  onChange,
  options,
  disabled,
  testId,
  ...field
}: {
  value: T;
  onChange: (next: T) => void;
  options: Option<T>[];
  disabled?: boolean;
  testId?: string;
} & Partial<FieldControl>) {
  return (
    <RadioGroupPrimitive.Root
      className="radio-group"
      value={value}
      disabled={disabled}
      onValueChange={(next) => onChange(next as T)}
      data-testid={testId}
      {...field}
    >
      {options.map((option) => (
        <label className="radio" key={option.value}>
          <RadioGroupPrimitive.Item className="radio__box" value={option.value}>
            <RadioGroupPrimitive.Indicator className="radio__dot" />
          </RadioGroupPrimitive.Item>
          <span>{option.label}</span>
        </label>
      ))}
    </RadioGroupPrimitive.Root>
  );
}

/** A labelled switch. Reads as a setting rather than as a form control. */
export function Switch({
  label,
  checked,
  onChange,
  disabled,
  testId,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className="switch"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      data-testid={testId}
    >
      <span>{label}</span>
      <span className="switch__track" data-on={checked}>
        <span className="switch__thumb" />
      </span>
    </button>
  );
}

/**
 * A read-only label and value.
 *
 * Not a form field, despite the name it has always had. It renders what
 * something is, not somewhere to change it.
 */
/** Whether a `Field` has a `FieldList` above it, and so a `<dl>` to sit in. */
const InFieldList = createContext(false);

/**
 * The rules a list of fields draws itself with.
 *
 * They travel with the component so exporting one ships the other.
 * `src/renderer/lib/component-styles.ts` says why. The `.field` grid itself is
 * in `structural.css` and unchanged — these are only what a description list
 * needs on top of it.
 */
const FIELD_LIST_STYLES = `
.sb-shell .field-list {
  margin: 0;
  display: grid;
  gap: var(--shell-space-2);
}

/*
 * A dd carries a browser default margin-inline-start of 40px, which would
 * indent every value out of the grid column the .field rule puts it in.
 */
.sb-shell .field-list dt,
.sb-shell .field-list dd {
  margin: 0;
}
`;

/**
 * A group of read-only label/value pairs, as a description list.
 *
 * The pairs are the point. A screen reader announces "Plan, Pro" from a
 * `<dl>`; from two `<span>`s it announces "Plan" and "Pro" as unrelated text
 * and the reader has to infer the association from where they happen to sit.
 * `Field` on its own could not render `dt`/`dd`, because those are only valid
 * inside a `<dl>` — which is why this exists rather than an option on `Field`.
 *
 * Three spellings of one thing is what prompted it. `ModelCards` here already
 * renders a real `<dl>`; `ApiKeysDialog` and `Diagnostics` write
 * `.field`/`.field__label` markup by hand; and `Field`, the one this package
 * actually exports, rendered spans. `packages/maximal/client` kept its own
 * `<dl>` rather than use the export, which was the correct call and the
 * evidence.
 */
export function FieldList({ children, testId }: { children: ReactNode; testId?: string }) {
  useComponentStyles('field-list', FIELD_LIST_STYLES);

  return (
    <InFieldList.Provider value={true}>
      <dl className="field-list" data-testid={testId}>
        {children}
      </dl>
    </InFieldList.Provider>
  );
}

/**
 * A read-only label and the value beside it.
 *
 * Inside a `FieldList` it is a `dt`/`dd` pair and the association is stated;
 * on its own it stays the two spans it has always been, so no existing call
 * site changes shape. That is deliberate rather than tidy: `dt` outside a
 * `<dl>` is invalid, and a primitive that silently emitted invalid markup
 * depending on where it was put would be worse than one that emits plain
 * markup everywhere.
 *
 * `value` takes a node, so a value can carry a control — the copy button
 * beside a key, the chip on a diagnostic — which is what the three hand-written
 * copies of this markup were each working around.
 */
export function Field({
  label,
  value,
  testId,
}: {
  label: string;
  value: ReactNode;
  testId?: string;
}) {
  const paired = useContext(InFieldList);
  const Label = paired ? 'dt' : 'span';
  const Value = paired ? 'dd' : 'span';

  return (
    <div className="field" data-testid={testId}>
      <Label className="field__label">{label}</Label>
      <Value className="field__value">{value}</Value>
    </div>
  );
}

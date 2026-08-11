import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { useId, type ReactNode } from 'react';

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
export function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <span className="field__value">{value}</span>
    </div>
  );
}

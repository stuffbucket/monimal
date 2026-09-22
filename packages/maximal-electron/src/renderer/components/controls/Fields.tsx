import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Eye, EyeOff } from 'lucide-react';
import {
  createContext,
  useContext,
  useId,
  useState,
  type FocusEvent,
  type ReactNode,
} from 'react';

import { useComponentStyles } from '../../lib/component-styles.js';
import { IconButton } from './Button.js';
import { useShellPortalContainer } from './Overlays.js';

const FIELD_STYLES = `
.sb-shell {
  --shell-field-control-size: 15px;
  --shell-field-radio-dot-size: 7px;
  --shell-field-action-inset: 2px;
  --shell-field-half: 50%;
  --shell-switch-duration: 120ms;
}

.sb-shell .input:focus {
  border-color: var(--shell-focus, var(--shell-accent));
  outline: none;
  box-shadow: 0 0 0 var(--shell-focus-ring-width) var(--shell-focus, var(--shell-accent));
}

.sb-shell .input:disabled,
.sb-shell .switch:disabled,
.sb-shell .checkbox__box:disabled,
.sb-shell .radio-group[data-disabled] {
  opacity: var(--shell-disabled-opacity, 0.5);
  cursor: not-allowed;
}

.sb-shell .input {
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

.sb-shell .input::placeholder {
  color: var(--shell-text-subtle);
}

.sb-shell .input-shell {
  position: relative;
  width: 100%;
}

.sb-shell .input-shell .input {
  padding-right: calc(var(--shell-control-lg) + var(--shell-space-1));
}

.sb-shell .input-shell__action {
  position: absolute;
  top: var(--shell-field-half);
  right: var(--shell-field-action-inset);
  transform: translateY(calc(-1 * var(--shell-field-half)));
}

.sb-shell .input:hover:not(:disabled) {
  border-color: var(--shell-border-hover, var(--shell-accent));
}

.sb-shell .input[aria-invalid='true'] {
  border-color: var(--shell-invalid, var(--shell-danger, var(--shell-hover)));
}

.sb-shell .input--multiline {
  height: auto;
  padding: var(--shell-space-2);
  line-height: var(--shell-leading-base);
  resize: vertical;
}

.sb-shell .input--select {
  padding-right: var(--shell-space-1);
}

.sb-shell .form-field {
  display: grid;
  gap: var(--shell-space-1);
}

.sb-shell .form-field__label-row {
  display: flex;
  align-items: center;
  gap: var(--shell-space-1);
}

.sb-shell .form-field__label {
  color: var(--shell-text-muted);
  font-size: var(--shell-text-base);
}

.sb-shell .form-field__hint {
  margin: 0;
  color: var(--shell-text-subtle);
  font-size: var(--shell-text-sm);
}

.sb-shell .form-field__error {
  margin: 0;
  color: var(--shell-invalid, var(--shell-danger, var(--shell-hover)));
  font-size: var(--shell-text-sm);
}

.sb-shell .checkbox,
.sb-shell .radio {
  display: flex;
  align-items: center;
  gap: var(--shell-space-2);
  font-size: var(--shell-text-base);
  cursor: pointer;
}

.sb-shell .checkbox__box {
  width: var(--shell-field-control-size);
  height: var(--shell-field-control-size);
  flex: none;
  accent-color: var(--shell-accent);
  cursor: inherit;
}

.sb-shell .radio-group {
  display: grid;
  gap: var(--shell-space-2);
}

.sb-shell .radio__box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--shell-field-control-size);
  height: var(--shell-field-control-size);
  flex: none;
  background: var(--shell-field-background);
  border: 1px solid var(--shell-input-border);
  border-radius: var(--shell-radius-pill);
}

.sb-shell .radio__box[data-state='checked'] {
  border-color: var(--shell-accent);
}

.sb-shell .radio__dot {
  width: var(--shell-field-radio-dot-size);
  height: var(--shell-field-radio-dot-size);
  border-radius: var(--shell-radius-pill);
  background: var(--shell-accent);
}

.sb-shell .switch {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--shell-space-3);
  width: fit-content;
  padding: 0;
  color: var(--shell-text-muted);
  font: inherit;
  text-align: left;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.sb-shell .switch[data-layout='spread'] {
  justify-content: space-between;
  width: 100%;
}

.sb-shell .switch__track {
  position: relative;
  box-sizing: border-box;
  width: var(--shell-control-lg);
  height: calc(var(--shell-control-sm) - var(--shell-space-1));
  flex: none;
  border: 1px solid var(--shell-text-muted);
  border-radius: var(--shell-radius-pill);
  background: var(--shell-active);
  transition:
    background var(--shell-switch-duration) ease-out,
    border-color var(--shell-switch-duration) ease-out;
}

.sb-shell .switch__track[data-on='true'] {
  border-color: var(--shell-accent);
  background: var(--shell-accent);
}

.sb-shell .switch__thumb {
  position: absolute;
  top: var(--shell-field-action-inset);
  left: var(--shell-field-action-inset);
  width: calc(var(--shell-control-sm) - var(--shell-space-2));
  height: calc(var(--shell-control-sm) - var(--shell-space-2));
  border-radius: var(--shell-field-half);
  background: var(--shell-text);
  transition: transform var(--shell-switch-duration) ease-out;
}

.sb-shell .switch__track[data-on='true'] .switch__thumb {
  background: var(--shell-accent-contrast, var(--shell-background));
  transform: translateX(var(--shell-space-3));
}
`;

function useFieldStyles(): void {
  useComponentStyles('fields', FIELD_STYLES);
}

/**
 * Form controls.
 *
 * There was no `<input>` and no `<form>` anywhere in this repository before
 * these: one `<textarea>` in the overlay and one `<select>` in the inspector,
 * each carrying its own idea of a border and a background. They now agree on
 * the published field tokens.
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
  labelAction,
  hint,
  error,
  children,
}: {
  label: string;
  labelAction?: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: (field: FieldControl) => ReactNode;
}) {
  useFieldStyles();
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="form-field">
      <div className="form-field__label-row">
        <label className="form-field__label" htmlFor={id}>
          {label}
        </label>
        {labelAction}
      </div>
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
  title,
  revealLabel = 'value',
  onBlur,
  ...field
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: 'text' | 'search' | 'password';
  testId?: string;
  title?: string;
  revealLabel?: string;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
} & Partial<FieldControl>) {
  useFieldStyles();
  const [revealed, setRevealed] = useState(false);
  const secret = type === 'password';
  const input = (
    <input
      className="input"
      type={secret && revealed ? 'text' : type}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      title={title}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      data-testid={testId}
      {...field}
    />
  );

  if (!secret) return input;

  return (
    <div className="input-shell">
      {input}
      <IconButton
        className="input-shell__action"
        label={`${revealed ? 'Hide' : 'Show'} ${revealLabel}`}
        tooltip={`${revealed ? 'Hide' : 'Show'} ${revealLabel}`}
        disabled={disabled}
        onClick={() => setRevealed((current) => !current)}
      >
        {revealed ? <EyeOff aria-hidden="true" size={14} /> : <Eye aria-hidden="true" size={14} />}
      </IconButton>
    </div>
  );
}

/** A multi-line text input. */
export function Textarea({
  value,
  onChange,
  placeholder,
  disabled,
  rows = 3,
  onBlur,
  onKeyDown,
  testId,
  ...field
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  onBlur?: (event: React.FocusEvent<HTMLTextAreaElement>) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  testId?: string;
} & Partial<FieldControl>) {
  useFieldStyles();
  return (
    <textarea
      className="input input--multiline"
      rows={rows}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
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
  useFieldStyles();
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
  useFieldStyles();
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
  useFieldStyles();
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
  displayLabel,
  tooltip,
  layout = 'compact',
  checked,
  onChange,
  disabled,
  testId,
  className,
}: {
  label: string;
  displayLabel?: ReactNode;
  tooltip?: ReactNode;
  layout?: 'spread' | 'compact';
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  testId?: string;
  className?: string;
}) {
  useFieldStyles();
  const container = useShellPortalContainer();
  const renderedLabel =
    displayLabel === undefined ? <span>{label}</span> : displayLabel;
  const track = (
    <span className="switch__track" data-on={checked}>
      <span className="switch__thumb" />
    </span>
  );
  const control = (
    <button
      type="button"
      className={`switch${className ? ` ${className}` : ''}`}
      role="switch"
      aria-label={label}
      aria-checked={checked}
      data-layout={layout}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      data-testid={testId}
    >
      {layout === 'compact' ? track : renderedLabel}
      {layout === 'compact' ? renderedLabel : track}
    </button>
  );

  if (tooltip === undefined) return control;

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{control}</Tooltip.Trigger>
      <Tooltip.Portal container={container}>
        <Tooltip.Content className="tooltip" sideOffset={6}>
          {tooltip}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
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
 * in `shell-package-rules.css` and unchanged — these are only what a description list
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
 * actually exports, rendered spans. A consuming application kept its own
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

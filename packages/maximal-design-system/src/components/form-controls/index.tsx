import { Autocomplete as BaseAutocomplete } from '@base-ui/react/autocomplete'
import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox'
import { Field as BaseField } from '@base-ui/react/field'
import { Fieldset as BaseFieldset } from '@base-ui/react/fieldset'
import { NumberField } from '@base-ui/react/number-field'
import { Radio as BaseRadio } from '@base-ui/react/radio'
import { RadioGroup as BaseRadioGroup } from '@base-ui/react/radio-group'
import { Select as BaseSelect } from '@base-ui/react/select'
import { Slider as BaseSlider } from '@base-ui/react/slider'
import { Switch as BaseSwitch } from '@base-ui/react/switch'
import { Check, ChevronDown, Minus, Plus } from 'lucide-react'
import {
  useId,
  useMemo,
  useState,
  type ComponentPropsWithRef,
  type ReactNode,
} from 'react'

export interface SelectOption<Value extends string = string> {
  value: Value
  label: ReactNode
  disabled?: boolean
}

export interface SelectProps<Value extends string = string> {
  value?: Value
  defaultValue?: Value
  onValueChange?: (value: Value) => void
  options: readonly SelectOption<Value>[]
  placeholder?: ReactNode
  label?: ReactNode
  disabled?: boolean
  required?: boolean
  name?: string
  ariaLabel?: string
  className?: string
}

export function Select<Value extends string>({
  value,
  defaultValue,
  onValueChange,
  options,
  placeholder = 'Select an option',
  label,
  disabled,
  required,
  name,
  ariaLabel,
  className,
}: SelectProps<Value>) {
  return (
    <BaseSelect.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={(next) => {
        if (next !== null) onValueChange?.(next)
      }}
      items={options}
      disabled={disabled}
      required={required}
      name={name}
    >
      {label === undefined ? null : (
        <BaseSelect.Label className="maximal-field-label">
          {label}
        </BaseSelect.Label>
      )}
      <BaseSelect.Trigger
        aria-label={ariaLabel}
        className={['maximal-select', className].filter(Boolean).join(' ')}
      >
        <BaseSelect.Value placeholder={placeholder} />
        <BaseSelect.Icon className="maximal-select__icon">
          <ChevronDown aria-hidden size={16} />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner className="maximal-popup-positioner" sideOffset={4}>
          <BaseSelect.Popup className="maximal-popup maximal-select__popup">
            <BaseSelect.List>
              {options.map((option) => (
                <BaseSelect.Item
                  className="maximal-option"
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                >
                  <BaseSelect.ItemIndicator className="maximal-option__indicator">
                    <Check aria-hidden size={16} />
                  </BaseSelect.ItemIndicator>
                  <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  )
}

export interface CheckboxProps
  extends Omit<ComponentPropsWithRef<typeof BaseCheckbox.Root>, 'children' | 'className'> {
  label: ReactNode
  className?: string
}

export function Checkbox({ label, className, ...props }: CheckboxProps) {
  return (
    <label className={['maximal-choice', className].filter(Boolean).join(' ')}>
      <BaseCheckbox.Root {...props} className="maximal-checkbox">
        <BaseCheckbox.Indicator className="maximal-checkbox__indicator">
          <Check aria-hidden size={12} />
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      <span>{label}</span>
    </label>
  )
}

export interface RadioOption<Value extends string = string> {
  value: Value
  label: ReactNode
  disabled?: boolean
}

export interface RadioProps
  extends Omit<ComponentPropsWithRef<typeof BaseRadio.Root>, 'children' | 'className'> {
  label: ReactNode
  className?: string
}

export function Radio({ label, className, ...props }: RadioProps) {
  return (
    <label className={['maximal-choice', className].filter(Boolean).join(' ')}>
      <BaseRadio.Root {...props} className="maximal-radio">
        <BaseRadio.Indicator className="maximal-radio__indicator" />
      </BaseRadio.Root>
      <span>{label}</span>
    </label>
  )
}

export interface RadioGroupProps<Value extends string = string>
  extends Omit<ComponentPropsWithRef<typeof BaseRadioGroup<Value>>, 'children' | 'className'> {
  options: readonly RadioOption<Value>[]
  className?: string
}

export function RadioGroup<Value extends string>({
  options,
  className,
  ...props
}: RadioGroupProps<Value>) {
  return (
    <BaseRadioGroup
      {...props}
      className={['maximal-radio-group', className].filter(Boolean).join(' ')}
    >
      {options.map((option) => (
        <Radio
          key={option.value}
          value={option.value}
          label={option.label}
          disabled={option.disabled}
        />
      ))}
    </BaseRadioGroup>
  )
}

export interface SwitchProps
  extends Omit<ComponentPropsWithRef<typeof BaseSwitch.Root>, 'children' | 'className'> {
  label: ReactNode
  className?: string
}

export function Switch({ label, className, ...props }: SwitchProps) {
  return (
    <label className={['maximal-choice', className].filter(Boolean).join(' ')}>
      <BaseSwitch.Root {...props} className="maximal-switch">
        <BaseSwitch.Thumb className="maximal-switch__thumb" />
      </BaseSwitch.Root>
      <span>{label}</span>
    </label>
  )
}

export interface SliderProps
  extends Omit<ComponentPropsWithRef<typeof BaseSlider.Root<number>>, 'children' | 'className'> {
  label: ReactNode
  className?: string
}

export function Slider({ label, className, ...props }: SliderProps) {
  return (
    <BaseSlider.Root
      {...props}
      className={['maximal-slider', className].filter(Boolean).join(' ')}
    >
      <span className="maximal-slider__header">
        <BaseSlider.Label className="maximal-field-label">{label}</BaseSlider.Label>
        <BaseSlider.Value className="maximal-field-description" />
      </span>
      <BaseSlider.Control className="maximal-slider__control">
        <BaseSlider.Track className="maximal-slider__track">
          <BaseSlider.Indicator className="maximal-slider__indicator" />
          <BaseSlider.Thumb className="maximal-slider__thumb" />
        </BaseSlider.Track>
      </BaseSlider.Control>
    </BaseSlider.Root>
  )
}

export const Slide = Slider

export interface NumberInputProps
  extends Omit<
    ComponentPropsWithRef<typeof NumberField.Root>,
    'children' | 'className' | 'onValueCommitted'
  > {
  label?: ReactNode
  onCommit?: (value: number | null) => void
  className?: string
}

export function NumberInput({
  label,
  onCommit,
  className,
  ...props
}: NumberInputProps) {
  return (
    <NumberField.Root
      {...props}
      onValueCommitted={(value) => onCommit?.(value)}
      className={['maximal-number-input', className].filter(Boolean).join(' ')}
    >
      {label === undefined ? null : (
        <label className="maximal-field-label">{label}</label>
      )}
      <NumberField.Group className="maximal-number-input__group">
        <NumberField.Decrement
          className="maximal-number-input__stepper"
          aria-label="Decrease value"
        >
          <Minus aria-hidden size={12} />
        </NumberField.Decrement>
        <NumberField.Input className="maximal-number-input__input" />
        <NumberField.Increment
          className="maximal-number-input__stepper"
          aria-label="Increase value"
        >
          <Plus aria-hidden size={12} />
        </NumberField.Increment>
      </NumberField.Group>
    </NumberField.Root>
  )
}

export interface MeasurementUnit<Unit extends string = string> {
  value: Unit
  label: string
  aliases?: readonly string[]
  step: number
  fromCanonical: (value: number) => number
  toCanonical: (value: number) => number
}

export interface UnitValueInputProps<Unit extends string = string> {
  label: ReactNode
  value: number
  units: readonly MeasurementUnit<Unit>[]
  defaultUnit: Unit
  minimum?: number
  maximum?: number
  canonicalStep?: number
  disabled?: boolean
  onCommit: (value: number) => void
  className?: string
}

export function UnitValueInput<Unit extends string>({
  label,
  value,
  units,
  defaultUnit,
  minimum,
  maximum,
  canonicalStep,
  disabled,
  onCommit,
  className,
}: UnitValueInputProps<Unit>) {
  if (units.length === 0) throw new Error('UnitValueInput requires at least one unit')

  const [unitValue, setUnitValue] = useState(defaultUnit)
  const selectedUnit = useMemo(
    () => units.find((unit) => unit.value === unitValue) ?? units[0]!,
    [unitValue, units],
  )
  const displayedValue = selectedUnit.fromCanonical(value)

  const commit = (next: number | null) => {
    if (next === null) return
    const converted = selectedUnit.toCanonical(next)
    const canonical = canonicalStep === undefined
      ? converted
      : Number((Math.round(converted / canonicalStep) * canonicalStep).toFixed(10))
    if (
      Number.isFinite(canonical)
      && (minimum === undefined || canonical >= minimum)
      && (maximum === undefined || canonical <= maximum)
    ) {
      onCommit(canonical)
    }
  }

  return (
    <div className={['maximal-unit-value', className].filter(Boolean).join(' ')}>
      <NumberInput
        label={label}
        value={displayedValue}
        step={selectedUnit.step}
        disabled={disabled}
        onCommit={commit}
      />
      <Select
        ariaLabel="Unit"
        value={selectedUnit.value}
        options={units.map((unit) => ({ value: unit.value, label: unit.label }))}
        disabled={disabled}
        onValueChange={setUnitValue}
      />
    </div>
  )
}

export interface FieldProps
  extends Omit<ComponentPropsWithRef<typeof BaseField.Root>, 'children' | 'className'> {
  label: ReactNode
  description?: ReactNode
  error?: ReactNode
  className?: string
  textareaProps?: Omit<
    ComponentPropsWithRef<'textarea'>,
    'aria-describedby' | 'aria-invalid' | 'className'
  >
}

export function Field({
  label,
  description,
  error,
  className,
  textareaProps,
  ...props
}: FieldProps) {
  return (
    <BaseField.Root
      {...props}
      className={['maximal-field', className].filter(Boolean).join(' ')}
      invalid={props.invalid ?? error !== undefined}
    >
      <BaseField.Label className="maximal-field-label">{label}</BaseField.Label>
      <BaseField.Control
        className="maximal-textarea"
        render={<textarea {...textareaProps} />}
      />
      {description === undefined ? null : (
        <BaseField.Description className="maximal-field-description">
          {description}
        </BaseField.Description>
      )}
      {error === undefined ? null : (
        <BaseField.Error className="maximal-field-error" match>
          {error}
        </BaseField.Error>
      )}
    </BaseField.Root>
  )
}

export interface FieldsetProps
  extends Omit<ComponentPropsWithRef<typeof BaseFieldset.Root>, 'children' | 'className'> {
  legend: ReactNode
  children: ReactNode
  className?: string
}

export function Fieldset({
  legend,
  children,
  className,
  ...props
}: FieldsetProps) {
  return (
    <BaseFieldset.Root
      {...props}
      className={['maximal-fieldset', className].filter(Boolean).join(' ')}
    >
      <BaseFieldset.Legend className="maximal-fieldset__legend">
        {legend}
      </BaseFieldset.Legend>
      {children}
    </BaseFieldset.Root>
  )
}

export interface AutocompleteProps {
  label: ReactNode
  items: readonly string[]
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function Autocomplete({
  label,
  items,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  disabled,
  className,
}: AutocompleteProps) {
  const labelId = useId()

  return (
    <div className={['maximal-autocomplete', className].filter(Boolean).join(' ')}>
      <label className="maximal-field-label" id={labelId}>
        {label}
      </label>
      <BaseAutocomplete.Root
        items={items}
        value={value}
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        disabled={disabled}
        openOnInputClick
      >
        <BaseAutocomplete.InputGroup className="maximal-autocomplete__input-group">
          <BaseAutocomplete.Input
            className="maximal-autocomplete__input"
            aria-labelledby={labelId}
            placeholder={placeholder}
          />
        </BaseAutocomplete.InputGroup>
        <BaseAutocomplete.Portal>
          <BaseAutocomplete.Positioner
            className="maximal-popup-positioner"
            sideOffset={4}
          >
            <BaseAutocomplete.Popup className="maximal-popup maximal-autocomplete__popup">
              <BaseAutocomplete.Empty className="maximal-option maximal-option--empty">
                No results
              </BaseAutocomplete.Empty>
              <BaseAutocomplete.List>
                {(item: string) => (
                  <BaseAutocomplete.Item
                    className="maximal-option"
                    key={item}
                    value={item}
                  >
                    {item}
                  </BaseAutocomplete.Item>
                )}
              </BaseAutocomplete.List>
            </BaseAutocomplete.Popup>
          </BaseAutocomplete.Positioner>
        </BaseAutocomplete.Portal>
      </BaseAutocomplete.Root>
    </div>
  )
}

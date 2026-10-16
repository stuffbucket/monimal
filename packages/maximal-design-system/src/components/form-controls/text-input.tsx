import { Field as BaseField } from '@base-ui/react/field'
import { Input as BaseInput } from '@base-ui/react/input'
import type { ComponentPropsWithRef, ReactNode } from 'react'

export interface TextInputProps
  extends Omit<ComponentPropsWithRef<typeof BaseInput>, 'className'> {
  label: ReactNode
  description?: ReactNode
  error?: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
  showLabel?: boolean
  className?: string
  inputClassName?: string
}

export function TextInput({
  label,
  description,
  error,
  leading,
  trailing,
  showLabel = true,
  className,
  inputClassName,
  ...props
}: TextInputProps) {
  return (
    <BaseField.Root
      className={['maximal-text-input', className].filter(Boolean).join(' ')}
      disabled={props.disabled}
      invalid={error !== undefined}
    >
      <BaseField.Label
        className={[
          'maximal-field-label',
          !showLabel && 'maximal-visually-hidden',
        ].filter(Boolean).join(' ')}
      >
        {label}
      </BaseField.Label>
      <div className="maximal-text-input__group">
        {leading === undefined ? null : (
          <span className="maximal-text-input__adornment">{leading}</span>
        )}
        <BaseInput
          {...props}
          className={[
            'maximal-text-input__input',
            inputClassName,
          ].filter(Boolean).join(' ')}
        />
        {trailing === undefined ? null : (
          <span className="maximal-text-input__adornment">{trailing}</span>
        )}
      </div>
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

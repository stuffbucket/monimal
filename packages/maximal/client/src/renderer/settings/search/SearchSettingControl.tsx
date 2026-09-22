import { type ReactElement, type ReactNode, useState } from 'react'
import { Info } from 'lucide-react'

import {
  FormField,
  Select,
  Switch,
  Textarea,
  TextInput,
} from 'stuffbucket-electron/renderer'

import type {
  ConnectorSettingField,
  ConnectorSettingValue,
} from '../capabilities'
import {
  displayedInteger,
  displayedIntegerBound,
  formatStringList,
  parseStringList,
  persistedInteger,
  textSettingUpdate,
} from './search-field-state'
import { sameItems } from './search-settings-helpers'

interface SearchSettingControlProps {
  field: ConnectorSettingField
  testId: string
  value: ConnectorSettingValue
  disabled: boolean
  secretSource?: 'environment' | 'settings'
  clearing?: boolean
  error?: string
  labelAction?: ReactNode
  tooltip?: ReactNode
  onChange: (value: ConnectorSettingValue | null) => void
}

function fieldHint({
  field,
  secretSource,
  clearing,
}: Pick<SearchSettingControlProps, 'field' | 'secretSource' | 'clearing'>): ReactNode | undefined {
  const details = [field.description, field.emptyDescription]
  if (secretSource === 'environment') {
    details.push('Provided by the environment until you save an override.')
  } else if (secretSource === 'settings') {
    details.push('A value is stored in settings.')
  }
  if (clearing) details.push('The stored value will be cleared when you save.')
  const text = details.filter(Boolean).join(' ')
  if (field.helpLink === undefined) return text || undefined
  return (
    <>
      {text ? `${text} ` : null}
      <a href={field.helpLink.url} target="_blank" rel="noreferrer">
        {field.helpLink.label}
      </a>
      .
    </>
  )
}

function StringListControl({
  control,
  value,
  disabled,
  testId,
  onChange,
}: {
  control: {
    id: string
    'aria-describedby': string | undefined
    'aria-invalid': boolean | undefined
  }
  value: readonly string[]
  disabled: boolean
  testId: string
  onChange: (value: ConnectorSettingValue | null) => void
}): ReactElement {
  const [text, setText] = useState(() => formatStringList(value))
  const [previousValue, setPreviousValue] = useState(value)
  if (previousValue !== value) {
    setPreviousValue(value)
    if (!sameItems(parseStringList(text), value)) {
      setText(formatStringList(value))
    }
  }

  return (
    <Textarea
      {...control}
      value={text}
      rows={3}
      disabled={disabled}
      testId={testId}
      onChange={(next) => {
        setText(next)
        onChange(parseStringList(next))
      }}
      onBlur={() => setText(formatStringList(parseStringList(text)))}
    />
  )
}

export function SearchSettingControl({
  field,
  testId,
  value,
  disabled,
  secretSource,
  clearing = false,
  error,
  labelAction,
  tooltip,
  onChange,
}: SearchSettingControlProps): ReactElement {
  const hint = fieldHint({ field, secretSource, clearing })
  if (field.type === 'boolean') {
    return (
      <div className="settings-field">
        <Switch
          label={field.label}
          displayLabel={
            tooltip === undefined
              ? undefined
              : (
                  <span className="search-behavior__switch-label">
                    {field.label}
                    <Info size={13} aria-hidden="true" />
                  </span>
                )
          }
          tooltip={tooltip}
          checked={value === true}
          disabled={disabled}
          onChange={onChange}
          testId={testId}
        />
        {hint ? <span className="settings-list__detail">{hint}</span> : null}
      </div>
    )
  }

  return (
    <FormField
      label={field.label}
      labelAction={labelAction}
      hint={hint}
      error={error}
    >
      {(control) => {
        if (field.type === 'integer') {
          return (
            <input
              {...control}
              className="input"
              type="number"
              value={displayedInteger(field, value)}
              min={displayedIntegerBound(field, field.min)}
              max={displayedIntegerBound(field, field.max)}
              step={1}
              disabled={disabled}
              title={error}
              data-testid={testId}
              onChange={(event) => {
                const next = event.target.value
                onChange(persistedInteger(field, next))
              }}
            />
          )
        }
        if (field.type === 'string-list') {
          return (
            <StringListControl
              control={control}
              value={Array.isArray(value) ? value : []}
              disabled={disabled}
              testId={testId}
              onChange={onChange}
            />
          )
        }
        if (field.type === 'select') {
          return (
            <Select
              {...control}
              value={typeof value === 'string' ? value : ''}
              options={field.options}
              disabled={disabled}
              testId={testId}
              onChange={onChange}
            />
          )
        }
        return (
          <TextInput
            {...control}
            value={typeof value === 'string' ? value : ''}
            type={field.type === 'secret' ? 'password' : 'text'}
            revealLabel={field.label}
            placeholder={field.placeholder}
            disabled={disabled}
            title={error}
            testId={testId}
            onChange={(next) => onChange(textSettingUpdate(field, next))}
          />
        )
      }}
    </FormField>
  )
}
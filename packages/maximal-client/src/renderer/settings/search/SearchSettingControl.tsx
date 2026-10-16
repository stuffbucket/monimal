import { type ReactElement, type ReactNode, useState } from 'react'
import { Eye, EyeOff, Info } from 'lucide-react'

import {
  Field,
  IconButton,
  NumberInput,
  Select,
  Switch,
  TextInput,
  Tooltip,
} from '@maximal/maximal-design-system'

import { ControlNotes } from '../ControlNotes'

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
  label,
  hint,
  error,
  value,
  disabled,
  testId,
  onChange,
}: {
  label: ReactNode
  hint: ReactNode | undefined
  error: string | undefined
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
    <Field
      label={label}
      description={hint}
      error={error}
      disabled={disabled}
      textareaProps={{
        value: text,
        rows: 3,
        disabled,
        'data-testid': testId,
        onChange: (event) => {
          const next = event.currentTarget.value
          setText(next)
          onChange(parseStringList(next))
        },
        onBlur: () => setText(formatStringList(parseStringList(text))),
      }}
    />
  )
}

function integerValue(
  field: ConnectorSettingField,
  value: ConnectorSettingValue,
): number | null {
  const displayed = displayedInteger(field, value)
  return displayed === '' ? null : displayed
}

function SecretToggle({
  label,
  revealed,
  onToggle,
}: {
  label: string
  revealed: boolean
  onToggle: () => void
}): ReactElement {
  return (
    <IconButton
      label={`${revealed ? 'Hide' : 'Show'} ${label}`}
      onClick={onToggle}
    >
      {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
    </IconButton>
  )
}

function BooleanSettingControl({
  label,
  hint,
  tooltip,
  checked,
  disabled,
  testId,
  onChange,
}: {
  label: string
  hint: ReactNode | undefined
  tooltip: ReactNode | undefined
  checked: boolean
  disabled: boolean
  testId: string
  onChange: (value: boolean) => void
}): ReactElement {
  return (
    <div className="settings-field">
      {tooltip === undefined
        ? (
            <Switch
              label={label}
              checked={checked}
              disabled={disabled}
              onCheckedChange={onChange}
              data-testid={testId}
            />
          )
        : (
            <Tooltip
              trigger={(
                <Switch
                  aria-label={label}
                  label={(
                    <span className="search-behavior__switch-label">
                      {label}
                      <Info size={12} aria-hidden="true" />
                    </span>
                  )}
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={onChange}
                  data-testid={testId}
                />
              )}
            >
              {tooltip}
            </Tooltip>
          )}
      {hint ? <span className="settings-list__detail">{hint}</span> : null}
    </div>
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
      <BooleanSettingControl
        label={field.label}
        hint={hint}
        tooltip={tooltip}
        checked={value === true}
        disabled={disabled}
        testId={testId}
        onChange={onChange}
      />
    )
  }

  const label = labelAction === undefined
    ? field.label
    : (
        <>
          {field.label}
          {labelAction}
        </>
      )

  if (field.type === 'string-list') {
    return (
      <StringListControl
        label={label}
        hint={hint}
        error={error}
        value={Array.isArray(value) ? value : []}
        disabled={disabled}
        testId={testId}
        onChange={onChange}
      />
    )
  }

  if (field.type === 'string' || field.type === 'secret') {
    return (
      <TextSettingInput
        field={field}
        label={label}
        hint={hint}
        error={error}
        value={typeof value === 'string' ? value : ''}
        disabled={disabled}
        testId={testId}
        onChange={onChange}
      />
    )
  }

  return (
    <ControlNotes hint={hint} error={error}>
      {(describedBy) => field.type === 'integer'
        ? (
            <NumberInput
              label={label}
              value={integerValue(field, value)}
              min={displayedIntegerBound(field, field.min)}
              max={displayedIntegerBound(field, field.max)}
              step={1}
              disabled={disabled}
              onValueChange={(next) => {
                onChange(persistedInteger(field, next === null ? '' : String(next)))
              }}
              inputProps={{
                'aria-describedby': describedBy,
                'data-testid': testId,
              }}
            />
          )
        : (
            <Select
              label={label}
              value={typeof value === 'string' ? value : ''}
              options={field.type === 'select' ? field.options : []}
              disabled={disabled}
              onValueChange={onChange}
              triggerProps={{
                'aria-describedby': describedBy,
                'data-testid': testId,
              }}
            />
          )}
    </ControlNotes>
  )
}

function TextSettingInput({
  field,
  label,
  hint,
  error,
  value,
  disabled,
  testId,
  onChange,
}: {
  field: Extract<ConnectorSettingField, { type: 'string' | 'secret' }>
  label: ReactNode
  hint: ReactNode | undefined
  error: string | undefined
  value: string
  disabled: boolean
  testId: string
  onChange: (value: ConnectorSettingValue | null) => void
}): ReactElement {
  const [revealed, setRevealed] = useState(false)
  const secret = field.type === 'secret'
  return (
    <TextInput
      label={label}
      description={hint}
      error={error}
      value={value}
      type={secret && !revealed ? 'password' : 'text'}
      placeholder={field.placeholder}
      disabled={disabled}
      data-testid={testId}
      trailing={secret
        ? (
            <SecretToggle
              label={field.label}
              revealed={revealed}
              onToggle={() => setRevealed((current) => !current)}
            />
          )
        : undefined}
      onChange={(event) => onChange(textSettingUpdate(field, event.currentTarget.value))}
    />
  )
}

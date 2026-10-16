import { Eye, EyeOff } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import {
  IconButton,
  StatusChip,
  TextInput,
  type TextInputProps,
} from '@maximal/maximal-design-system'

export interface SettingsTextInputProps
  extends Omit<TextInputProps, 'label' | 'onChange' | 'trailing' | 'type'> {
  label: ReactNode
  onValueChange: (value: string) => void
  secret?: boolean
  revealLabel?: string
  available?: boolean
}

export function SettingsTextInput({
  label,
  onValueChange,
  secret = false,
  revealLabel = 'value',
  available = false,
  disabled,
  ...props
}: SettingsTextInputProps) {
  const [revealed, setRevealed] = useState(false)
  const type = secret && !revealed ? 'password' : 'text'
  const trailing = (
    <>
      {available ? (
        <StatusChip label="Available" status="ready" />
      ) : null}
      {secret ? (
        <IconButton
          disabled={disabled}
          label={`${revealed ? 'Hide' : 'Show'} ${revealLabel}`}
          onClick={() => setRevealed((current) => !current)}
          type="button"
        >
          {revealed
            ? <EyeOff aria-hidden size={16} />
            : <Eye aria-hidden size={16} />}
        </IconButton>
      ) : null}
    </>
  )

  return (
    <TextInput
      {...props}
      disabled={disabled}
      label={label}
      onChange={(event) => onValueChange(event.currentTarget.value)}
      trailing={available || secret ? trailing : undefined}
      type={type}
    />
  )
}

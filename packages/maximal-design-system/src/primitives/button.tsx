import { Button as BaseButton } from '@base-ui/react/button'
import type { ComponentPropsWithRef, ReactNode } from 'react'

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'secondary-danger'
  | 'inverse'
  | 'link'
  | 'ghost'

export interface ButtonProps
  extends Omit<ComponentPropsWithRef<typeof BaseButton>, 'className'> {
  variant?: ButtonVariant
  className?: string
  children: ReactNode
}

export function Button({
  variant = 'secondary',
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <BaseButton
      {...props}
      className={['maximal-button', className].filter(Boolean).join(' ')}
      data-variant={variant}
    >
      {children}
    </BaseButton>
  )
}

export interface ControlButtonProps
  extends Omit<ComponentPropsWithRef<typeof BaseButton>, 'className'> {
  className?: string
}

export function ControlButton({
  className,
  ...props
}: ControlButtonProps) {
  return (
    <BaseButton
      {...props}
      className={['maximal-control-button', className].filter(Boolean).join(' ')}
    />
  )
}

export interface ToggleButtonProps
  extends Omit<ControlButtonProps, 'aria-pressed'> {
  selected: boolean
}

export function ToggleButton({
  selected,
  ...props
}: ToggleButtonProps) {
  return (
    <ControlButton
      {...props}
      aria-pressed={selected}
      data-selected={selected ? '' : undefined}
    />
  )
}

export type IconButtonVariant = 'default' | 'toggle' | 'grounded'

export interface IconButtonProps
  extends Omit<ComponentPropsWithRef<typeof BaseButton>, 'aria-label' | 'className'> {
  label: string
  variant?: IconButtonVariant
  selected?: boolean
  className?: string
  children: ReactNode
}

export function IconButton({
  label,
  variant = 'default',
  selected = false,
  className,
  children,
  ...props
}: IconButtonProps) {
  return (
    <BaseButton
      {...props}
      aria-label={label}
      className={['maximal-icon-button', className].filter(Boolean).join(' ')}
      data-selected={selected ? '' : undefined}
      data-variant={variant}
    >
      {children}
    </BaseButton>
  )
}

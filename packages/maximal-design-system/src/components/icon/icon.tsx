import type {
  ComponentPropsWithoutRef,
} from 'react'
import { cloneElement, type ReactElement } from 'react'

export type IconSize = 'compact' | 'standard' | 'prominent'

export interface IconComponentProps
  extends Omit<ComponentPropsWithoutRef<'span'>, 'children'> {
  children: ReactElement<ComponentPropsWithoutRef<'svg'>>
  label?: string
  size?: IconSize
}

export function Icon({
  children,
  label,
  size = 'standard',
  className,
  ...props
}: IconComponentProps) {
  const glyph = cloneElement(children, {
    'aria-hidden': true,
    focusable: false,
  })

  return (
    <span
      {...props}
      aria-hidden={label === undefined ? 'true' : undefined}
      aria-label={label}
      className={['maximal-icon', className].filter(Boolean).join(' ')}
      data-size={size}
      role={label === undefined ? undefined : 'img'}
    >
      {glyph}
    </span>
  )
}

import { Tabs } from '@base-ui/react/tabs'
import type {
  ComponentPropsWithRef,
  ReactNode,
} from 'react'

import { CloseIcon } from '../icons'

type BaseTabProps = ComponentPropsWithRef<typeof Tabs.Tab>
type TabAuxClickEvent = Parameters<NonNullable<BaseTabProps['onAuxClick']>>[0]
type TabKeyDownEvent = Parameters<NonNullable<BaseTabProps['onKeyDown']>>[0]

export interface TabProps
  extends Omit<BaseTabProps, 'children' | 'className'> {
  label: ReactNode
  icon?: ReactNode
  active?: boolean
  closable?: boolean
  onClose?: () => void
  className?: string
}

export function Tab({
  label,
  icon,
  active = false,
  closable = true,
  onClose,
  className,
  onAuxClick,
  onKeyDown,
  ...props
}: TabProps) {
  const canClose = closable && onClose !== undefined

  const handleAuxClick = (event: TabAuxClickEvent) => {
    onAuxClick?.(event)
    if (!event.defaultPrevented && canClose && event.button === 1) onClose()
  }

  const handleKeyDown = (event: TabKeyDownEvent) => {
    onKeyDown?.(event)
    if (
      !event.defaultPrevented
      && canClose
      && (event.key === 'Delete' || event.key === 'Backspace')
    ) {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <Tabs.Tab
      {...props}
      className={['maximal-tab', className].filter(Boolean).join(' ')}
      onAuxClick={handleAuxClick}
      onKeyDown={handleKeyDown}
    >
      {icon}
      <span>{label}</span>
      {active && closable ? (
        <CloseIcon
          className="maximal-tab__close-icon"
          onClick={
            onClose
              ? (event) => {
                  event.stopPropagation()
                  onClose()
                }
              : undefined
          }
        />
      ) : null}
    </Tabs.Tab>
  )
}

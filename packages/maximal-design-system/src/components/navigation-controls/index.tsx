import { Tabs as BaseTabs } from '@base-ui/react/tabs'
import { Toggle as BaseToggle } from '@base-ui/react/toggle'
import { ToggleGroup as BaseToggleGroup } from '@base-ui/react/toggle-group'
import { Toolbar as BaseToolbar } from '@base-ui/react/toolbar'
import type {
  ComponentPropsWithRef,
  ReactNode,
} from 'react'

import { Tab } from '../tab'

export interface TabsItem<Value extends string = string> {
  value: Value
  label: ReactNode
  icon?: ReactNode
  content: ReactNode
  disabled?: boolean
}

export interface TabsProps<Value extends string = string>
  extends Omit<ComponentPropsWithRef<typeof BaseTabs.Root>, 'children' | 'className'> {
  items: readonly TabsItem<Value>[]
  className?: string
}

export function Tabs<Value extends string>({
  items,
  value,
  defaultValue,
  className,
  ...props
}: TabsProps<Value>) {
  const selectedValue = value ?? defaultValue

  return (
    <BaseTabs.Root
      {...props}
      value={value}
      defaultValue={defaultValue}
      className={['maximal-tabs', className].filter(Boolean).join(' ')}
    >
      <BaseTabs.List className="maximal-tabs__list">
        {items.map((item) => (
          <Tab
            key={item.value}
            value={item.value}
            label={item.label}
            icon={item.icon}
            active={item.value === selectedValue}
            closable={false}
            disabled={item.disabled}
          />
        ))}
        <BaseTabs.Indicator className="maximal-tabs__indicator" />
      </BaseTabs.List>
      {items.map((item) => (
        <BaseTabs.Panel
          className="maximal-tabs__panel"
          key={item.value}
          value={item.value}
        >
          {item.content}
        </BaseTabs.Panel>
      ))}
    </BaseTabs.Root>
  )
}

export interface ToolbarProps
  extends Omit<ComponentPropsWithRef<typeof BaseToolbar.Root>, 'children' | 'className'> {
  children: ReactNode
  className?: string
}

export function Toolbar({
  children,
  className,
  ...props
}: ToolbarProps) {
  return (
    <BaseToolbar.Root
      {...props}
      className={['maximal-toolbar', className].filter(Boolean).join(' ')}
    >
      {children}
    </BaseToolbar.Root>
  )
}

export interface ToolbarGroupProps
  extends Omit<ComponentPropsWithRef<typeof BaseToolbar.Group>, 'children' | 'className'> {
  children: ReactNode
  className?: string
}

export function ToolbarGroup({
  children,
  className,
  ...props
}: ToolbarGroupProps) {
  return (
    <BaseToolbar.Group
      {...props}
      className={['maximal-toolbar__group', className].filter(Boolean).join(' ')}
    >
      {children}
    </BaseToolbar.Group>
  )
}

export interface ToolbarButtonProps
  extends Omit<ComponentPropsWithRef<typeof BaseToolbar.Button>, 'className'> {
  className?: string
}

export function ToolbarButton({ className, ...props }: ToolbarButtonProps) {
  return (
    <BaseToolbar.Button
      {...props}
      className={['maximal-toolbar__button', className].filter(Boolean).join(' ')}
    />
  )
}

export interface ToggleGroupOption<Value extends string = string> {
  value: Value
  label: ReactNode
  disabled?: boolean
}

export interface ToggleGroupProps<Value extends string = string>
  extends Omit<ComponentPropsWithRef<typeof BaseToggleGroup<Value>>, 'children' | 'className'> {
  options: readonly ToggleGroupOption<Value>[]
  className?: string
}

export function ToggleGroup<Value extends string>({
  options,
  className,
  ...props
}: ToggleGroupProps<Value>) {
  return (
    <BaseToggleGroup
      {...props}
      className={['maximal-toggle-group', className].filter(Boolean).join(' ')}
    >
      {options.map((option) => (
        <BaseToggle
          className="maximal-toggle-group__item"
          disabled={option.disabled}
          key={option.value}
          value={option.value}
        >
          {option.label}
        </BaseToggle>
      ))}
    </BaseToggleGroup>
  )
}

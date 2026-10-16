import { Menu as BaseMenu } from '@base-ui/react/menu'
import { Check, ChevronRight } from 'lucide-react'
import { useRef } from 'react'
import type {
  ComponentPropsWithRef,
  HTMLAttributes,
  ReactElement,
  ReactNode,
  RefObject,
} from 'react'

import type { DataAttributes } from '../element-attributes'
import { MenuPopupScrollbar, MenuScrollViewport, mergeRefs } from './menu-scroll'

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export type MenuVariant = 'default' | 'search'

export interface MenuProps extends HTMLAttributes<HTMLDivElement>, DataAttributes {
  variant?: MenuVariant
}

export function Menu({
  variant = 'default',
  className,
  ...props
}: MenuProps) {
  return (
    <div
      {...props}
      className={classes(
        'maximal-menu',
        variant === 'search' && 'maximal-menu--search',
        className,
      )}
    />
  )
}

type MenuPopupProps = Omit<
  ComponentPropsWithRef<typeof BaseMenu.Popup>,
  'children' | 'className'
> & DataAttributes & { className?: string }

export interface MenuRootProps
  extends Omit<ComponentPropsWithRef<typeof BaseMenu.Root>, 'children'> {
  trigger: ReactElement
  children: ReactNode
  align?: ComponentPropsWithRef<typeof BaseMenu.Positioner>['align']
  side?: ComponentPropsWithRef<typeof BaseMenu.Positioner>['side']
  sideOffset?: number
  container?:
    | HTMLElement
    | ShadowRoot
    | RefObject<HTMLElement | ShadowRoot | null>
    | null
  popupProps?: MenuPopupProps
}

export function MenuRoot({
  trigger,
  children,
  align,
  side,
  sideOffset = 4,
  container,
  popupProps,
  loopFocus = false,
  ...props
}: MenuRootProps) {
  const popup = useRef<HTMLDivElement>(null)
  return (
    <BaseMenu.Root loopFocus={loopFocus} {...props}>
      <BaseMenu.Trigger render={trigger} />
      <BaseMenu.Portal container={container}>
        <BaseMenu.Positioner
          align={align}
          className="maximal-popup-positioner"
          side={side}
          sideOffset={sideOffset}
        >
          <BaseMenu.Popup
            {...popupProps}
            ref={mergeRefs(popup, popupProps?.ref)}
            className={classes(
              'maximal-popup maximal-menu',
              popupProps?.className,
            )}
            tabIndex={popupProps?.tabIndex ?? 0}
          >
            <MenuScrollViewport>{children}</MenuScrollViewport>
          </BaseMenu.Popup>
          <MenuPopupScrollbar popup={popup} />
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  )
}

export interface MenuGroupProps
  extends Omit<ComponentPropsWithRef<typeof BaseMenu.Group>, 'className'> {
  label?: ReactNode
  className?: string
}

export function MenuGroup({
  label,
  className,
  children,
  ...props
}: MenuGroupProps) {
  return (
    <BaseMenu.Group
      {...props}
      className={classes('maximal-menu__group', className)}
    >
      {label === undefined ? null : (
        <BaseMenu.GroupLabel className="maximal-menu__heading">
          {label}
        </BaseMenu.GroupLabel>
      )}
      {children}
    </BaseMenu.Group>
  )
}

export interface MenuItemContentProps {
  children: ReactNode
  leading?: ReactNode
  description?: ReactNode
  trailing?: ReactNode
}

export function MenuItemContent({
  children,
  leading,
  description,
  trailing,
}: MenuItemContentProps) {
  return (
    <>
      {leading === undefined ? null : (
        <span className="maximal-menu-item__leading">{leading}</span>
      )}
      <span className="maximal-menu-item__content">
        <span className="maximal-menu-item__label">{children}</span>
        {description === undefined ? null : (
          <span className="maximal-menu-item__description">{description}</span>
        )}
      </span>
      {trailing === undefined ? null : (
        <span className="maximal-menu-item__trailing">{trailing}</span>
      )}
    </>
  )
}

export interface MenuItemProps
  extends Omit<
    ComponentPropsWithRef<typeof BaseMenu.Item>,
    'children' | 'className'
  >,
  MenuItemContentProps {
  className?: string
}

export function MenuItem({
  children,
  leading,
  description,
  trailing,
  className,
  ...props
}: MenuItemProps) {
  return (
    <BaseMenu.Item
      {...props}
      className={classes('maximal-menu-item', className)}
    >
      <MenuItemContent
        description={description}
        leading={leading}
        trailing={trailing}
      >
        {children}
      </MenuItemContent>
    </BaseMenu.Item>
  )
}

export interface MenuCheckboxItemProps
  extends Omit<
    ComponentPropsWithRef<typeof BaseMenu.CheckboxItem>,
    'children' | 'className'
  >,
  Omit<MenuItemContentProps, 'leading' | 'trailing'> {
  leading?: ReactNode
  trailing?: ReactNode
  indicatorPosition?: 'leading' | 'trailing'
  className?: string
}

export function MenuCheckboxItem({
  children,
  leading,
  description,
  trailing,
  indicatorPosition = 'leading',
  className,
  ...props
}: MenuCheckboxItemProps) {
  const indicator = (
    <BaseMenu.CheckboxItemIndicator
      className={classes(
        'maximal-menu-item__selection',
        indicatorPosition === 'trailing' && 'maximal-checkbox',
      )}
      keepMounted
    >
      <Check aria-hidden size={12} />
    </BaseMenu.CheckboxItemIndicator>
  )
  return (
    <BaseMenu.CheckboxItem
      {...props}
      className={classes(
        'maximal-menu-item',
        `maximal-menu-item--selection-${indicatorPosition}`,
        className,
      )}
    >
      <MenuItemContent
        description={description}
        leading={indicatorPosition === 'leading' ? indicator : leading}
        trailing={indicatorPosition === 'trailing' ? (
          <>
            {trailing}
            {indicator}
          </>
        ) : trailing}
      >
        {children}
      </MenuItemContent>
    </BaseMenu.CheckboxItem>
  )
}

export interface MenuRadioGroupProps
  extends ComponentPropsWithRef<typeof BaseMenu.RadioGroup> {}

export function MenuRadioGroup(props: MenuRadioGroupProps) {
  return <BaseMenu.RadioGroup {...props} />
}

export interface MenuRadioItemProps
  extends Omit<
    ComponentPropsWithRef<typeof BaseMenu.RadioItem>,
    'children' | 'className'
  >,
  Omit<MenuItemContentProps, 'leading'> {
  className?: string
}

export function MenuRadioItem({
  children,
  description,
  trailing,
  className,
  ...props
}: MenuRadioItemProps) {
  return (
    <BaseMenu.RadioItem
      {...props}
      className={classes('maximal-menu-item', className)}
    >
      <MenuItemContent
        description={description}
        leading={
          <BaseMenu.RadioItemIndicator
            className="maximal-menu-item__selection"
            keepMounted
          >
            <Check aria-hidden size={12} />
          </BaseMenu.RadioItemIndicator>
        }
        trailing={trailing}
      >
        {children}
      </MenuItemContent>
    </BaseMenu.RadioItem>
  )
}

export interface MenuSubmenuProps {
  label: ReactNode
  children: ReactNode
  leading?: ReactNode
  disabled?: boolean
  popupProps?: MenuPopupProps
}

export function MenuSubmenu({
  label,
  children,
  leading,
  disabled,
  popupProps,
}: MenuSubmenuProps) {
  const popup = useRef<HTMLDivElement>(null)
  return (
    <BaseMenu.SubmenuRoot>
      <BaseMenu.SubmenuTrigger
        className="maximal-menu-item"
        disabled={disabled}
      >
        <MenuItemContent
          leading={leading}
          trailing={<ChevronRight aria-hidden size={16} />}
        >
          {label}
        </MenuItemContent>
      </BaseMenu.SubmenuTrigger>
      <BaseMenu.Portal>
        <BaseMenu.Positioner
          align="start"
          className="maximal-popup-positioner"
          side="right"
          sideOffset={4}
        >
          <BaseMenu.Popup
            {...popupProps}
            ref={mergeRefs(popup, popupProps?.ref)}
            className={classes(
              'maximal-popup maximal-menu',
              popupProps?.className,
            )}
            tabIndex={popupProps?.tabIndex ?? 0}
          >
            <MenuScrollViewport>{children}</MenuScrollViewport>
          </BaseMenu.Popup>
          <MenuPopupScrollbar popup={popup} />
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.SubmenuRoot>
  )
}

export interface MenuSeparatorProps extends HTMLAttributes<HTMLHRElement> {}

export function MenuSeparator({ className, ...props }: MenuSeparatorProps) {
  return (
    <hr
      {...props}
      className={classes('maximal-menu__separator', className)}
    />
  )
}

export interface MenuFooterProps
  extends Omit<ComponentPropsWithRef<typeof BaseMenu.Group>, 'className'> {
  className?: string
}

export function MenuFooter({ className, ...props }: MenuFooterProps) {
  return (
    <BaseMenu.Group
      {...props}
      className={classes('maximal-menu__footer', className)}
    />
  )
}

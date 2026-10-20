import { ContextMenu as BaseContextMenu } from '@base-ui/react/context-menu'
import { Menu as BaseMenu } from '@base-ui/react/menu'
import { Menubar as BaseMenubar } from '@base-ui/react/menubar'
import { Popover as BasePopover } from '@base-ui/react/popover'
import { Toast as BaseToast } from '@base-ui/react/toast'
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip'
import { ChevronRight, X } from 'lucide-react'
import { useRef } from 'react'
import type {
  ComponentPropsWithRef,
  ReactElement,
  ReactNode,
} from 'react'

import type { DataAttributes } from '../element-attributes'
import { MenuPopupScrollbar, MenuScrollViewport, mergeRefs } from './menu-scroll'

export interface MenuEntry {
  label: ReactNode
  onSelect?: () => void
  disabled?: boolean
}

function MenuItems({ items }: { items: readonly MenuEntry[] }) {
  return items.map((item, index) => (
    <BaseMenu.Item
      className="maximal-menu-item"
      disabled={item.disabled}
      key={index}
      onClick={item.onSelect}
    >
      {item.label}
    </BaseMenu.Item>
  ))
}

export interface ContextMenuProps
  extends Omit<ComponentPropsWithRef<typeof BaseContextMenu.Root>, 'children'> {
  children: ReactElement
  items: readonly MenuEntry[]
  popupProps?: Omit<
    ComponentPropsWithRef<typeof BaseContextMenu.Popup>,
    'children'
  > & DataAttributes
}

export function ContextMenu({
  children,
  items,
  popupProps,
  ...props
}: ContextMenuProps) {
  const popup = useRef<HTMLDivElement>(null)
  return (
    <BaseContextMenu.Root {...props}>
      <BaseContextMenu.Trigger
        className="maximal-context-menu-trigger"
        render={children}
      />
      <BaseContextMenu.Portal>
        <BaseContextMenu.Positioner className="maximal-popup-positioner">
          <BaseContextMenu.Popup
            {...popupProps}
            ref={mergeRefs(popup, popupProps?.ref)}
            className={[
              'maximal-popup maximal-menu',
              popupProps?.className,
            ].filter(Boolean).join(' ')}
          >
            <MenuScrollViewport>
              <MenuItems items={items} />
            </MenuScrollViewport>
          </BaseContextMenu.Popup>
          <MenuPopupScrollbar popup={popup} />
        </BaseContextMenu.Positioner>
      </BaseContextMenu.Portal>
    </BaseContextMenu.Root>
  )
}

export interface MenubarMenu {
  label: ReactNode
  items: readonly MenuEntry[]
}

export interface MenubarProps
  extends Omit<ComponentPropsWithRef<typeof BaseMenubar>, 'children' | 'className'> {
  menus: readonly MenubarMenu[]
  className?: string
}

function MenubarPopup({ items }: { items: readonly MenuEntry[] }) {
  const popup = useRef<HTMLDivElement>(null)
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner className="maximal-popup-positioner" sideOffset={4}>
        <BaseMenu.Popup className="maximal-popup maximal-menu" ref={popup}>
          <MenuScrollViewport>
            <MenuItems items={items} />
          </MenuScrollViewport>
        </BaseMenu.Popup>
        <MenuPopupScrollbar popup={popup} />
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  )
}

export function Menubar({
  menus,
  className,
  ...props
}: MenubarProps) {
  return (
    <BaseMenubar
      {...props}
      className={['maximal-menubar', className].filter(Boolean).join(' ')}
    >
      {menus.map((menu, index) => (
        <BaseMenu.Root key={index}>
          <BaseMenu.Trigger className="maximal-menubar__trigger">
            {menu.label}
          </BaseMenu.Trigger>
          <MenubarPopup items={menu.items} />
        </BaseMenu.Root>
      ))}
    </BaseMenubar>
  )
}

export interface TooltipProps
  extends Omit<ComponentPropsWithRef<typeof BaseTooltip.Root>, 'children'> {
  trigger: ReactElement
  children: ReactNode
  /** Which side of the trigger the tooltip opens on; defaults to above it. */
  side?: ComponentPropsWithRef<typeof BaseTooltip.Positioner>['side']
  popupProps?: Omit<
    ComponentPropsWithRef<typeof BaseTooltip.Popup>,
    'children'
  > & DataAttributes
}

export function Tooltip({
  trigger,
  children,
  side,
  popupProps,
  ...props
}: TooltipProps) {
  return (
    <BaseTooltip.Provider>
      <BaseTooltip.Root {...props}>
        <BaseTooltip.Trigger render={trigger} />
        <BaseTooltip.Portal>
          <BaseTooltip.Positioner
            className="maximal-popup-positioner"
            side={side}
            sideOffset={4}
          >
            <BaseTooltip.Popup
              {...popupProps}
              className={[
                'maximal-tooltip',
                popupProps?.className,
              ].filter(Boolean).join(' ')}
            >
              {children}
            </BaseTooltip.Popup>
          </BaseTooltip.Positioner>
        </BaseTooltip.Portal>
      </BaseTooltip.Root>
    </BaseTooltip.Provider>
  )
}

export interface PopoverProps
  extends Omit<ComponentPropsWithRef<typeof BasePopover.Root>, 'children'> {
  trigger: ReactElement
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
  popupProps?: Omit<
    ComponentPropsWithRef<typeof BasePopover.Popup>,
    'children'
  > & DataAttributes
}

export function Popover({
  trigger,
  title,
  description,
  children,
  popupProps,
  ...props
}: PopoverProps) {
  return (
    <BasePopover.Root {...props}>
      <BasePopover.Trigger render={trigger} />
      <BasePopover.Portal>
        <BasePopover.Positioner
          className="maximal-popup-positioner"
          sideOffset={4}
        >
          <BasePopover.Popup
            {...popupProps}
            className={[
              'maximal-popup maximal-popover',
              popupProps?.className,
            ].filter(Boolean).join(' ')}
          >
            <BasePopover.Close
              className="maximal-popover__close"
              aria-label="Close popover"
            >
              <X aria-hidden size={16} />
            </BasePopover.Close>
            {title === undefined ? null : (
              <BasePopover.Title className="maximal-popover__title">
                {title}
              </BasePopover.Title>
            )}
            {description === undefined ? null : (
              <BasePopover.Description className="maximal-field-description">
                {description}
              </BasePopover.Description>
            )}
            <div className="maximal-popover__content">{children}</div>
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  )
}

export interface ToastProviderProps
  extends ComponentPropsWithRef<typeof BaseToast.Provider> {
  children: ReactNode
}

export function ToastProvider({ children, ...props }: ToastProviderProps) {
  return (
    <BaseToast.Provider {...props}>
      {children}
      <ToastViewport />
    </BaseToast.Provider>
  )
}

export function ToastViewport() {
  const manager = BaseToast.useToastManager()

  return (
    <BaseToast.Portal>
      <BaseToast.Viewport className="maximal-toast-viewport">
        {manager.toasts.map((toast) => (
          <BaseToast.Root className="maximal-toast" key={toast.id} toast={toast}>
            <BaseToast.Content className="maximal-toast__content">
              {toast.title === undefined ? null : (
                <BaseToast.Title className="maximal-toast__title">
                  {toast.title}
                </BaseToast.Title>
              )}
              {toast.description === undefined ? null : (
                <BaseToast.Description className="maximal-toast__description">
                  {toast.description}
                </BaseToast.Description>
              )}
              {toast.actionProps === undefined ? null : (
                <BaseToast.Action
                  {...toast.actionProps}
                  className={[
                    'maximal-toast__action',
                    toast.actionProps.className,
                  ].filter(Boolean).join(' ')}
                />
              )}
            </BaseToast.Content>
            <BaseToast.Close
              className="maximal-toast__close"
              aria-hidden={false}
              aria-label="Dismiss notification"
            >
              <X aria-hidden size={16} />
            </BaseToast.Close>
          </BaseToast.Root>
        ))}
      </BaseToast.Viewport>
    </BaseToast.Portal>
  )
}

export const useToastManager = BaseToast.useToastManager
export const createToastManager = BaseToast.createToastManager

export interface SubmenuIndicatorProps {
  children: ReactNode
}

export function SubmenuIndicator({ children }: SubmenuIndicatorProps) {
  return (
    <>
      {children}
      <ChevronRight aria-hidden className="maximal-menu-item__indicator" size={16} />
    </>
  )
}

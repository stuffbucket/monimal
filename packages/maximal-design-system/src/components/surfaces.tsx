import { Accordion as BaseAccordion } from '@base-ui/react/accordion'
import { Avatar as BaseAvatar } from '@base-ui/react/avatar'
import { Collapsible as BaseCollapsible } from '@base-ui/react/collapsible'
import { ScrollArea as BaseScrollArea } from '@base-ui/react/scroll-area'
import { Separator as BaseSeparator } from '@base-ui/react/separator'
import { ChevronDown } from 'lucide-react'
import type {
  ComponentPropsWithRef,
  ReactNode,
} from 'react'

export interface ScrollAreaProps
  extends Omit<ComponentPropsWithRef<typeof BaseScrollArea.Root>, 'children' | 'className'> {
  children: ReactNode
  className?: string
  viewportClassName?: string
}

export function ScrollArea({
  children,
  className,
  viewportClassName,
  ...props
}: ScrollAreaProps) {
  return (
    <BaseScrollArea.Root
      {...props}
      className={['maximal-scroll-area', className].filter(Boolean).join(' ')}
    >
      <BaseScrollArea.Viewport
        className={['maximal-scroll-area__viewport', viewportClassName]
          .filter(Boolean)
          .join(' ')}
      >
        <BaseScrollArea.Content className="maximal-scroll-area__content">
          {children}
        </BaseScrollArea.Content>
      </BaseScrollArea.Viewport>
      <BaseScrollArea.Scrollbar className="maximal-scroll-area__scrollbar">
        <BaseScrollArea.Thumb className="maximal-scroll-area__thumb" />
      </BaseScrollArea.Scrollbar>
      <BaseScrollArea.Scrollbar
        className="maximal-scroll-area__scrollbar"
        orientation="horizontal"
      >
        <BaseScrollArea.Thumb className="maximal-scroll-area__thumb" />
      </BaseScrollArea.Scrollbar>
      <BaseScrollArea.Corner className="maximal-scroll-area__corner" />
    </BaseScrollArea.Root>
  )
}

export interface AvatarProps
  extends Omit<ComponentPropsWithRef<typeof BaseAvatar.Root>, 'children' | 'className'> {
  src?: string
  alt: string
  fallback?: ReactNode
  className?: string
}

export function Avatar({
  src,
  alt,
  fallback,
  className,
  ...props
}: AvatarProps) {
  return (
    <BaseAvatar.Root
      {...props}
      className={['maximal-avatar', className].filter(Boolean).join(' ')}
    >
      <BaseAvatar.Image className="maximal-avatar__image" src={src} alt={alt} />
      <BaseAvatar.Fallback className="maximal-avatar__fallback">
        {fallback ?? alt.slice(0, 1).toLocaleUpperCase()}
      </BaseAvatar.Fallback>
    </BaseAvatar.Root>
  )
}

interface SelectableOptionProps
  extends Omit<
    ComponentPropsWithRef<'button'>,
    'aria-selected' | 'role' | 'title'
  > {
  selected: boolean
  onSelect: () => void
  children: ReactNode
}

export interface CardProps extends SelectableOptionProps {}

export function Card({
  selected,
  onSelect,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <button
      {...props}
      type={props.type ?? 'button'}
      role="option"
      aria-selected={selected}
      className={['maximal-card', className].filter(Boolean).join(' ')}
      onClick={(event) => {
        props.onClick?.(event)
        if (!event.defaultPrevented) onSelect()
      }}
    >
      {children}
    </button>
  )
}

export interface CalloutProps extends SelectableOptionProps {
  title: ReactNode
  actions?: ReactNode
}

export function Callout({
  title,
  actions,
  selected,
  onSelect,
  className,
  children,
  ...props
}: CalloutProps) {
  return (
    <div className={['maximal-callout', className].filter(Boolean).join(' ')}>
      <button
        {...props}
        type={props.type ?? 'button'}
        role="option"
        aria-selected={selected}
        className="maximal-callout__option"
        onClick={(event) => {
          props.onClick?.(event)
          if (!event.defaultPrevented) onSelect()
        }}
      >
        <strong className="maximal-callout__title">{title}</strong>
        <span className="maximal-callout__body">{children}</span>
      </button>
      {actions === undefined ? null : (
        <span className="maximal-callout__actions">{actions}</span>
      )}
    </div>
  )
}

export interface CollapsibleProps
  extends Omit<
    ComponentPropsWithRef<typeof BaseCollapsible.Root>,
    'children' | 'title'
  > {
  title: ReactNode
  children: ReactNode
  className?: string
}

export function Collapsible({
  title,
  children,
  className,
  ...props
}: CollapsibleProps) {
  return (
    <BaseCollapsible.Root
      {...props}
      className={['maximal-collapsible', className].filter(Boolean).join(' ')}
    >
      <BaseCollapsible.Trigger className="maximal-disclosure-trigger">
        <span>{title}</span>
        <ChevronDown
          aria-hidden
          className="maximal-disclosure-trigger__icon"
          size={16}
        />
      </BaseCollapsible.Trigger>
      <BaseCollapsible.Panel className="maximal-collapsible__panel">
        <div className="maximal-disclosure-content">{children}</div>
      </BaseCollapsible.Panel>
    </BaseCollapsible.Root>
  )
}

export interface AccordionItem<Value extends string = string> {
  value: Value
  title: ReactNode
  content: ReactNode
  disabled?: boolean
}

export interface AccordionProps<Value extends string = string>
  extends Omit<ComponentPropsWithRef<typeof BaseAccordion.Root>, 'children' | 'className'> {
  items: readonly AccordionItem<Value>[]
  className?: string
}

export function Accordion<Value extends string>({
  items,
  className,
  ...props
}: AccordionProps<Value>) {
  return (
    <BaseAccordion.Root
      {...props}
      className={['maximal-accordion', className].filter(Boolean).join(' ')}
    >
      {items.map((item) => (
        <BaseAccordion.Item
          className="maximal-accordion__item"
          key={item.value}
          value={item.value}
          disabled={item.disabled}
        >
          <BaseAccordion.Header className="maximal-accordion__header">
            <BaseAccordion.Trigger className="maximal-disclosure-trigger">
              <span>{item.title}</span>
              <ChevronDown
                aria-hidden
                className="maximal-disclosure-trigger__icon"
                size={16}
              />
            </BaseAccordion.Trigger>
          </BaseAccordion.Header>
          <BaseAccordion.Panel className="maximal-accordion__panel">
            <div className="maximal-disclosure-content">{item.content}</div>
          </BaseAccordion.Panel>
        </BaseAccordion.Item>
      ))}
    </BaseAccordion.Root>
  )
}

export interface SeparatorProps
  extends Omit<ComponentPropsWithRef<typeof BaseSeparator>, 'className'> {
  className?: string
}

export function Separator({ className, ...props }: SeparatorProps) {
  return (
    <BaseSeparator
      {...props}
      className={['maximal-separator', className].filter(Boolean).join(' ')}
    />
  )
}

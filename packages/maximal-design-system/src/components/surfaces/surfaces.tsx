import { Accordion as BaseAccordion } from '@base-ui/react/accordion'
import { Avatar as BaseAvatar } from '@base-ui/react/avatar'
import { Collapsible as BaseCollapsible } from '@base-ui/react/collapsible'
import { ScrollArea as BaseScrollArea } from '@base-ui/react/scroll-area'
import { Separator as BaseSeparator } from '@base-ui/react/separator'
import { ChevronDown } from 'lucide-react'
import { useRef, type ComponentPropsWithRef, type ReactNode } from 'react'

import { Scrollbar, type ScrollbarVisibility } from '../scrollbar'

export interface ScrollAreaProps
  extends Omit<ComponentPropsWithRef<typeof BaseScrollArea.Root>, 'children' | 'className'> {
  children: ReactNode
  className?: string
  viewportClassName?: string
  contentClassName?: string
  /** `hidden` keeps the content scrollable without drawing scrollbars. */
  scrollbars?: ScrollbarVisibility | 'hidden'
}

export function ScrollArea({
  children,
  className,
  viewportClassName,
  contentClassName,
  scrollbars = 'auto',
  ...props
}: ScrollAreaProps) {
  const viewport = useRef<HTMLDivElement>(null)
  return (
    <BaseScrollArea.Root
      {...props}
      className={['maximal-scroll-area', className].filter(Boolean).join(' ')}
    >
      <BaseScrollArea.Viewport
        className={['maximal-scroll-area__viewport', viewportClassName]
          .filter(Boolean)
          .join(' ')}
        ref={viewport}
      >
        <BaseScrollArea.Content
          className={['maximal-scroll-area__content', contentClassName]
            .filter(Boolean)
            .join(' ')}
        >
          {children}
        </BaseScrollArea.Content>
      </BaseScrollArea.Viewport>
      {scrollbars === 'hidden' ? null : (
        <>
          <Scrollbar orientation="vertical" scroller={viewport} visibility={scrollbars} />
          <Scrollbar orientation="horizontal" scroller={viewport} visibility={scrollbars} />
        </>
      )}
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
}

export function Callout({
  title,
  selected,
  onSelect,
  className,
  children,
  ...props
}: CalloutProps) {
  return (
    <button
      {...props}
      type={props.type ?? 'button'}
      role="option"
      aria-selected={selected}
      className={['maximal-callout', className].filter(Boolean).join(' ')}
      onClick={(event) => {
        props.onClick?.(event)
        if (!event.defaultPrevented) onSelect()
      }}
    >
      <strong className="maximal-callout__title">{title}</strong>
      <span className="maximal-callout__body">{children}</span>
    </button>
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
          {...(item.disabled === undefined ? {} : { disabled: item.disabled })}
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

export interface StatusChipProps
  extends Omit<ComponentPropsWithRef<'span'>, 'children'> {
  status: string
  label: ReactNode
}

export function StatusChip({
  status,
  label,
  className,
  ...props
}: StatusChipProps) {
  return (
    <span
      {...props}
      className={['maximal-status-chip', className].filter(Boolean).join(' ')}
      data-status={status}
    >
      {label}
    </span>
  )
}

export interface InspectorPanelProps
  extends Omit<ComponentPropsWithRef<'section'>, 'children' | 'title'> {
  title: ReactNode
  children: ReactNode
  bodyClassName?: string
}

export function InspectorPanel({
  title,
  children,
  className,
  bodyClassName,
  ...props
}: InspectorPanelProps) {
  return (
    <section
      {...props}
      className={['maximal-inspector-panel', className].filter(Boolean).join(' ')}
    >
      <header className="maximal-inspector-panel__header">
        <h2 className="maximal-inspector-panel__title">{title}</h2>
      </header>
      <div
        className={[
          'maximal-inspector-panel__body',
          bodyClassName,
        ].filter(Boolean).join(' ')}
      >
        {children}
      </div>
    </section>
  )
}

export interface PropertyListProps
  extends Omit<ComponentPropsWithRef<'dl'>, 'children'> {
  children: ReactNode
}

export function PropertyList({
  children,
  className,
  ...props
}: PropertyListProps) {
  return (
    <dl
      {...props}
      className={['maximal-property-list', className].filter(Boolean).join(' ')}
    >
      {children}
    </dl>
  )
}

export interface PropertyProps
  extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  label: ReactNode
  value: ReactNode
}

export function Property({
  label,
  value,
  className,
  ...props
}: PropertyProps) {
  return (
    <div
      {...props}
      className={['maximal-property', className].filter(Boolean).join(' ')}
    >
      <dt className="maximal-property__label">{label}</dt>
      <dd className="maximal-property__value">{value}</dd>
    </div>
  )
}

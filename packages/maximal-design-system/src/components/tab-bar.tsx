import { Tabs } from '@base-ui/react/tabs'
import type { ReactNode } from 'react'

import { Tab } from './tab'

export interface TabBarItem {
  id: string
  label: string
  icon?: ReactNode
  disabled?: boolean
  /** `false` hides the active tab's close glyph and ignores close gestures. */
  closable?: boolean
  /** Keeps the panel's content mounted while another tab is active. */
  keepMounted?: boolean
}

export interface TabBarProps {
  items: readonly TabBarItem[]
  value: string
  onValueChange: (value: string) => void
  /** Delete, Backspace, middle-click, or the active tab's close glyph. */
  onClose?: (value: string) => void
  renderPanel: (item: TabBarItem) => ReactNode
  label?: string
  leading?: ReactNode
  trailing?: ReactNode
}

export function TabBar({
  items,
  value,
  onValueChange,
  onClose,
  renderPanel,
  label = 'Workspace tabs',
  leading,
  trailing,
}: TabBarProps) {
  return (
    <Tabs.Root
      className="maximal-tabs"
      value={value}
      onValueChange={(nextValue) => {
        if (typeof nextValue === 'string') onValueChange(nextValue)
      }}
    >
      <div className="maximal-tabs__chrome">
        {leading ? <div className="maximal-tabs__leading">{leading}</div> : null}
        <Tabs.List className="maximal-tabs__list" aria-label={label}>
          {items.map((item) => (
            <Tab
              active={item.id === value}
              closable={item.closable}
              disabled={item.disabled}
              icon={item.icon}
              key={item.id}
              label={item.label}
              onClose={onClose ? () => onClose(item.id) : undefined}
              value={item.id}
            />
          ))}
        </Tabs.List>
        {trailing ? <div className="maximal-tabs__trailing">{trailing}</div> : null}
      </div>
      <div className="maximal-tabs__panels">
        {items.map((item) => (
          <Tabs.Panel
            className="maximal-tabs__panel"
            keepMounted={item.keepMounted}
            key={item.id}
            value={item.id}
          >
            {renderPanel(item)}
          </Tabs.Panel>
        ))}
      </div>
    </Tabs.Root>
  )
}

import { Tabs } from '@base-ui/react/tabs'
import type { ReactNode } from 'react'

import { CloseIcon } from '../icons'

export interface TabBarItem {
  id: string
  label: string
  icon?: ReactNode
  disabled?: boolean
}

export interface TabBarProps {
  items: readonly TabBarItem[]
  value: string
  onValueChange: (value: string) => void
  renderPanel: (item: TabBarItem) => ReactNode
  label?: string
  leading?: ReactNode
  trailing?: ReactNode
}

export function TabBar({
  items,
  value,
  onValueChange,
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
            <Tabs.Tab
              className="maximal-tabs__tab"
              disabled={item.disabled}
              key={item.id}
              value={item.id}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.id === value ? (
                <CloseIcon className="maximal-tabs__close-icon" />
              ) : null}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {trailing ? <div className="maximal-tabs__trailing">{trailing}</div> : null}
      </div>
      <div className="maximal-tabs__panels">
        {items.map((item) => (
          <Tabs.Panel className="maximal-tabs__panel" key={item.id} value={item.id}>
            {renderPanel(item)}
          </Tabs.Panel>
        ))}
      </div>
    </Tabs.Root>
  )
}

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import {
  Workbar,
  type Account,
  type SettingsSurface,
} from '@maximal/maximal-electron/renderer'

import {
  WORKBAR_ITEMS,
  useWorkbarLayout,
  type WorkbarItemId,
} from './workbar-layout'
import type { SettingsCapabilities } from '../settings/capabilities'

interface ContextMenuState {
  x: number
  y: number
  container: HTMLElement
}

export function WorkspaceRail({
  current,
  onSelect,
  workbar,
  account,
  onOpenProfileSurface,
  onSignIn,
  onSignOut,
  settingsOpen,
  onToggleSettings,
}: {
  current: string
  onSelect: (id: WorkbarItemId) => void
  workbar: SettingsCapabilities['workbar']
  account?: Account
  onOpenProfileSurface?: (surface: SettingsSurface) => void
  onSignIn?: () => void
  onSignOut?: () => void
  settingsOpen?: boolean
  onToggleSettings?: () => void
}): ReactElement {
  const { layout, setVisible, busy, error } = useWorkbarLayout(workbar)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>()
  const byId = new Map(WORKBAR_ITEMS.map((item) => [item.id, item]))
  const orderedItems = layout.order.map((id) => byId.get(id)!)
  const visible = new Set(layout.visible)
  const items = orderedItems.filter(({ id }) => visible.has(id))

  return (
    <>
      <div
        className="workspace-workbar__destinations"
        onContextMenu={(event) => {
          event.preventDefault()
          const container = event.currentTarget.closest<HTMLElement>('.sb-shell')
          if (container === null) return
          setContextMenu({ x: event.clientX, y: event.clientY, container })
        }}
      >
        {error ? <span role="alert" className="visually-hidden">{error}</span> : null}
        <Workbar
          items={items}
          current={current as WorkbarItemId}
          onSelect={onSelect}
          account={account}
          onOpenProfileSurface={onOpenProfileSurface}
          onSignIn={onSignIn}
          onSignOut={onSignOut}
          settingsOpen={settingsOpen}
          onToggleSettings={onToggleSettings}
          label="Workspace views"
          testId="workspace-rail"
        />
      </div>
      <DropdownMenu.Root
        open={contextMenu !== undefined}
        onOpenChange={(open) => {
          if (!open) setContextMenu(undefined)
        }}
      >
        {contextMenu ? (
          <DropdownMenu.Trigger asChild>
            <span
              aria-hidden="true"
              style={{
                position: 'fixed',
                left: contextMenu.x,
                top: contextMenu.y,
                width: 1,
                height: 1,
              }}
            />
          </DropdownMenu.Trigger>
        ) : null}
        <DropdownMenu.Portal container={contextMenu?.container}>
          <DropdownMenu.Content
            className="menu workspace-workbar__context-menu"
            side="right"
            align="start"
            sideOffset={4}
            data-testid="workbar-context-menu"
          >
            {orderedItems.map((item) => (
              <DropdownMenu.CheckboxItem
                key={item.id}
                className="menu__item"
                checked={visible.has(item.id)}
                disabled={busy}
                onCheckedChange={(checked) => setVisible(item.id, checked === true)}
                data-testid={`workbar-menu-${item.id}`}
              >
                <span className="workspace-workbar__menu-check" aria-hidden="true">
                  {visible.has(item.id) ? <Check size={16} /> : null}
                </span>
                <span className="menu__item-label">{item.label}</span>
              </DropdownMenu.CheckboxItem>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  )
}
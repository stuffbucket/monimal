import { ChevronDown, ChevronUp } from 'lucide-react'
import { type ReactElement } from 'react'
import { IconButton, Switch, Tooltip } from '@maximal/maximal-design-system'
import {
  Banner,
  SettingsGroup,
  SettingsItem,
  SettingsSection,
  shellIcon,
} from '@maximal/maximal-electron/renderer'

import {
  WORKBAR_ITEMS,
  useWorkbarLayout,
} from '../frame/workbar-layout'
import type { SettingsCapabilities } from './capabilities'

export function WorkbarSection({
  capabilities,
}: {
  capabilities: SettingsCapabilities
}): ReactElement {
  const { layout, move, setVisible, busy, error } = useWorkbarLayout(
    capabilities.workbar,
  )
  const byId = new Map(WORKBAR_ITEMS.map((item) => [item.id, item]))
  const orderedItems = layout.order.map((id) => byId.get(id)!)
  const visible = new Set(layout.visible)

  return (
    <section className="settings-section">
      <SettingsSection
        title="Workbar"
        description="Choose which destinations appear and arrange their order."
      >
        {error ? <Banner status="failed">{error}</Banner> : null}
        <SettingsGroup dividers={false}>
          {orderedItems.map((item, index) => {
            const Icon = shellIcon(item.icon)
            return (
              <SettingsItem
                key={item.id}
                title={(
                  <span className="settings__workbar-title">
                    <Icon aria-hidden="true" size={16} />
                    {item.label}
                  </span>
                )}
                actions={(
                  <>
                    <Tooltip
                      trigger={(
                        <IconButton
                          label={`Move ${item.label} up`}
                          disabled={busy || index === 0}
                          onClick={() => move(item.id, -1)}
                        >
                          <ChevronUp size={16} />
                        </IconButton>
                      )}
                    >
                      {`Move ${item.label} up`}
                    </Tooltip>
                    <Tooltip
                      trigger={(
                        <IconButton
                          label={`Move ${item.label} down`}
                          disabled={busy || index === orderedItems.length - 1}
                          onClick={() => move(item.id, 1)}
                        >
                          <ChevronDown size={16} />
                        </IconButton>
                      )}
                    >
                      {`Move ${item.label} down`}
                    </Tooltip>
                    <Switch
                      aria-label={`Show ${item.label} in workbar`}
                      label={null}
                      checked={visible.has(item.id)}
                      disabled={busy}
                      onCheckedChange={(enabled) => setVisible(item.id, enabled)}
                    />
                  </>
                )}
              >
                {item.description}
              </SettingsItem>
            )
          })}
        </SettingsGroup>
      </SettingsSection>
    </section>
  )
}

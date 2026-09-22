import { type ReactElement } from 'react'

import {
  Note,
  SettingsGroup,
  SettingsItem,
  SettingsSection,
  Switch,
} from 'stuffbucket-electron/renderer'

import type { SettingsCapabilities } from '../capabilities'
import { MenuBarOnlyDialog } from './MenuBarOnlyDialog'
import { useMenuBarPresence } from './useMenuBarPresence'

interface GeneralSectionProps {
  capabilities: SettingsCapabilities
}

export function GeneralSection({
  capabilities,
}: GeneralSectionProps): ReactElement {
  const presence = useMenuBarPresence(capabilities)

  return (
    <section className="settings-section">
      {presence.error ? (
        <Note status="failed" live="assertive">
          {presence.error}
        </Note>
      ) : null}
      <SettingsSection
        title="Desktop presence"
        description="Choose where Maximal remains available when its window is closed."
      >
        {presence.state === null ? (
          <Note live="polite">Loading desktop app preferences…</Note>
        ) : (
          <SettingsGroup>
            <SettingsItem
              title="Show Maximal in the menu bar only"
              description="Use the Maximal icon to reopen the desktop app. Dock and taskbar presence is the default."
              control={
                <Switch
                  label="Show Maximal in the menu bar only"
                  displayLabel={null}
                  checked={presence.state.enabled}
                  disabled={presence.busy || presence.state.pending}
                  onChange={(next) => void presence.changeMode(next)}
                  testId="menu-bar-only-switch"
                />
              }
            />
          </SettingsGroup>
        )}
      </SettingsSection>
      <MenuBarOnlyDialog
        open={presence.attempt !== null}
        remaining={presence.remaining}
        busy={presence.busy}
        onCancel={() => void presence.cancel()}
        onConfirm={() => void presence.confirm()}
      />
    </section>
  )
}
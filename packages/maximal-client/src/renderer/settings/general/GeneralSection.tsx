import { type ReactElement } from 'react'

import {
  Button,
  Note,
  SettingsGroup,
  SettingsItem,
  SettingsSection,
  Switch,
} from '@maximal/maximal-electron/renderer'

import type { SettingsCapabilities } from '../capabilities'
import { MenuBarOnlyDialog } from './MenuBarOnlyDialog'
import { useGeneralDesktopSettings } from './useGeneralDesktopSettings'
import { useMenuBarPresence } from './useMenuBarPresence'

interface GeneralSectionProps {
  capabilities: SettingsCapabilities
}

export function GeneralSection({
  capabilities,
}: GeneralSectionProps): ReactElement {
  const presence = useMenuBarPresence(capabilities)
  const general = useGeneralDesktopSettings(capabilities)

  return (
    <section className="settings-section">
      {presence.error || general.error ? (
        <Note status="failed" live="assertive">
          {presence.error ?? general.error}
        </Note>
      ) : null}
      <SettingsSection
        title="Desktop app"
        description="Control how Maximal starts and stays available."
      >
        {presence.state === null || general.desktop === null ? (
          <Note live="polite">Loading general desktop settings…</Note>
        ) : (
          <SettingsGroup>
            <SettingsItem
              title="Desktop app version"
              control={<span>{general.desktop.version}</span>}
            />
            <SettingsItem
              title="Run on startup"
              description="Automatically start Maximal when you log in to your computer."
              control={
                <Switch
                  label="Run Maximal on startup"
                  displayLabel={null}
                  checked={general.desktop.startOnLogin}
                  disabled={general.savingStartup}
                  onChange={(enabled) => void general.changeStartup(enabled)}
                  testId="start-on-login-switch"
                />
              }
            />
            <SettingsItem
              title="Quick access shortcut"
              description="Open or hide Maximal from anywhere on your desktop."
              control={<kbd>Ctrl Ctrl</kbd>}
            />
            <SettingsItem
              title="Menu bar"
              description="Show Maximal in the menu bar without keeping it in the Dock or taskbar."
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
      <SettingsSection
        title="Notifications"
        description="Control whether Maximal can alert you through the operating system."
      >
        <SettingsGroup>
          <SettingsItem
            title="System notifications"
            description={
              general.notifications === null
                ? 'Checking system notification support…'
                : general.notifications.supported
                  ? 'Manage notification permission, alerts, and sounds in system settings.'
                  : 'System notifications are not supported on this device.'
            }
            control={
              general.notifications?.canOpenSettings ? (
                <Button
                  size="sm"
                  disabled={general.openingNotificationSettings}
                  onClick={() => void general.openNotificationSettings()}
                >
                  {general.openingNotificationSettings ? 'Opening…' : 'Open settings'}
                </Button>
              ) : undefined
            }
          />
        </SettingsGroup>
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
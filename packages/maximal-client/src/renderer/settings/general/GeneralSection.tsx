import { type ReactElement } from 'react'

import {
  Button,
  Note,
  SettingsGroup,
  SettingsItem,
  SettingsSection,
  Select,
  Switch,
} from '@maximal/maximal-electron/renderer'
import type { AssistantOutputFont } from '@maximal/maximal-harness'

import type { SettingsCapabilities } from '../capabilities'
import { MenuBarOnlyDialog } from './MenuBarOnlyDialog'
import { useAssistantOverlay } from './useAssistantOverlay'
import { useGeneralDesktopSettings } from './useGeneralDesktopSettings'
import { TerminalTypographySettings } from './TerminalTypographySettings'
import { useMenuBarPresence } from './useMenuBarPresence'

interface GeneralSectionProps {
  capabilities: SettingsCapabilities
}

export function GeneralSection({
  capabilities,
}: GeneralSectionProps): ReactElement {
  const presence = useMenuBarPresence(capabilities)
  const general = useGeneralDesktopSettings(capabilities)
  const assistant = useAssistantOverlay(capabilities)

  return (
    <section className="settings-section">
      {presence.error ? (
        <Note status="failed" live="assertive">
          {presence.error}
        </Note>
      ) : null}
      {general.error ? (
        <Note status="failed" live="assertive">
          {general.error}
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
              divider={false}
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
              divider={false}
              description="Open or hide Maximal from anywhere on your desktop."
              control={<kbd>Ctrl Ctrl</kbd>}
            />
            <SettingsItem
              title="Menu bar"
              divider={false}
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
        title="Assistant overlay"
        description="Choose how the quick assistant appears above the desktop."
      >
        {assistant.error ? (
          <Note status="failed" live="assertive">
            {assistant.error}
          </Note>
        ) : null}
        {assistant.preferences === null ? (
          <Note live="polite">Loading assistant preferences…</Note>
        ) : (
          <SettingsGroup>
            <SettingsItem
              title="Candy-coated background"
              description="Use Maximal's sparkling red finish around the assistant controls."
              control={(
                <Switch
                  label="Candy-coated assistant background"
                  displayLabel={null}
                  checked={assistant.preferences.candy}
                  disabled={assistant.busy}
                  onChange={(next) => void assistant.setCandy(next)}
                  testId="assistant-candy-switch"
                />
              )}
            />
            <SettingsItem
              title="Conversation font"
              description="Choose the typeface used for assistant responses."
              control={(
                <Select<AssistantOutputFont>
                  aria-label="Conversation font"
                  value={assistant.preferences.outputFont}
                  disabled={assistant.busy}
                  onChange={(next) => void assistant.setOutputFont(next)}
                  options={[
                    { value: 'auto', label: 'Auto' },
                    { value: 'default', label: 'Default' },
                    { value: 'terminal', label: 'Terminal' },
                    { value: 'open-dyslexic', label: 'OpenDyslexic' },
                    { value: 'serif', label: 'Baskerville' },
                  ]}
                  testId="assistant-output-font"
                />
              )}
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

export function TypographySection({
  capabilities,
}: GeneralSectionProps): ReactElement {
  return (
    <section className="settings-section">
      <TerminalTypographySettings
        capabilities={capabilities.terminalTypography}
        surface="typography"
      />
    </section>
  )
}

export function ColorPalettesSection({
  capabilities,
}: GeneralSectionProps): ReactElement {
  return (
    <section className="settings-section">
      <TerminalTypographySettings
        capabilities={capabilities.terminalTypography}
        surface="palette"
      />
    </section>
  )
}
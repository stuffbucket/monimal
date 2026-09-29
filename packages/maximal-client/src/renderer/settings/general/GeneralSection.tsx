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
import { useAppearancePreference } from './useAppearancePreference'
import { useMenuBarPresence } from './useMenuBarPresence'

interface GeneralSectionProps {
  capabilities: SettingsCapabilities
}

function AppearanceSections({
  appearance,
}: {
  appearance: ReturnType<typeof useAppearancePreference>
}): ReactElement {
  if (appearance.state === null) {
    return (
      <>
        <SettingsSection
          title="Window materials"
          description="Use native desktop materials where the operating system supports them."
        >
          <Note live="polite">Loading appearance preferences…</Note>
        </SettingsSection>
        <SettingsSection
          title="Visual effects"
          description="Control optional graphics and motion used by the interface."
        >
          <Note live="polite">Loading visual effect preferences…</Note>
        </SettingsSection>
      </>
    )
  }

  return (
    <>
      <SettingsSection
        title="Window materials"
        description="Use native desktop materials where the operating system supports them."
      >
        <SettingsGroup>
          <SettingsItem
            title="Translucent window"
            description={
              appearance.state.vibrancySupported
                ? 'Show the macOS desktop vibrancy material through Maximal surfaces.'
                : 'Native vibrancy is available on macOS.'
            }
            control={
              <Switch
                label="Translucent window"
                displayLabel={null}
                checked={appearance.state.vibrancyEnabled}
                disabled={
                  appearance.busy || !appearance.state.vibrancySupported
                }
                onChange={(next) => void appearance.setVibrancyEnabled(next)}
                testId="vibrancy-switch"
              />
            }
          />
        </SettingsGroup>
      </SettingsSection>
      <SettingsSection
        title="Visual effects"
        description="Control optional graphics and motion used by the interface."
      >
        <SettingsGroup>
          <SettingsItem
            title="Cozy background"
            description="Render a gently moving cloud material behind the workspace."
            control={
              <Switch
                label="Cozy background"
                displayLabel={null}
                checked={appearance.state.backgroundEffectsEnabled}
                disabled={appearance.busy}
                onChange={(next) =>
                  void appearance.setBackgroundEffectsEnabled(next)
                }
                testId="background-effects-switch"
              />
            }
          />
          <SettingsItem
            title="Reduce motion"
            description="Stop decorative animation and minimize transitions throughout Maximal. The operating system preference is always honored."
            control={
              <Switch
                label="Reduce motion"
                displayLabel={null}
                checked={appearance.state.reducedMotionEnabled}
                disabled={appearance.busy}
                onChange={(next) =>
                  void appearance.setReducedMotionEnabled(next)
                }
                testId="reduced-motion-switch"
              />
            }
          />
        </SettingsGroup>
      </SettingsSection>
    </>
  )
}

export function GeneralSection({
  capabilities,
}: GeneralSectionProps): ReactElement {
  const presence = useMenuBarPresence(capabilities)
  const general = useGeneralDesktopSettings(capabilities)
  const appearance = useAppearancePreference(capabilities)

  return (
    <section className="settings-section">
      {appearance.error ? (
        <Note status="failed" live="assertive">
          {appearance.error}
        </Note>
      ) : null}
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
      <AppearanceSections appearance={appearance} />
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
import { type ReactElement } from 'react'

import {
  Note,
  SettingsGroup,
  SettingsItem,
  SettingsSection,
  Switch,
} from '@maximal/maximal-electron/renderer'

import type { SettingsCapabilities } from '../capabilities'
import { MenuBarOnlyDialog } from './MenuBarOnlyDialog'
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
      <AppearanceSections appearance={appearance} />
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
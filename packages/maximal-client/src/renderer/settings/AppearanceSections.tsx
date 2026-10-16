import { type ReactElement } from 'react'

import { Switch } from '@maximal/maximal-design-system'
import {
  Note,
  SettingsGroup,
  SettingsItem,
  SettingsSection,
} from '@maximal/maximal-electron/renderer'

import { useMaterialPreference } from '../useMaterialPreference'
import type { SettingsCapabilities } from './capabilities'
import { AppearanceSection } from './general/AppearanceSection'
import { MaterialSettings } from './general/MaterialSettings'
import { useAppearancePreference } from './general/useAppearancePreference'

interface ShadersSectionProps {
  capabilities: SettingsCapabilities
}

export function ShadersSection({
  capabilities,
}: ShadersSectionProps): ReactElement {
  const appearance = useAppearancePreference(capabilities)
  const material = useMaterialPreference(capabilities)

  if (appearance.state === null) {
    return (
      <section className="settings-section">
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
      </section>
    )
  }

  return (
    <section className="settings-section">
      {appearance.error ? (
        <Note status="failed" live="assertive">
          {appearance.error}
        </Note>
      ) : null}
      {material.error ? (
        <Note status="failed" live="assertive">
          {material.error}
        </Note>
      ) : null}
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
                aria-label="Translucent window"
                label={null}
                checked={appearance.state.vibrancyEnabled}
                disabled={appearance.busy || !appearance.state.vibrancySupported}
                onCheckedChange={(next) => void appearance.setVibrancyEnabled(next)}
                data-testid="vibrancy-switch"
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
            title="Background material"
            description="Render a configurable material behind the workspace."
            control={
              <Switch
                aria-label="Background material"
                label={null}
                checked={appearance.state.backgroundEffectsEnabled}
                disabled={appearance.busy}
                onCheckedChange={(next) =>
                  void appearance.setBackgroundEffectsEnabled(next)}
                data-testid="background-effects-switch"
              />
            }
          >
            <MaterialSettings
              disabled={appearance.busy || !appearance.state.backgroundEffectsEnabled}
              preference={material}
            />
          </SettingsItem>
          <SettingsItem
            title="Reduce motion"
            divider={false}
            description="Stop decorative animation and minimize transitions throughout Maximal. The operating system preference is always honored."
            control={
              <Switch
                aria-label="Reduce motion"
                label={null}
                checked={appearance.state.reducedMotionEnabled}
                disabled={appearance.busy}
                onCheckedChange={(next) => void appearance.setReducedMotionEnabled(next)}
                data-testid="reduced-motion-switch"
              />
            }
          />
        </SettingsGroup>
      </SettingsSection>
    </section>
  )
}

export function ThemesSection({
  capabilities,
}: {
  capabilities: SettingsCapabilities
}): ReactElement {
  return (
    <section className="settings-section">
      <AppearanceSection capabilities={capabilities} />
    </section>
  )
}

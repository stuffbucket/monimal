import { type ReactElement } from 'react'

import {
  Note,
  SettingsSection,
} from '@maximal/maximal-electron/renderer'

export function ShadersSection(): ReactElement {
  return (
    <section className="settings-section">
      <SettingsSection
        title="Terminal shaders"
        description="Manage post-processing effects applied by compatible terminal renderers."
      >
        <Note>No terminal shaders are configured.</Note>
      </SettingsSection>
    </section>
  )
}

export function ThemesSection(): ReactElement {
  return (
    <section className="settings-section">
      <SettingsSection
        title="Themes"
        description="Coordinate application and terminal appearance presets."
      >
        <Note>No custom themes are configured.</Note>
      </SettingsSection>
    </section>
  )
}

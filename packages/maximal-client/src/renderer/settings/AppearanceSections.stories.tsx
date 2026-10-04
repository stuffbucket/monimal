import type { Meta, StoryObj } from '@maximal/maximal-storybook'
import type { ReactElement } from 'react'

import '@maximal/maximal-electron/renderer/styles.css'
import '../theme'
import '../base'

import {
  ShadersSection,
  ThemesSection,
} from './AppearanceSections'
import { MaximalQueryProvider } from '../query-client'
import type { SettingsCapabilities } from './capabilities'
import { ensureSettingsStyles } from './settings-styles'
import { createPreviewSettingsCapabilities } from './ui-preview-capabilities'

const previewCapabilities = createPreviewSettingsCapabilities()
const solarCapabilities: SettingsCapabilities = {
  ...previewCapabilities,
  general: {
    ...previewCapabilities.general,
    appearance: () => Promise.resolve({
      vibrancyEnabled: false,
      vibrancySupported: true,
      backgroundEffectsEnabled: true,
      reducedMotionEnabled: false,
    }),
    material: () => Promise.resolve({
      preset: 'clouds',
      quality: 'balanced',
      strength: 0.75,
      motion: 0.5,
      lighting: 'timezone',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      solarFacingOffset: 0,
      solarFollowStrength: 0.5,
      solarEffect: 'rays',
    }),
  },
}

function StorySurface({
  children,
}: {
  children: ReactElement
}): ReactElement {
  ensureSettingsStyles()
  return (
    <MaximalQueryProvider>
      <main
        className="sb-shell"
        style={{
          minHeight: '100vh',
          padding: '24px',
          color: 'var(--maximal-color-text-default)',
          background: 'var(--maximal-color-bg-default)',
        }}
      >
        {children}
      </main>
    </MaximalQueryProvider>
  )
}

const meta = {
  title: 'Maximal Settings/Appearance',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const ThemeBoard: Story = {
  render: () => (
    <StorySurface>
      <ThemesSection capabilities={previewCapabilities} />
    </StorySurface>
  ),
}

export const FollowTheSun: Story = {
  render: () => (
    <StorySurface>
      <ShadersSection capabilities={solarCapabilities} />
    </StorySurface>
  ),
}

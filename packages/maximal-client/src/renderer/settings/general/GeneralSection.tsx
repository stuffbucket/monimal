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
import type {
  AgentEffort,
  AssistantOutputFont,
} from '@maximal/maximal-harness'

import type { SettingsCapabilities } from '../capabilities'
import { MenuBarOnlyDialog } from './MenuBarOnlyDialog'
import { useAssistantOverlay } from './useAssistantOverlay'
import { useGeneralDesktopSettings } from './useGeneralDesktopSettings'
import { TerminalTypographySettings } from './TerminalTypographySettings'
import { SpatialCanvasPaletteSettings } from './SpatialCanvasPaletteSettings'
import { useMenuBarPresence } from './useMenuBarPresence'

interface GeneralSectionProps {
  capabilities: SettingsCapabilities
}

type AssistantSettingsState = ReturnType<typeof useAssistantOverlay>

function AssistantModelControl({
  assistant,
}: {
  assistant: AssistantSettingsState
}): ReactElement {
  if (assistant.provider === null) return <span>Loading…</span>
  if (!('models' in assistant.provider)) return <span>Unavailable</span>
  const modelKey = assistant.provider.state === 'ready'
    ? assistant.provider.modelKey
    : assistant.provider.preferredModel
  if (modelKey === undefined || assistant.provider.models.length === 0) {
    return <span>Unavailable</span>
  }
  return (
    <Select<string>
      aria-label="Default assistant model"
      value={modelKey}
      disabled={assistant.busy}
      onChange={(next) => void assistant.setModel(next)}
      options={assistant.provider.models.map((model) => ({
        value: model.key,
        label: model.label,
      }))}
      testId="assistant-default-model"
    />
  )
}

function AssistantEffortControl({
  assistant,
}: {
  assistant: AssistantSettingsState
}): ReactElement {
  const provider = assistant.provider
  if (provider === null) return <span>Loading…</span>
  if (provider.state !== 'ready') return <span>Not supported</span>
  const model = provider.models.find(({ key }) => key === provider.modelKey)
  if (model === undefined || model.efforts.length === 0) {
    return <span>Not supported</span>
  }
  return (
    <Select<AgentEffort>
      aria-label="Default assistant reasoning effort"
      value={provider.effort ?? model.efforts[0]}
      disabled={assistant.busy}
      onChange={(next) => void assistant.setEffort(next)}
      options={model.efforts.map((effort) => ({
        value: effort,
        label: effort === 'xhigh'
          ? 'Extra high'
          : effort[0].toLocaleUpperCase() + effort.slice(1),
      }))}
      testId="assistant-default-effort"
    />
  )
}

function AssistantOverlaySettings({
  capabilities,
}: GeneralSectionProps): ReactElement {
  const assistant = useAssistantOverlay(capabilities)

  return (
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
            title="Default model"
            description="Choose the model used when a new assistant conversation starts."
            control={<AssistantModelControl assistant={assistant} />}
          />
          <SettingsItem
            title="Reasoning effort"
            description="Set the default reasoning depth for models that support it."
            control={<AssistantEffortControl assistant={assistant} />}
          />
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
  )
}

export function GeneralSection({
  capabilities,
}: GeneralSectionProps): ReactElement {
  const presence = useMenuBarPresence(capabilities)
  const general = useGeneralDesktopSettings(capabilities)

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
      <AssistantOverlaySettings capabilities={capabilities} />
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
      <SpatialCanvasPaletteSettings />
      <TerminalTypographySettings
        capabilities={capabilities.terminalTypography}
        surface="palette"
      />
    </section>
  )
}
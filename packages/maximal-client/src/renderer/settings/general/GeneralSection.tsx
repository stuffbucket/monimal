import { type ReactElement } from 'react'

import {
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
import { useMenuBarPresence } from './useMenuBarPresence'

interface GeneralSectionProps {
  capabilities: SettingsCapabilities
}

export function GeneralSection({
  capabilities,
}: GeneralSectionProps): ReactElement {
  const presence = useMenuBarPresence(capabilities)
  const assistant = useAssistantOverlay(capabilities)

  return (
    <>
      <SettingsSection
        title="Desktop presence"
        description="Choose where Maximal remains available when its window is closed."
      >
        {presence.error ? (
          <Note status="failed" live="assertive">
            {presence.error}
          </Note>
        ) : null}
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
        <MenuBarOnlyDialog
          open={presence.attempt !== null}
          remaining={presence.remaining}
          busy={presence.busy}
          onCancel={() => void presence.cancel()}
          onConfirm={() => void presence.confirm()}
        />
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
    </>
  )
}
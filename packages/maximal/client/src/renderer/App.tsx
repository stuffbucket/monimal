import { ObservabilityProvider } from '@stuffbucket/maximal-observability'
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { TerminalLauncher } from 'stuffbucket-electron/renderer'

import { DEFAULT_SETTINGS_SECTION_ID } from '../shared/settings-sections'
import { WindowChrome } from './chrome/WindowChrome'
import { FirstRun } from './first-run/FirstRun'
import { AppWorkspace } from './AppWorkspace'
import type { SettingsSectionRequest } from './settings/Settings'
import { createCoreSettingsCapabilities } from './settings/capabilities'
import { readDetachedTerminal } from './terminal/window-transfer'
import { createObservabilitySource } from './traffic/source'
import { useAuthStatus } from './useAuthStatus'
import { useTerminalTabs } from './useTerminalTabs'
import {
  UnsavedChangesProvider,
  useGuardedNavigation,
} from './unsaved-changes'

export function App(): ReactElement {
  return (
    <UnsavedChangesProvider>
      <AppContent />
    </UnsavedChangesProvider>
  )
}

function AppContent(): ReactElement {
  const settings = useMemo(() => createCoreSettingsCapabilities(), [])
  const observability = useMemo(() => createObservabilitySource(), [])
  const [detachedWindow] = useState(readDetachedTerminal)
  const authenticated = useAuthStatus(settings)
  const terminalTabsState = useTerminalTabs(authenticated, detachedWindow)
  const { activeTab, setActiveTab } = terminalTabsState
  const [sectionRequest, setSectionRequest] = useState<SettingsSectionRequest | null>(null)
  const requestNavigation = useGuardedNavigation()

  useEffect(
    () =>
      settings.onOpenRequest((sectionId) => {
        requestNavigation(() => {
          setActiveTab('settings')
          setSectionRequest({ id: sectionId ?? DEFAULT_SETTINGS_SECTION_ID })
        })
      }),
    [requestNavigation, setActiveTab, settings],
  )

  if (!detachedWindow && authenticated !== true && activeTab !== 'settings')
    return (
      <WindowChrome>
        <FirstRun />
      </WindowChrome>
    )

  const signedOut = !detachedWindow && authenticated !== true
  return (
    <ObservabilityProvider source={observability}>
      <AppWorkspace
        authenticated={authenticated}
        detachedWindow={detachedWindow}
        settings={settings}
        sectionRequest={sectionRequest}
        terminalState={terminalTabsState}
        requestNavigation={requestNavigation}
      />
      {!signedOut && !detachedWindow ? (
        <TerminalLauncher
          open={terminalTabsState.launcherOpen}
          onOpenChange={terminalTabsState.setLauncherOpen}
          profiles={window.maximal.terminal.profiles}
          discover={window.maximal.terminal.discover}
          launch={async (request) => {
            const result = await window.maximal.terminal.launch(request)
            terminalTabsState.rememberProfile(request.profileId)
            return result
          }}
          onLaunched={terminalTabsState.onTerminalLaunched}
          recentProfileIds={terminalTabsState.recentProfiles}
        />
      ) : null}
    </ObservabilityProvider>
  )
}

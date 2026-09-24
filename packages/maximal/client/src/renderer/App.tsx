import { ObservabilityProvider } from '@stuffbucket/maximal-observability'
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { TerminalLauncher } from 'stuffbucket-electron/renderer'

import { DEFAULT_SETTINGS_SECTION_ID } from '../shared/settings-sections'
import { AppWorkspace } from './AppWorkspace'
import { ThirdPartyLicensesDialog } from './ThirdPartyLicensesDialog'
import { useAccountStatus } from './useAccountStatus'
import type { SettingsSectionRequest } from './settings/Settings'
import { createCoreSettingsCapabilities } from './settings/capabilities'
import { readDetachedTerminal } from './terminal/window-transfer'
import { createObservabilitySource } from './traffic/source'
import { useTerminalTabs } from './useTerminalTabs'
import {
  UnsavedChangesProvider,
  useGuardedNavigation,
} from './unsaved-changes'

/**
 * Top-level composition.
 *
 * This is the one place that decides which surface is showing, and it exists
 * because that decision cannot be made by any surface individually. Overview,
 * Traffic, and Settings are built to be mounted; none of them decides when it
 * is the active surface. Account authentication is optional and owned by
 * Settings rather than gating the workspace.
 *
 * Which surface is showing is that frame's active tab, so this file holds the
 * view but draws no switcher of its own: there is one set of navigation, and it
 * lives in the title bar where it is always reachable.
 *
 * The Settings adapter is the renderer boundary to the named main-process
 * bridge, including the application menu's requests which arrive on that seam.
 */

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
  const terminalTabsState = useTerminalTabs(detachedWindow)
  const { openSettings } = terminalTabsState
  const accountStatus = useAccountStatus(settings)
  const [sectionRequest, setSectionRequest] = useState<SettingsSectionRequest | null>(null)
  const requestNavigation = useGuardedNavigation()

  useEffect(
    () =>
      settings.onOpenRequest((sectionId) => {
        requestNavigation(() => {
          openSettings()
          setSectionRequest({ id: sectionId ?? DEFAULT_SETTINGS_SECTION_ID })
        })
      }),
    [openSettings, requestNavigation, settings],
  )

  return (
    <ObservabilityProvider source={observability}>
      <AppWorkspace
        detachedWindow={detachedWindow}
        accountStatus={accountStatus}
        settings={settings}
        sectionRequest={sectionRequest}
        terminalState={terminalTabsState}
        requestNavigation={requestNavigation}
      />
      {!detachedWindow ? (
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
      <ThirdPartyLicensesDialog />
    </ObservabilityProvider>
  )
}

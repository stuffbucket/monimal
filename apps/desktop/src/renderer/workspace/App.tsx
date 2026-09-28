import { ObservabilityProvider } from '@maximal/maximal-observability'
import { useEffect, useMemo, useState, type ReactElement } from 'react'

import { AppWorkspace } from '@maximal/maximal-client/renderer/AppWorkspace'
import { ThirdPartyLicensesDialog } from '@maximal/maximal-client/renderer/ThirdPartyLicensesDialog'
import { useAccountStatus } from '@maximal/maximal-client/renderer/useAccountStatus'
import type { SettingsSectionRequest } from '@maximal/maximal-client/renderer/settings/Settings'
import { createCoreSettingsCapabilities } from '@maximal/maximal-client/renderer/settings/capabilities'
import { readDetachedTerminal } from '@maximal/maximal-client/renderer/terminal/window-transfer'
import { createObservabilitySource } from '@maximal/maximal-client/renderer/traffic/source'
import { useTerminalTabs } from '@maximal/maximal-client/renderer/useTerminalTabs'
import {
  UnsavedChangesProvider,
  useGuardedNavigation,
} from '@maximal/maximal-client/renderer/unsaved-changes'

import { WorkspaceTerminalLauncher } from './WorkspaceTerminalLauncher'

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
          setSectionRequest(sectionId === null ? null : { id: sectionId })
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
      {/* Detached windows display transferred sessions; only the workspace launches new ones. */}
      {!detachedWindow && <WorkspaceTerminalLauncher terminalState={terminalTabsState} />}
      <ThirdPartyLicensesDialog />
    </ObservabilityProvider>
  )
}

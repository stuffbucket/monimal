import { ObservabilityProvider } from '@maximal/maximal-observability'
import { useEffect, useMemo, useState, type ReactElement } from 'react'

import { AppWorkspace } from '@maximal/maximal-client/renderer/AppWorkspace'
import {
  readMaterialPreference,
  subscribeMaterialPreference,
} from '@maximal/maximal-client/renderer/material-preference'
import { MaximalQueryProvider } from '@maximal/maximal-client/renderer/query-client'
import { ProjectBrowser } from '@maximal/maximal-client/renderer/projects/ProjectBrowser'
import type { ProjectSearchResult } from '@maximal/project-catalog'
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
import { CozyBackground } from './CozyBackground'
import { useAppearancePreference } from './useAppearancePreference'

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
    <MaximalQueryProvider>
      <UnsavedChangesProvider>
        <AppContent />
      </UnsavedChangesProvider>
    </MaximalQueryProvider>
  )
}

function AppContent(): ReactElement {
  const settings = useMemo(() => createCoreSettingsCapabilities(), [])
  const appearance = useAppearancePreference(settings)
  const [material, setMaterial] = useState(readMaterialPreference)
  const observability = useMemo(() => createObservabilitySource(), [])
  const [detachedWindow] = useState(readDetachedTerminal)
  const terminalTabsState = useTerminalTabs(detachedWindow)
  const { openSettings } = terminalTabsState
  const accountStatus = useAccountStatus(settings)
  const [sectionRequest, setSectionRequest] = useState<SettingsSectionRequest | null>(null)
  const [projectBrowserOpen, setProjectBrowserOpen] = useState(false)
  const requestNavigation = useGuardedNavigation()

  useEffect(() => subscribeMaterialPreference(setMaterial), [])

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
      <CozyBackground
        enabled={appearance?.backgroundEffectsEnabled === true}
        reducedMotion={appearance?.reducedMotionEnabled === true}
        material={material}
      />
      <AppWorkspace
        detachedWindow={detachedWindow}
        accountStatus={accountStatus}
        settings={settings}
        sectionRequest={sectionRequest}
        terminalState={terminalTabsState}
        requestNavigation={requestNavigation}
        openSettingsSection={(id) => setSectionRequest({ id })}
        onOpenProjects={() => setProjectBrowserOpen(true)}
      />
      {/* Detached windows display transferred sessions; only the workspace launches new ones. */}
      {!detachedWindow && <WorkspaceTerminalLauncher terminalState={terminalTabsState} />}
      {!detachedWindow ? (
        <ProjectBrowser
          open={projectBrowserOpen}
          onOpenChange={setProjectBrowserOpen}
          onOpenProject={async (project: ProjectSearchResult) => {
            const result = await window.maximal.terminal.launch({
              profileId: 'local',
              cwd: project.path,
              cols: 100,
              rows: 30,
            })
            terminalTabsState.rememberProfile('local')
            terminalTabsState.onTerminalLaunched(result)
          }}
          onOpenSettings={() => {
            setProjectBrowserOpen(false)
            terminalTabsState.openSettings()
            setSectionRequest({ id: 'settings-projects-heading' })
          }}
        />
      ) : null}
      <ThirdPartyLicensesDialog />
    </ObservabilityProvider>
  )
}

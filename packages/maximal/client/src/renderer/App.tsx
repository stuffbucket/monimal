import { ObservabilityProvider } from '@stuffbucket/maximal-observability'
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { TerminalLauncher } from 'stuffbucket-electron/renderer'

import { DEFAULT_SETTINGS_SECTION_ID } from '../shared/settings-sections'
import { WindowChrome } from './chrome/WindowChrome'
import { FirstRun } from './first-run/FirstRun'
import { AppWorkspace } from './AppWorkspace'
import type { SettingsSectionRequest } from './settings/Settings'
import { createCoreSettingsCapabilities } from './settings/capabilities'
import { createObservabilitySource } from './traffic/source'
import { useAuthStatus } from './useAuthStatus'
import { useTerminalTabs } from './useTerminalTabs'
import {
  UnsavedChangesProvider,
  useGuardedNavigation,
} from './unsaved-changes'

/**
 * Top-level composition.
 *
 * This is the one place that decides which surface is showing, and it exists
 * because that decision cannot be made by any surface individually. First-run,
 * Overview, Traffic, and Settings are built to be mounted; none of them decides
 * when it is the active surface.
 *
 * Auth gates the app: `first-run/` owns everything up to and including a
 * completed device flow — which is also where boot narration lives, since it is
 * the only surface that can be on screen while the sidecar is still starting.
 * Once authenticated, the working surfaces take over inside `frame/AppFrame`.
 *
 * Which surface is showing is that frame's active tab, so this file holds the
 * view but draws no switcher of its own: there is one set of navigation, and it
 * lives in the title bar where it is always reachable.
 *
 * Nothing here touches `ControlClient` or `window.maximal`. It reads auth
 * through the Settings capability seam; that adapter is the sole renderer
 * boundary to the named main-process bridge — including the application
 * menu's requests, which arrive on that seam for the same reason.
 */

export function App(): ReactElement {
  return (
    <UnsavedChangesProvider>
      <AppContent />
    </UnsavedChangesProvider>
  )
}

function AppContent(): ReactElement {
  // Built once for the app's lifetime. Electron main owns sidecar replacement;
  // this adapter keeps one stable named-bridge subscription across restarts.
  // Recreating it per render would drop live subscriptions and defeat that.
  const settings = useMemo(() => createCoreSettingsCapabilities(), [])
  const observability = useMemo(() => createObservabilitySource(), [])

  const authenticated = useAuthStatus(settings)
  const terminalTabsState = useTerminalTabs(authenticated)
  const { activeTab, setActiveTab } = terminalTabsState
  const [sectionRequest, setSectionRequest] = useState<SettingsSectionRequest | null>(null)
  const requestNavigation = useGuardedNavigation()

  /* The application menu chooses the surface here and the section there. A new
     object keeps every request observable without a parallel counter. */
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

  // `null` means "not answered yet" and is deliberately NOT treated as signed
  // out: first-run handles both the pre-auth and the still-booting cases, so
  // rendering it while the answer is unknown is correct rather than a fallback.
  // Wrapped, not bare. First run needs a frame for the same reason every other
  // surface does — without one the window has no drag region and cannot be
  // moved, and this is the screen a new user meets first.
  if (authenticated !== true && activeTab !== 'settings')
    return (
      <WindowChrome>
        <FirstRun />
      </WindowChrome>
    )

  const signedOut = authenticated !== true
  return (
    <ObservabilityProvider source={observability}>
      <AppWorkspace
        authenticated={authenticated}
        settings={settings}
        sectionRequest={sectionRequest}
        terminalState={terminalTabsState}
        requestNavigation={requestNavigation}
      />
      {!signedOut ? (
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

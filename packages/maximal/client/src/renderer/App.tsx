import { ObservabilityProvider } from '@stuffbucket/maximal-observability'
import { useEffect, useMemo, useState, type ReactElement } from 'react'

import { DEFAULT_SETTINGS_SECTION_ID } from '../shared/settings-sections'
import { WindowChrome } from './chrome/WindowChrome'
import { FirstRun } from './first-run/FirstRun'
import { AppFrame, type View } from './frame/AppFrame'
import { Overview } from './overview/Overview'
import { Settings, type SettingsSectionRequest } from './settings/Settings'
import { createCoreSettingsCapabilities } from './settings/capabilities'
import { Traffic } from './traffic/Traffic'
import { createObservabilitySource } from './traffic/source'

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

/** How often to re-read auth status while nothing is pushing changes.
 *  `subscribe()` is the fast path; this is the safety net for a missed event.
 *  It matters most here: this is the one consumer that gates the ENTIRE app
 *  on `authenticated`, so a missed push strands a signed-in user on the
 *  first-run screen with no route back in. */
const POLL_MS = 3_000

export function App(): ReactElement {
  // Built once for the app's lifetime. Electron main owns sidecar replacement;
  // this adapter keeps one stable named-bridge subscription across restarts.
  // Recreating it per render would drop live subscriptions and defeat that.
  const settings = useMemo(() => createCoreSettingsCapabilities(), [])
  const observability = useMemo(() => createObservabilitySource(), [])

  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [view, setView] = useState<View>('overview')
  const [sectionRequest, setSectionRequest] = useState<SettingsSectionRequest | null>(null)

  /* The application menu chooses the surface here and the section there. A new
     object keeps every request observable without a parallel counter. */
  useEffect(
    () =>
      settings.onOpenRequest((sectionId) => {
        setView('settings')
        setSectionRequest({ id: sectionId ?? DEFAULT_SETTINGS_SECTION_ID })
      }),
    [settings],
  )

  useEffect(() => {
    let cancelled = false

    const refresh = async (): Promise<void> => {
      try {
        const status = await settings.account.status()
        if (!cancelled) setAuthenticated(status.state === 'authenticated')
      } catch {
        // Core unreachable or still starting. Leave the current answer alone —
        // `null` keeps showing first-run, which is where boot status renders,
        // and flipping an authenticated user out of the app on one transient
        // failure would be worse than waiting.
      }
    }

    void refresh()
    const unsubscribe = settings.subscribe(() => void refresh())
    const poll = setInterval(() => void refresh(), POLL_MS)
    return () => {
      cancelled = true
      unsubscribe()
      clearInterval(poll)
    }
  }, [settings])

  // `null` means "not answered yet" and is deliberately NOT treated as signed
  // out: first-run handles both the pre-auth and the still-booting cases, so
  // rendering it while the answer is unknown is correct rather than a fallback.
  // Wrapped, not bare. First run needs a frame for the same reason every other
  // surface does — without one the window has no drag region and cannot be
  // moved, and this is the screen a new user meets first.
  if (authenticated !== true && view !== 'settings')
    return (
      <WindowChrome>
        <FirstRun />
      </WindowChrome>
    )

  /*
   * One surface mounted at a time, deliberately. Each runs a data lifecycle of
   * its own — a poll, a subscription, a live snapshot — and keeping inactive
   * surfaces mounted would keep their work running out of view.
   */
  const signedOut = authenticated !== true
  return (
    <ObservabilityProvider source={observability}>
      <AppFrame
        view={view}
        onSelectView={setView}
        availableViews={signedOut ? ['settings'] : undefined}
      >
        {!signedOut && view === 'overview' ? <Overview /> : null}
        {!signedOut && view === 'traffic' ? <Traffic /> : null}
        {view === 'settings' ? (
          <Settings
            capabilities={settings}
            request={sectionRequest}
            onBack={signedOut ? () => setView('overview') : undefined}
          />
        ) : null}
      </AppFrame>
    </ObservabilityProvider>
  )
}

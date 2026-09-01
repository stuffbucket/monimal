import { useEffect, useMemo, useState, type ReactElement } from 'react'

import { Dashboard } from './dashboard/Dashboard'
import { FirstRun } from './first-run/FirstRun'
import { Settings } from './settings/Settings'
import { createCoreSettingsCapabilities } from './settings/capabilities'
import { Workspace } from './workspace/Workspace'
import { createPlaceholderSource } from './workspace/source'

/**
 * Top-level composition.
 *
 * This is the one place that decides which surface is showing, and it exists
 * because that decision cannot be made by any surface individually — each of
 * `first-run/`, `workspace/`, `dashboard/` and `settings/` was built to be
 * mounted, and none of them could know what mounts it.
 *
 * Auth gates the app: `first-run/` owns everything up to and including a
 * completed device flow — which is also where boot narration lives, since it is
 * the only surface that can be on screen while the sidecar is still starting.
 * Once authenticated, the working surfaces take over.
 *
 * Nothing here touches `ControlClient` or `window.maximal`. It reads auth
 * through the Settings capability seam; that adapter is the sole renderer
 * boundary to the named main-process bridge.
 */

/** How often to re-read auth status while nothing is pushing changes.
 *  `subscribe()` is the fast path; this is the safety net for a missed event.
 *  It matters most here: this is the one consumer that gates the ENTIRE app
 *  on `authenticated`, so a missed push strands a signed-in user on the
 *  first-run screen with no route back in. */
const POLL_MS = 3_000

type View = 'dashboard' | 'workspace' | 'settings'

const VIEWS: ReadonlyArray<{ id: View; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'workspace', label: 'Runs' },
  { id: 'settings', label: 'Settings' },
]

export function App(): ReactElement {
  // Built once for the app's lifetime. Electron main owns sidecar replacement;
  // this adapter keeps one stable named-bridge subscription across restarts.
  // Recreating it per render would drop live subscriptions and defeat that.
  const settings = useMemo(() => createCoreSettingsCapabilities(), [])
  const source = useMemo(() => createPlaceholderSource(), [])

  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [view, setView] = useState<View>('dashboard')

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
  if (authenticated !== true) return <FirstRun />

  return (
    <div className="app-shell">
      <nav className="app-shell__views" aria-label="Views">
        {VIEWS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className="app-shell__view-tab"
            aria-current={view === id ? 'page' : undefined}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="app-shell__surface">
        {view === 'dashboard' ? <Dashboard source={source} /> : null}
        {view === 'workspace' ? <Workspace source={source} /> : null}
        {view === 'settings' ? <Settings capabilities={settings} /> : null}
      </div>
    </div>
  )
}

// ---- Styles ----
//
// Injected once on import, guarded by element id. Three things live here that
// no other file owns:
//
// 1. The height chain. The shell frame's root is `height: 100%`, and nothing
//    between it and the viewport establishes a height, so the three-panel
//    frame sizes to its content instead of the window and the whole document
//    scrolls. Fixed here rather than in `index.html` so the chain lives with
//    the component that depends on it.
// 2. Rules for this file's own view switcher. `[aria-current='page']` carries
//    the selection by colour AND weight, so selection is never colour alone.

const APP_SHELL_CSS = `
html,
body,
#root {
  height: 100%;
  margin: 0;
}

/*
 * The window background belongs on the DOCUMENT, not on \`.app-shell\`.
 *
 * \`.app-shell\` only exists once the user is authenticated, so a background
 * set there leaves first-run painting light text on the browser's default
 * white canvas — near-invisible, on the first screen a new user sees. Setting
 * \`color\` here too means any surface rendered outside \`.app-shell\` inherits
 * a legible pair rather than depending on its own rules.
 */
html,
body {
  color: var(--shell-text, #f5f5f5);
  background: var(--shell-background, #16181d);
}

.app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--shell-text, #f5f5f5);
  background: var(--shell-background, #16181d);
  font: 400 14px/1.5 system-ui, sans-serif;
}

.app-shell__views {
  display: flex;
  flex: none;
  gap: var(--shell-space-2, 8px);
  padding: var(--shell-space-2, 8px) var(--shell-space-4, 16px);
  border-bottom: 1px solid var(--shell-border, #2a2a2a);
  background: var(--shell-background, #16181d);
}

.app-shell__view-tab {
  appearance: none;
  border: 0;
  border-radius: var(--shell-radius, 6px);
  padding: var(--shell-space-2, 8px) var(--shell-space-3, 12px);
  color: var(--shell-text-muted, #8a8a8a);
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.app-shell__view-tab:hover {
  color: var(--shell-text, #f5f5f5);
  background: var(--shell-hover, rgb(255 255 255 / 0.06));
}

.app-shell__view-tab[aria-current='page'] {
  color: var(--shell-accent, #5198a6);
  background: var(--shell-accent-muted, rgb(81 152 166 / 0.12));
  font-weight: 500;
}

.app-shell__view-tab:focus-visible {
  outline: 2px solid var(--shell-focus, var(--shell-accent, #5198a6));
  outline-offset: 2px;
}

.app-shell__surface {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
}
`

const APP_SHELL_STYLE_ID = 'app-shell-styles'

if (typeof document !== 'undefined' && !document.getElementById(APP_SHELL_STYLE_ID)) {
  const style = document.createElement('style')
  style.id = APP_SHELL_STYLE_ID
  style.textContent = APP_SHELL_CSS
  document.head.appendChild(style)
}

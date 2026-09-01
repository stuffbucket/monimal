import type { ReactElement, ReactNode } from 'react'
import { getTabPanelId, getTabTriggerId, TitleBar } from 'stuffbucket-electron/renderer'

/**
 * The window frame for surfaces that have no navigation.
 *
 * It exists for one reason that is not cosmetic: the window is created with a
 * hidden native title bar, and the drag region comes from the shell
 * stylesheet's `.sb-shell .titlebar` rule, which only `TitleBar` emits. A
 * surface rendered outside a frame is a window the user cannot move. First run
 * is exactly that surface, and it is the first screen a new user sees.
 *
 * `ShellLayout` is the wrong frame here. It cannot express "no navigation": its
 * panels still render their separators, and it injects two panel-toggle buttons
 * into the title bar that would operate on empty panels — controls that appear
 * to do something and do nothing.
 *
 * The `.sb-shell` root also carries the package's own type and colour rules, so
 * anything inside it inherits a real font rather than the browser's default
 * serif.
 */

/** Namespaces the tab ids. Unrelated to the authenticated frame's: these are
 *  two different frames and never mount at the same time. */
const TAB_ID_BASE = 'maximal-chrome-documents'
const SHELL_TAB = 'maximal'

export function WindowChrome({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="sb-shell app">
      {/*
       * One tab, not zero. `TitleBar` always renders a `role="tablist"`, and an
       * empty one violates `aria-required-children`; the panel below also names
       * a trigger through `aria-labelledby`, which would dangle with no tab to
       * point at. Selecting the only tab cannot change anything, so the handler
       * is inert by construction rather than by a guard.
       */}
      <TitleBar
        tabIdBase={TAB_ID_BASE}
        tabs={[{ id: SHELL_TAB, title: 'Maximal' }]}
        activeTab={SHELL_TAB}
        onSelectTab={() => {}}
        tabsLabel="Maximal"
      />
      <div className="panel panel--canvas window-chrome__panel">
        <div
          className="tabpanel"
          role="tabpanel"
          id={getTabPanelId(TAB_ID_BASE, SHELL_TAB)}
          aria-labelledby={getTabTriggerId(TAB_ID_BASE, SHELL_TAB)}
          tabIndex={0}
        >
          <div className="canvas">{children}</div>
        </div>
      </div>
    </div>
  )
}

// ---- Styles ----
//
// One rule, for the one thing the package cannot supply here.
//
// The package's height chain is `.sb-shell.app` (a flex column) -> a flex
// container -> `.panel`. `ShellLayout` provides the middle link; this frame
// deliberately does not, since that link is the panel group whose separators
// and toggles are exactly what a no-navigation frame must not render. The
// package's own `.column` is not a substitute: it carries `flex: 1` but no
// `display: flex`, so it stretches itself without stretching what it holds.
//
// `.panel` has `min-height: 0` and a flex column of its own, but no `flex`, so
// as a direct child of the root it sizes to its content and the rest of the
// window is bare background. Giving it a grow factor completes the chain, and
// `.tabpanel` and `.canvas` already carry theirs.
const WINDOW_CHROME_CSS = `
.sb-shell .window-chrome__panel {
  flex: 1;
  min-height: 0;
}
`

const WINDOW_CHROME_STYLE_ID = 'window-chrome-styles'

if (typeof document !== 'undefined' && !document.getElementById(WINDOW_CHROME_STYLE_ID)) {
  const style = document.createElement('style')
  style.id = WINDOW_CHROME_STYLE_ID
  style.textContent = WINDOW_CHROME_CSS
  document.head.appendChild(style)
}

import type { ReactElement, ReactNode } from 'react'

import { SWITCHABLE_UI_MODES, UI_MODE_LABELS, useUiMode } from '@maximal/maximal-client/renderer/useUiMode'

/** Development-only strip above the legacy title bar that reloads into another renderer. */
export function UiModeStrip({ children }: { children: ReactNode }): ReactElement {
  const { state, switching, switchTo } = useUiMode()
  const active = state?.switchable === true
  return (
    <>
      {active ? (
        <div className="ui-mode-strip" role="region" aria-label="Renderer switch">
          <span>{`Showing the ${UI_MODE_LABELS.legacy}`}</span>
          {SWITCHABLE_UI_MODES.filter((mode) => mode !== 'legacy').map((mode) => (
            <button disabled={switching} key={mode} onClick={() => switchTo(mode)} type="button">
              {`Switch to ${UI_MODE_LABELS[mode]}`}
            </button>
          ))}
        </div>
      ) : null}
      <div className="ui-mode-strip__frame" data-active={active ? '' : undefined}>
        {children}
      </div>
    </>
  )
}

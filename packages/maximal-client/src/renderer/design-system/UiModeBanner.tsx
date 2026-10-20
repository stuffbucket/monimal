import type { ReactElement } from 'react'
import { Button } from '@maximal/maximal-design-system'

import type { UiMode } from '../../shared/host'
import { SWITCHABLE_UI_MODES, UI_MODE_LABELS, useUiMode } from '../useUiMode'

/** Development-only banner above the tab bar that reloads into another renderer. */
export function UiModeBanner({ current }: { current: UiMode }): ReactElement | null {
  const { state, switching, switchTo } = useUiMode()
  if (state?.switchable !== true) return null
  return (
    <div className="maximal-app-banner" role="region" aria-label="Renderer switch">
      <span>{`Showing the ${UI_MODE_LABELS[current]}`}</span>
      {SWITCHABLE_UI_MODES.filter((mode) => mode !== current).map((mode) => (
        <Button disabled={switching} key={mode} onClick={() => switchTo(mode)} variant="ghost">
          {`Switch to ${UI_MODE_LABELS[mode]}`}
        </Button>
      ))}
    </div>
  )
}

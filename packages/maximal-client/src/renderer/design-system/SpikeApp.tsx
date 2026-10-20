import type { ReactElement } from 'react'
import { WorkspaceShellSpike } from '@maximal/maximal-design-system'

import { UiModeBanner } from './UiModeBanner'

const NATIVE_WINDOW_CONTROLS =
  typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')

/** The Base UI workspace spike with fixture content, mounted as an application window. */
export function SpikeApp(): ReactElement {
  return (
    <div className="maximal-app-frame">
      <UiModeBanner current="spike" />
      <WorkspaceShellSpike fill nativeWindowControls={NATIVE_WINDOW_CONTROLS} />
    </div>
  )
}

import { useMemo, useState, type ReactElement } from 'react'

import { createCoreSettingsCapabilities } from '../settings/capabilities'
import { readDetachedTerminal } from '../terminal/window-transfer'
import { useTerminalTabs } from '../useTerminalTabs'
import { DesignSystemWorkspace } from './DesignSystemWorkspace'
import { UiModeBanner } from './UiModeBanner'

/** Workspace window drawn entirely from `@maximal/maximal-design-system`. */
export function DesignSystemApp(): ReactElement {
  const settings = useMemo(() => createCoreSettingsCapabilities(), [])
  const [detachedWindow] = useState(readDetachedTerminal)
  const terminalState = useTerminalTabs(detachedWindow)

  return (
    <div className="maximal-app-frame">
      {detachedWindow ? null : <UiModeBanner current="design-system" />}
      <DesignSystemWorkspace
        terminalState={terminalState}
        typography={settings.terminalTypography}
      />
    </div>
  )
}

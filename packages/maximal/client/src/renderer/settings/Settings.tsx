import { useState, type ReactElement, type ReactNode } from 'react'

import { Button, SettingsPage } from 'stuffbucket-electron/renderer'

import {
  DEFAULT_SETTINGS_SECTION_ID,
  type SettingsSectionId,
} from '../../shared/settings-sections'
import { SurfaceRail, useTabPanelId } from '../frame/AppFrame'
import { useGuardedNavigation } from '../unsaved-changes'
import type { SettingsCapabilities } from './capabilities'
import { SETTINGS_SECTION_VIEWS } from './manifest'
import { SettingsNavigationProvider } from './navigation'
import { SectionRail } from './SectionRail'
import { SettingsHeaderActionsProvider } from './header-actions'
import { ensureSettingsStyles } from './settings-styles'

// The Settings surface. Composition only: `shared/settings-sections.ts` owns
// which sections exist, joined to their icons and panels in `./manifest`.
// Each section owns its own data lifecycle against `SettingsCapabilities`.
// The selected manifest label names the shared SettingsPage heading. Building
// the capabilities instance via `createCoreSettingsCapabilities` is deliberately somebody
// else's decision. The window frame is too: it belongs to ../frame/AppFrame,
// and this surface reaches the parts of it that are its own through that
// module's slots.
//
// The rail and the panels are both projections of the manifest. They used to
// be two hand-written lists in this file, which could disagree and eventually
// would: a section in the rail with no panel scrolls to nothing.
//

/** A section the application menu asked to be shown. */
export interface SettingsSectionRequest {
  id: SettingsSectionId
}

interface SettingsProps {
  capabilities: SettingsCapabilities
  request?: SettingsSectionRequest | null
  onBack?: () => void
}

export function Settings({
  capabilities,
  request = null,
  onBack,
}: SettingsProps): ReactElement {
  ensureSettingsStyles()
  const panelId = useTabPanelId()
  const [current, setCurrent] = useState<SettingsSectionId>(
    request?.id ?? DEFAULT_SETTINGS_SECTION_ID,
  )
  const [seenRequest, setSeenRequest] = useState(request)
  const [headerActions, setHeaderActions] = useState<ReactNode>(null)
  const requestNavigation = useGuardedNavigation()

  if (request !== seenRequest) {
    setSeenRequest(request)
    if (request !== null) setCurrent(request.id)
  }

  const currentView = SETTINGS_SECTION_VIEWS.find(({ id }) => id === current)!
  const CurrentPanel = currentView.Panel

  return (
    <>
      <SurfaceRail>
        {(collapsed) => (
          <SectionRail
            sections={SETTINGS_SECTION_VIEWS}
            current={current}
            controls={panelId}
            onSelect={(next) => {
              if (next !== current) requestNavigation(() => setCurrent(next))
            }}
            collapsed={collapsed}
          />
        )}
      </SurfaceRail>

      <SettingsPage
        title={currentView.label}
        actions={
          onBack || headerActions ? (
            <>
              {onBack ? <Button onClick={onBack}>Back to sign in</Button> : null}
              {headerActions}
            </>
          ) : undefined
        }
      >
        <SettingsHeaderActionsProvider
          value={{ hasHeader: true, setActions: setHeaderActions }}
        >
          <SettingsNavigationProvider
            value={(next) => {
              if (next !== current) requestNavigation(() => setCurrent(next))
            }}
          >
            <CurrentPanel key={current} capabilities={capabilities} />
          </SettingsNavigationProvider>
        </SettingsHeaderActionsProvider>
      </SettingsPage>
    </>
  )
}

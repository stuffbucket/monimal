import { useEffect, type ReactElement } from 'react'

import { Button, Note } from 'stuffbucket-electron/renderer'

import type { SettingsCapabilities } from '../capabilities'
import { useSettingsHeaderActions } from '../header-actions'
import { ConnectionsManagedClientsSection } from './ConnectionsManagedClientsSection'
import {
  AdvancedConnectionsSection,
  AppIntegrationsSection,
  ConnectionsDialogs,
  LocalAddressesSection,
  ManualClientsSection,
} from './ConnectionsSectionParts'
import { useConnectionsSectionState } from './useConnectionsSectionState'

interface ConnectionsSectionProps {
  capabilities: SettingsCapabilities
}

export function ConnectionsSection({
  capabilities,
}: ConnectionsSectionProps): ReactElement {
  const { hasHeader, setActions: setHeaderActions } = useSettingsHeaderActions()
  const section = useConnectionsSectionState(capabilities)

  useEffect(() => {
    setHeaderActions(
      <Button size="sm" variant="primary" onClick={section.rescan} disabled={section.busy}>
        {section.refreshing ? 'Scanning…' : 'Rescan'}
      </Button>,
    )
    return () => setHeaderActions(null)
  }, [section.busy, section.refreshing, section.rescan, setHeaderActions])

  return (
    <section className="settings-section" aria-busy={section.busy}>
      {!hasHeader ? (
        <div className="settings-section__actions">
          <Button size="sm" variant="primary" onClick={section.rescan} disabled={section.busy}>
            {section.refreshing ? 'Scanning…' : 'Rescan'}
          </Button>
        </div>
      ) : null}
      <Note>Connect tools to Maximal and identify their local traffic.</Note>

      {section.error ? (
        <Note status="failed" live="assertive">
          {section.error}
        </Note>
      ) : null}

      <LocalAddressesSection proxyUrl={section.proxyUrl} openAiUrl={section.openAiUrl} />
      <ConnectionsManagedClientsSection
        connections={section.connections}
        installations={section.installations}
        revealed={section.revealed}
        busy={section.busy}
        busyAction={section.busyAction}
        onConnectionAction={(connection, action) => {
          void section.actOnConnection(connection, action)
        }}
        onRevealCredential={(connection) => {
          void section.revealCredential(connection)
        }}
        onHideCredential={section.hideCredential}
      />
      <AppIntegrationsSection
        apps={section.apps}
        appEntries={section.appEntries}
        busy={section.busy}
        busyAction={section.busyAction}
        onSelectFixTarget={section.setFixTarget}
      />
      <ManualClientsSection
        connections={section.connections}
        busy={section.busy}
        busyAction={section.busyAction}
        onOpenManualKeys={() => {
          void section.openManualKeys()
        }}
      />
      <AdvancedConnectionsSection
        connections={section.connections}
        busy={section.busy}
        onSetEnforcement={(enforcing) => {
          void section.setEnforcement(enforcing)
        }}
      />
      <ConnectionsDialogs
        keysOpen={section.keysOpen}
        manualClients={section.clients}
        busy={section.busy}
        fixTarget={section.fixTarget}
        onOpenManualKeysChange={section.setKeysOpen}
        onAddManualClient={section.addManualClient}
        onRemoveManualClient={section.removeManualClient}
        onToggleManualClient={section.toggleManualClient}
        onDismissManualKeys={section.dismissManualKeys}
        onDismissFixTarget={section.dismissFixTarget}
        onConfirmFixTarget={(app) => {
          void section.fixApp(app)
        }}
      />
    </section>
  )
}
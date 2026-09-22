import type { ReactElement } from 'react'

import {
  ApiKeysDialog,
  Button,
  CopyButton,
  Dialog,
  Field,
  FieldList,
  Note,
  SettingsGroup,
  SettingsItem,
  SettingsSection,
  Switch,
  type ApiClient,
} from 'stuffbucket-electron/renderer'

import type {
  AppEntry,
  AppsListResponse,
  ConnectionsListResponse,
} from '../capabilities'
import { HEALTH_ISSUE_COPY } from './connections-section-content'

interface LocalAddressesSectionProps {
  proxyUrl: string | null
  openAiUrl: string | null
}

interface AppIntegrationsSectionProps {
  apps: AppsListResponse | null
  appEntries: AppEntry[]
  busy: boolean
  busyAction: string | null
  onSelectFixTarget: (app: AppEntry) => void
}

interface ManualClientsSectionProps {
  connections: ConnectionsListResponse | null
  busy: boolean
  busyAction: string | null
  onOpenManualKeys: () => void
}

interface AdvancedConnectionsSectionProps {
  connections: ConnectionsListResponse | null
  busy: boolean
  onSetEnforcement: (enforcing: boolean) => void
}

interface ConnectionsDialogsProps {
  keysOpen: boolean
  manualClients: ApiClient[]
  busy: boolean
  fixTarget: AppEntry | null
  onOpenManualKeysChange: (open: boolean) => void
  onAddManualClient: (label: string) => void
  onRemoveManualClient: (id: string) => void
  onToggleManualClient: (id: string, enabled: boolean) => void
  onDismissManualKeys: () => void
  onDismissFixTarget: () => void
  onConfirmFixTarget: (app: AppEntry) => void
}

function appDescription(app: AppEntry): string {
  if (app.status === 'not-installed') return 'Not installed'
  return app.enabled ? 'Routing through Maximal' : 'Not enabled'
}

export function LocalAddressesSection({ proxyUrl, openAiUrl }: LocalAddressesSectionProps): ReactElement {
  return (
    <SettingsSection title="Local addresses">
      {proxyUrl === null || openAiUrl === null ? (
        <Note live="polite">Loading connection details…</Note>
      ) : (
        <FieldList>
          <Field
            label="Anthropic base"
            value={
              <>
                <code>{proxyUrl}</code>
                <CopyButton text={proxyUrl} about="the Anthropic base address" />
              </>
            }
          />
          <Field
            label="OpenAI base"
            value={
              <>
                <code>{openAiUrl}</code>
                <CopyButton text={openAiUrl} about="the OpenAI base address" />
              </>
            }
          />
          <Field
            label="Routes"
            value={
              <>
                <code>/v1/messages</code>, <code>/v1/chat/completions</code>, <code>/v1/models</code>
              </>
            }
          />
        </FieldList>
      )}
    </SettingsSection>
  )
}

export function AppIntegrationsSection({
  apps,
  appEntries,
  busy,
  busyAction,
  onSelectFixTarget,
}: AppIntegrationsSectionProps): ReactElement {
  return (
    <SettingsSection
      title="App integrations"
      description="Claude Code and Claude Desktop route through Maximal by configuring their own settings files directly."
    >
      {apps === null ? (
        <Note live="polite">Checking app integrations…</Note>
      ) : appEntries.length === 0 ? (
        <Note>No app integrations were detected.</Note>
      ) : (
        <SettingsGroup layout="grid">
          {appEntries.map((app) => (
            <SettingsItem
              key={app.id}
              title={app.name}
              description={appDescription(app)}
              actions={
                !app.health.ok ? (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => onSelectFixTarget(app)}
                    testId={`app-${app.id}-fix`}
                  >
                    {busyAction === `fix:${app.id}` ? 'Fixing…' : 'Fix settings…'}
                  </Button>
                ) : undefined
              }
            >
              {!app.health.ok && app.health.issue ? (
                <Note status="failed" live="assertive">
                  {HEALTH_ISSUE_COPY[app.health.issue]}
                </Note>
              ) : (
                <Note>Configuration is up to date.</Note>
              )}
            </SettingsItem>
          ))}
        </SettingsGroup>
      )}
    </SettingsSection>
  )
}

export function ManualClientsSection({
  connections,
  busy,
  busyAction,
  onOpenManualKeys,
}: ManualClientsSectionProps): ReactElement {
  return (
    <SettingsSection
      title="Manual clients"
      description="Create named credentials for scripts and clients Maximal cannot configure."
    >
      {connections === null ? (
        <Note live="polite">Loading credentials…</Note>
      ) : (
        <SettingsGroup>
          <SettingsItem
            title="Credentials"
            description={`${connections.manual_credentials.length} ${
              connections.manual_credentials.length === 1 ? 'credential' : 'credentials'
            }`}
            actions={
              <Button onClick={onOpenManualKeys} disabled={busy}>
                {busyAction === 'manual-keys' ? 'Loading credentials…' : 'Manage credentials…'}
              </Button>
            }
          />
        </SettingsGroup>
      )}
    </SettingsSection>
  )
}

export function AdvancedConnectionsSection({
  connections,
  busy,
  onSetEnforcement,
}: AdvancedConnectionsSectionProps): ReactElement {
  return (
    <SettingsSection title="Advanced">
      {connections === null ? (
        <Note live="polite">Loading access policy…</Note>
      ) : (
        <SettingsGroup>
          <SettingsItem
            title="Require known keys"
            description="When off, anonymous local requests are allowed. Requests carrying a known enabled key are still attributed to that client."
            control={
              <Switch
                label="Require known keys"
                displayLabel={null}
                checked={connections.require_known_keys}
                disabled={busy}
                onChange={onSetEnforcement}
                testId="api-key-enforcement"
              />
            }
          />
        </SettingsGroup>
      )}
    </SettingsSection>
  )
}

export function ConnectionsDialogs({
  keysOpen,
  manualClients,
  busy,
  fixTarget,
  onOpenManualKeysChange,
  onAddManualClient,
  onRemoveManualClient,
  onToggleManualClient,
  onDismissManualKeys,
  onDismissFixTarget,
  onConfirmFixTarget,
}: ConnectionsDialogsProps): ReactElement {
  return (
    <>
      <ApiKeysDialog
        open={keysOpen}
        onOpenChange={(open) => {
          onOpenManualKeysChange(open)
          if (!open) onDismissManualKeys()
        }}
        clients={manualClients}
        onAddClient={onAddManualClient}
        onRemoveClient={onRemoveManualClient}
        onToggleClient={onToggleManualClient}
      />

      <Dialog
        open={fixTarget !== null}
        onOpenChange={(open) => {
          if (!open) onDismissFixTarget()
        }}
        title={fixTarget ? `Fix ${fixTarget.name} settings?` : 'Fix app settings?'}
        description="Re-applies Maximal's configuration for this app."
        testId="app-fix-confirmation"
      >
        {fixTarget ? (
          <>
            <h2 className="settings-dialog__heading">Fix {fixTarget.name} settings?</h2>
            <p>
              {fixTarget.health.issue ? HEALTH_ISSUE_COPY[fixTarget.health.issue] : null}{' '}
              Maximal will re-apply its configuration for {fixTarget.name}, overwriting only the
              fields it manages.
            </p>
            <div className="settings-dialog__actions">
              <Button onClick={onDismissFixTarget} disabled={busy}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => onConfirmFixTarget(fixTarget)} disabled={busy}>
                Fix settings
              </Button>
            </div>
          </>
        ) : null}
      </Dialog>
    </>
  )
}
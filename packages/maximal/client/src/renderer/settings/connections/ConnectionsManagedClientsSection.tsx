import type { ReactElement } from 'react'

import {
  Button,
  CopyButton,
  Field,
  FieldList,
  Note,
  SettingsGroup,
  SettingsItem,
  SettingsSection,
  Switch,
} from 'stuffbucket-electron/renderer'

import type {
  ClientInstallation,
  ConnectionAction,
  ConnectionEntry,
  ConnectionsListResponse,
} from '../capabilities'
import { connectionToggleAction, STATUS_LABELS } from './connections-section-content'

interface ConnectionsManagedClientsSectionProps {
  connections: ConnectionsListResponse | null
  installations: ReadonlyMap<string, ClientInstallation>
  revealed: Record<string, string>
  busy: boolean
  busyAction: string | null
  onConnectionAction: (connection: ConnectionEntry, action: ConnectionAction) => void
  onRevealCredential: (connection: ConnectionEntry) => void
  onHideCredential: (credentialId: string) => void
}

interface ManagedConnectionItemProps {
  connection: ConnectionEntry
  installation: ClientInstallation | undefined
  revealedKey: string | undefined
  busy: boolean
  busyAction: string | null
  onConnectionAction: (connection: ConnectionEntry, action: ConnectionAction) => void
  onRevealCredential: (connection: ConnectionEntry) => void
  onHideCredential: (credentialId: string) => void
}

function ManagedCredentialField({
  connection,
  revealedKey,
  busy,
  busyAction,
  onRevealCredential,
  onHideCredential,
}: Pick<ManagedConnectionItemProps, 'connection' | 'revealedKey' | 'busy' | 'busyAction' | 'onRevealCredential' | 'onHideCredential'>): ReactElement | null {
  const credential = connection.credential
  if (!credential) return null

  return (
    <Field
      label="Credential"
      value={
        <>
          <span>Managed · {credential.enabled ? 'Enabled' : 'Disabled'}</span>
          {revealedKey === undefined ? (
            <Button size="sm" disabled={busy} onClick={() => onRevealCredential(connection)}>
              {busyAction === `reveal:${credential.id}` ? 'Revealing…' : 'Reveal'}
            </Button>
          ) : (
            <>
              <code>{revealedKey}</code>
              <CopyButton text={revealedKey} about={`the ${connection.name} credential`} />
              <Button size="sm" onClick={() => onHideCredential(credential.id)}>
                Hide
              </Button>
            </>
          )}
        </>
      }
    />
  )
}

function ManagedConnectionItem({
  connection,
  installation,
  revealedKey,
  busy,
  busyAction,
  onConnectionAction,
  onRevealCredential,
  onHideCredential,
}: ManagedConnectionItemProps): ReactElement {
  const configurationPath = connection.ownership?.target_path
    ?? installation?.configuration_path
    ?? null
  const checked = connection.status === 'connected'
  const toggleAction = connectionToggleAction(connection)

  return (
    <SettingsItem
      title={connection.name}
      description={STATUS_LABELS[connection.status]}
      control={
        <Switch
          label={`Maximal manages ${connection.name}`}
          displayLabel={null}
          tooltip={
            checked
              ? `${connection.name} is managed by Maximal`
              : `${connection.name} is not managed by Maximal`
          }
          layout="compact"
          checked={checked}
          disabled={busy || toggleAction === null}
          testId={`connection-${connection.id}-toggle`}
          onChange={() => {
            if (toggleAction !== null) onConnectionAction(connection, toggleAction)
          }}
        />
      }
    >
      <FieldList>
        <Field
          label="Client"
          value={
            installation?.client_path ? (
              <>
                <code>{installation.client_path}</code>
                <CopyButton text={installation.client_path} about={`the ${connection.name} client path`} />
              </>
            ) : (
              'Not detected'
            )
          }
        />
        <Field
          label="Configuration"
          value={
            configurationPath ? (
              <>
                <code>{configurationPath}</code>
                <CopyButton text={configurationPath} about={`the ${connection.name} configuration path`} />
              </>
            ) : (
              'Not available'
            )
          }
        />
        {connection.ownership ? (
          <Field
            label="Owner"
            value={`${connection.ownership.configurator_id}, process ${connection.ownership.pid}`}
          />
        ) : null}
        <ManagedCredentialField
          connection={connection}
          revealedKey={revealedKey}
          busy={busy}
          busyAction={busyAction}
          onRevealCredential={onRevealCredential}
          onHideCredential={onHideCredential}
        />
      </FieldList>
      <div className="settings-list__content">
        {connection.detail ? (
          <span className="settings-list__detail">{connection.detail}</span>
        ) : null}
        {connection.recovery?.preserved_paths.length ? (
          <span className="settings-list__detail">
            Preserved {connection.recovery.preserved_paths.length} externally changed field
            {connection.recovery.preserved_paths.length === 1 ? '' : 's'}.
          </span>
        ) : null}
      </div>
    </SettingsItem>
  )
}

export function ConnectionsManagedClientsSection({
  connections,
  installations,
  revealed,
  busy,
  busyAction,
  onConnectionAction,
  onRevealCredential,
  onHideCredential,
}: ConnectionsManagedClientsSectionProps): ReactElement {
  return (
    <SettingsSection
      title="Managed clients"
      description="Tools that Maximal can configure and manage."
    >
      {connections === null ? (
        <Note live="polite">Scanning for supported clients…</Note>
      ) : connections.clients.length === 0 ? (
        <Note>No supported clients were detected.</Note>
      ) : (
        <SettingsGroup>
          {connections.clients.map((connection) => (
            <ManagedConnectionItem
              key={connection.id}
              connection={connection}
              installation={installations.get(connection.id)}
              revealedKey={connection.credential ? revealed[connection.credential.id] : undefined}
              busy={busy}
              busyAction={busyAction}
              onConnectionAction={onConnectionAction}
              onRevealCredential={onRevealCredential}
              onHideCredential={onHideCredential}
            />
          ))}
        </SettingsGroup>
      )}
    </SettingsSection>
  )
}
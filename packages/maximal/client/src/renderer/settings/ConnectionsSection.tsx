import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react'

import {
  ApiKeysDialog,
  Button,
  CopyButton,
  Field,
  FieldList,
  Note,
  SettingsDisclosure,
  SettingsDisclosureList,
  Switch,
  type ApiClient,
} from 'stuffbucket-electron/renderer'

import type {
  ApiKeysListResponse,
  ConnectionAction,
  ConnectionEntry,
  ConnectionsListResponse,
  ClientInstallation,
  SettingsCapabilities,
} from './capabilities'
import { describeError } from './format'

interface ConnectionsSectionProps {
  capabilities: SettingsCapabilities
}

const STATUS_LABELS: Record<ConnectionEntry['status'], string> = {
  available: 'Available',
  'not-installed': 'Not installed',
  'coming-soon': 'Coming soon',
  connected: 'Connected',
  'owned-by-another-configurator': 'In use by another Maximal',
  'changed-externally': 'Changed externally',
  'stale-recovery-required': 'Stale connection needs recovery',
  'recovery-required': 'Recovery required',
}

function manualClients(list: ApiKeysListResponse | null): ApiClient[] {
  return (list?.entries ?? [])
    .filter((entry) => entry.kind !== 'managed')
    .map((entry) => ({
      id: entry.id,
      label: entry.label,
      key: entry.key,
      enabled: entry.enabled,
    }))
}

export function ConnectionsSection({
  capabilities,
}: ConnectionsSectionProps): ReactElement {
  const mounted = useRef(true)
  const [proxyUrl, setProxyUrl] = useState<string | null>(null)
  const [connections, setConnections] =
    useState<ConnectionsListResponse | null>(null)
  const [installations, setInstallations] =
    useState<ReadonlyMap<string, ClientInstallation>>(new Map())
  const [manualKeys, setManualKeys] = useState<ApiKeysListResponse | null>(null)
  const [keysOpen, setKeysOpen] = useState(false)
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [refreshing, setRefreshing] = useState(true)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(
    async () => {
      try {
        const [nextProxyUrl, nextConnections, nextInstallations] = await Promise.all([
          capabilities.connection.proxyUrl(),
          capabilities.connections.list(),
          capabilities.connections.installations(),
        ])
        if (!mounted.current) return
        setProxyUrl(nextProxyUrl)
        setConnections(nextConnections)
        setInstallations(
          new Map(nextInstallations.map((installation) => [installation.id, installation])),
        )
        setError(null)
      } catch (cause) {
        if (mounted.current) setError(describeError(cause))
      }
    },
    [capabilities],
  )

  useEffect(() => {
    let cancelled = false
    mounted.current = true
    queueMicrotask(() => {
      if (cancelled) return
      void refresh().finally(() => {
        if (!cancelled && mounted.current) setRefreshing(false)
      })
    })
    const unsubscribe = capabilities.subscribe(() => {
      void refresh()
    })
    return () => {
      cancelled = true
      mounted.current = false
      unsubscribe()
    }
  }, [capabilities, refresh])

  const act = useCallback(
    async (connection: ConnectionEntry, action: ConnectionAction) => {
      setBusyAction(`${connection.id}:${action}`)
      setError(null)
      try {
        const updated = await capabilities.connections.act(connection.id, action)
        if (!mounted.current) return
        setConnections((current) =>
          current === null
            ? current
            : {
                ...current,
                clients: current.clients.map((entry) =>
                  entry.id === updated.id ? updated : entry,
                ),
              },
        )
        setRevealed((current) => {
          if (updated.credential?.id === connection.credential?.id) return current
          const next = { ...current }
          if (connection.credential) delete next[connection.credential.id]
          return next
        })
      } catch (cause) {
        if (mounted.current) setError(describeError(cause))
      } finally {
        if (mounted.current) setBusyAction(null)
      }
    },
    [capabilities],
  )

  const revealCredential = useCallback(
    async (connection: ConnectionEntry) => {
      const credential = connection.credential
      if (!credential) return
      setBusyAction(`reveal:${credential.id}`)
      setError(null)
      try {
        const result = await capabilities.connections.revealCredential(
          credential.id,
        )
        if (mounted.current) {
          setRevealed((current) => ({ ...current, [result.id]: result.key }))
        }
      } catch (cause) {
        if (mounted.current) setError(describeError(cause))
      } finally {
        if (mounted.current) setBusyAction(null)
      }
    },
    [capabilities],
  )

  const openManualKeys = useCallback(async () => {
    setBusyAction('manual-keys')
    setError(null)
    try {
      const list = await capabilities.apiKeys.list()
      if (!mounted.current) return
      setManualKeys(list)
      setKeysOpen(true)
    } catch (cause) {
      if (mounted.current) setError(describeError(cause))
    } finally {
      if (mounted.current) setBusyAction(null)
    }
  }, [capabilities])

  const mutateManualKeys = useCallback(
    async (action: () => Promise<void>) => {
      setBusyAction('manual-keys')
      setError(null)
      try {
        await action()
        const [nextKeys, nextConnections] = await Promise.all([
          capabilities.apiKeys.list(),
          capabilities.connections.list(),
        ])
        if (!mounted.current) return
        setManualKeys(nextKeys)
        setConnections(nextConnections)
      } catch (cause) {
        if (mounted.current) setError(describeError(cause))
      } finally {
        if (mounted.current) setBusyAction(null)
      }
    },
    [capabilities],
  )

  const setEnforcement = useCallback(
    async (enforcing: boolean) => {
      setBusyAction('access-policy')
      setError(null)
      try {
        await capabilities.apiKeys.setEnforcement(enforcing)
        const nextConnections = await capabilities.connections.list()
        if (mounted.current) setConnections(nextConnections)
      } catch (cause) {
        if (mounted.current) setError(describeError(cause))
      } finally {
        if (mounted.current) setBusyAction(null)
      }
    },
    [capabilities],
  )

  const clients = useMemo(() => manualClients(manualKeys), [manualKeys])
  const openAiUrl = proxyUrl === null ? null : `${proxyUrl}/v1`
  const busy = refreshing || busyAction !== null

  return (
    <section className="settings-section" aria-busy={busy}>
      <div className="settings-section__actions">
        <Button
          size="sm"
          onClick={() => {
            setRefreshing(true)
            setError(null)
            void refresh().finally(() => {
              if (mounted.current) setRefreshing(false)
            })
          }}
          disabled={busy}
        >
          {refreshing ? 'Scanning…' : 'Rescan'}
        </Button>
      </div>
      <Note>
        Connect developer tools to Maximal and identify their local traffic.
      </Note>

      {error ? (
        <Note status="failed" live="assertive">
          {error}
        </Note>
      ) : null}

      <div className="settings-subsection">
        <h2 className="settings-section__subheading">Local addresses</h2>
        {proxyUrl === null || openAiUrl === null ? (
          <Note live="polite">Loading connection details…</Note>
        ) : (
          <dl className="settings-details">
            <div className="settings-details__row">
              <dt>Anthropic base</dt>
              <dd className="settings-copy-value">
                <code>{proxyUrl}</code>
                <CopyButton
                  text={proxyUrl}
                  about="the Anthropic base address"
                />
              </dd>
            </div>
            <div className="settings-details__row">
              <dt>OpenAI base</dt>
              <dd className="settings-copy-value">
                <code>{openAiUrl}</code>
                <CopyButton text={openAiUrl} about="the OpenAI base address" />
              </dd>
            </div>
            <div className="settings-details__row">
              <dt>Routes</dt>
              <dd>
                <code>/v1/messages</code>, <code>/v1/chat/completions</code>,{' '}
                <code>/v1/models</code>
              </dd>
            </div>
          </dl>
        )}
      </div>

      <div className="settings-subsection">
        <h2 className="settings-section__subheading">Configured clients</h2>
        {connections === null ? (
          <Note live="polite">Scanning for supported clients…</Note>
        ) : connections.clients.length === 0 ? (
          <Note>No supported clients were detected.</Note>
        ) : (
          <SettingsDisclosureList>
            {connections.clients.map((connection) => {
              const credential = connection.credential
              const revealedKey = credential ? revealed[credential.id] : undefined
              const installation = installations.get(connection.id)
              const configurationPath =
                connection.ownership?.target_path
                ?? installation?.configuration_path
                ?? null
              const checked = connection.status === 'connected'
              const toggleAction =
                checked
                  ? connection.allowed_actions.includes('disconnect')
                    ? 'disconnect'
                    : null
                  : connection.allowed_actions.includes('connect')
                    ? 'connect'
                    : connection.allowed_actions.includes('reconnect')
                      ? 'reconnect'
                      : null
              return (
                <SettingsDisclosure
                  key={connection.id}
                  title={connection.name}
                  description={STATUS_LABELS[connection.status]}
                  action={
                    <Switch
                      label={`${checked ? 'Disable' : 'Enable'} ${connection.name}`}
                      displayLabel={null}
                      tooltip={checked ? 'Enabled' : 'Disabled'}
                      layout="compact"
                      checked={checked}
                      disabled={busy || toggleAction === null}
                      testId={`connection-${connection.id}-toggle`}
                      onChange={() => {
                        if (toggleAction !== null) void act(connection, toggleAction)
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
                            <CopyButton
                              text={installation.client_path}
                              about={`the ${connection.name} client path`}
                            />
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
                            <CopyButton
                              text={configurationPath}
                              about={`the ${connection.name} configuration path`}
                            />
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
                    {credential ? (
                      <Field
                        label="Credential"
                        value={
                          <>
                            <span>
                              Managed · {credential.enabled ? 'Enabled' : 'Disabled'}
                            </span>
                            {revealedKey === undefined ? (
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() => void revealCredential(connection)}
                              >
                                {busyAction === `reveal:${credential.id}`
                                  ? 'Revealing…'
                                  : 'Reveal'}
                              </Button>
                            ) : (
                              <>
                                <code>{revealedKey}</code>
                                <CopyButton
                                  text={revealedKey}
                                  about={`the ${connection.name} credential`}
                                />
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    setRevealed((current) => {
                                      const next = { ...current }
                                      delete next[credential.id]
                                      return next
                                    })
                                  }
                                >
                                  Hide
                                </Button>
                              </>
                            )}
                          </>
                        }
                      />
                    ) : null}
                  </FieldList>
                  <div className="settings-list__content">
                      {connection.detail ? (
                        <span className="settings-list__detail">
                          {connection.detail}
                        </span>
                      ) : null}
                      {connection.recovery?.preserved_paths.length ? (
                        <span className="settings-list__detail">
                          Preserved {connection.recovery.preserved_paths.length}{' '}
                          externally changed field
                          {connection.recovery.preserved_paths.length === 1 ? '' : 's'}.
                        </span>
                      ) : null}
                  </div>
                </SettingsDisclosure>
              )
            })}
          </SettingsDisclosureList>
        )}
      </div>

      <div className="settings-subsection">
        <h2 className="settings-section__subheading">Manual clients</h2>
        <Note>
          Create named credentials for scripts and clients Maximal cannot configure.
        </Note>
        {connections === null ? (
          <Note live="polite">Loading credentials…</Note>
        ) : (
          <div className="settings-field">
            <span className="settings-list__meta">
              {connections.manual_credentials.length}{' '}
              {connections.manual_credentials.length === 1
                ? 'credential'
                : 'credentials'}
            </span>
            <Button onClick={() => void openManualKeys()} disabled={busy}>
              {busyAction === 'manual-keys'
                ? 'Loading credentials…'
                : 'Manage credentials…'}
            </Button>
          </div>
        )}
      </div>

      <details className="settings-subsection settings-advanced">
        <summary>Advanced</summary>
        {connections === null ? (
          <Note live="polite">Loading access policy…</Note>
        ) : (
          <div className="settings-field">
            <Switch
              label="Require known keys"
              checked={connections.require_known_keys}
              disabled={busy}
              onChange={(enforcing) => void setEnforcement(enforcing)}
              testId="api-key-enforcement"
            />
            <Note>
              When off, anonymous local requests are allowed. Requests carrying a
              known enabled key are still attributed to that client.
            </Note>
          </div>
        )}
      </details>

      <ApiKeysDialog
        open={keysOpen}
        onOpenChange={(open) => {
          setKeysOpen(open)
          if (!open) setManualKeys(null)
        }}
        clients={clients}
        onAddClient={(label) =>
          void mutateManualKeys(async () => {
            await capabilities.apiKeys.create({ label })
          })
        }
        onRemoveClient={(id) =>
          void mutateManualKeys(async () => {
            await capabilities.apiKeys.remove(id)
          })
        }
        onToggleClient={(id, enabled) =>
          void mutateManualKeys(async () => {
            await capabilities.apiKeys.update(id, { enabled })
          })
        }
      />
    </section>
  )
}

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
  ApiKeysListResponse,
  AppEntry,
  AppsListResponse,
  ConnectionAction,
  ConnectionEntry,
  ConnectionsListResponse,
  ClientInstallation,
  SettingsCapabilities,
} from './capabilities'
import { describeError } from './format'
import { useSettingsHeaderActions } from './header-actions'

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

/** Human copy for `AppEntry.health.issue` — what drifted, in terms the user
 *  can act on without opening a settings file themselves. */
const HEALTH_ISSUE_COPY: Record<
  NonNullable<AppEntry['health']['issue']>,
  string
> = {
  'out-of-sync':
    'Its configured API key no longer matches the one Maximal expects — likely from a key rotation since it was last enabled.',
  'not-applied':
    "It's set to route through Maximal, but its configuration is missing or was changed outside of Maximal.",
  'foreign-base-url':
    'Its configuration points at a different address than Maximal manages.',
  'foreign-api-key-helper':
    'A custom API key command is configured; Maximal is leaving it alone.',
  'invalid-api-key':
    'Maximal could not resolve an API key to configure it with.',
}

function configuredApps(list: AppsListResponse | null): AppEntry[] {
  return (list?.apps ?? []).filter((app) => app.kind === 'config')
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
  const { hasHeader, setActions: setHeaderActions } = useSettingsHeaderActions()
  const mounted = useRef(true)
  const [proxyUrl, setProxyUrl] = useState<string | null>(null)
  const [connections, setConnections] =
    useState<ConnectionsListResponse | null>(null)
  const [apps, setApps] = useState<AppsListResponse | null>(null)
  const [fixTarget, setFixTarget] = useState<AppEntry | null>(null)
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
        const [
          nextProxyUrl,
          nextConnections,
          nextApps,
          nextInstallations,
        ] = await Promise.all([
          capabilities.connection.proxyUrl(),
          capabilities.connections.list(),
          capabilities.apps.list(),
          capabilities.connections.installations(),
        ])
        if (!mounted.current) return
        setProxyUrl(nextProxyUrl)
        setConnections(nextConnections)
        setApps(nextApps)
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

  // Re-runs the same apply this app's toggle already performs — safe to call
  // again because it self-heals (re-syncs a rotated key, re-applies a missing
  // profile) and is a no-op when nothing has actually drifted. Never runs
  // without the user confirming in the dialog below.
  const fixApp = useCallback(
    async (app: AppEntry) => {
      setBusyAction(`fix:${app.id}`)
      setError(null)
      try {
        const updated = await capabilities.apps.setEnabled(app.id, true)
        if (!mounted.current) return
        setApps((current) =>
          current === null ? current : (
            {
              ...current,
              apps: current.apps.map((entry) =>
                entry.id === updated.id ? updated : entry,
              ),
            }
          ),
        )
      } catch (cause) {
        if (mounted.current) setError(describeError(cause))
      } finally {
        if (mounted.current) {
          setBusyAction(null)
          setFixTarget(null)
        }
      }
    },
    [capabilities],
  )

  const clients = useMemo(() => manualClients(manualKeys), [manualKeys])
  const appEntries = useMemo(() => configuredApps(apps), [apps])
  const openAiUrl = proxyUrl === null ? null : `${proxyUrl}/v1`
  const busy = refreshing || busyAction !== null

  const rescan = useCallback(() => {
    setRefreshing(true)
    setError(null)
    void refresh().finally(() => {
      if (mounted.current) setRefreshing(false)
    })
  }, [refresh])

  useEffect(() => {
    setHeaderActions(
      <Button size="sm" variant="primary" onClick={rescan} disabled={busy}>
        {refreshing ? 'Scanning…' : 'Rescan'}
      </Button>,
    )
    return () => setHeaderActions(null)
  }, [busy, refreshing, rescan, setHeaderActions])

  return (
    <section className="settings-section" aria-busy={busy}>
      {!hasHeader ? (
        <div className="settings-section__actions">
          <Button size="sm" variant="primary" onClick={rescan} disabled={busy}>
            {refreshing ? 'Scanning…' : 'Rescan'}
          </Button>
        </div>
      ) : null}
      <Note>
        Connect tools to Maximal and identify their local traffic.
      </Note>

      {error ? (
        <Note status="failed" live="assertive">
          {error}
        </Note>
      ) : null}

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
                <CopyButton
                  text={proxyUrl}
                  about="the Anthropic base address"
                />
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
                <code>/v1/messages</code>, <code>/v1/chat/completions</code>,{' '}
                <code>/v1/models</code>
                </>
              }
            />
          </FieldList>
        )}
      </SettingsSection>

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
                <SettingsItem
                  key={connection.id}
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
                </SettingsItem>
              )
            })}
          </SettingsGroup>
        )}
      </SettingsSection>

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
                description={
                  app.status === 'not-installed' ?
                    'Not installed'
                  : app.enabled ?
                    'Routing through Maximal'
                  : 'Not enabled'
                }
                actions={
                  !app.health.ok ? (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => setFixTarget(app)}
                      testId={`app-${app.id}-fix`}
                    >
                      {busyAction === `fix:${app.id}` ?
                        'Fixing…'
                      : 'Fix settings…'}
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
                connections.manual_credentials.length === 1
                  ? 'credential'
                  : 'credentials'
              }`}
              actions={
                <Button onClick={() => void openManualKeys()} disabled={busy}>
                  {busyAction === 'manual-keys'
                    ? 'Loading credentials…'
                    : 'Manage credentials…'}
                </Button>
              }
            />
          </SettingsGroup>
        )}
      </SettingsSection>

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
                  onChange={(enforcing) => void setEnforcement(enforcing)}
                  testId="api-key-enforcement"
                />
              }
            />
          </SettingsGroup>
        )}
      </SettingsSection>

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

      <Dialog
        open={fixTarget !== null}
        onOpenChange={(open) => {
          if (!open) setFixTarget(null)
        }}
        title={
          fixTarget ? `Fix ${fixTarget.name} settings?` : 'Fix app settings?'
        }
        description="Re-applies Maximal's configuration for this app."
        testId="app-fix-confirmation"
      >
        {fixTarget ? (
          <>
            <h2 className="settings-dialog__heading">
              Fix {fixTarget.name} settings?
            </h2>
            <p>
              {fixTarget.health.issue ?
                HEALTH_ISSUE_COPY[fixTarget.health.issue]
              : null}{' '}
              Maximal will re-apply its configuration for {fixTarget.name},
              overwriting only the fields it manages.
            </p>
            <div className="settings-dialog__actions">
              <Button onClick={() => setFixTarget(null)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => void fixApp(fixTarget)}
                disabled={busy}
              >
                Fix settings
              </Button>
            </div>
          </>
        ) : null}
      </Dialog>
    </section>
  )
}

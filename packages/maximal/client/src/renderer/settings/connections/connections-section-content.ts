import type { ApiClient } from 'stuffbucket-electron/renderer'

import type {
  ApiKeysListResponse,
  AppEntry,
  AppsListResponse,
  ConnectionAction,
  ConnectionEntry,
} from '../capabilities'

export const STATUS_LABELS: Record<ConnectionEntry['status'], string> = {
  available: 'Available',
  'not-installed': 'Not installed',
  'coming-soon': 'Coming soon',
  connected: 'Connected',
  'owned-by-another-configurator': 'In use by another Maximal',
  'changed-externally': 'Changed externally',
  'stale-recovery-required': 'Stale connection needs recovery',
  'recovery-required': 'Recovery required',
}

export const HEALTH_ISSUE_COPY: Record<NonNullable<AppEntry['health']['issue']>, string> = {
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

export function configuredApps(list: AppsListResponse | null): AppEntry[] {
  return (list?.apps ?? []).filter((app) => app.kind === 'config')
}

export function manualClients(list: ApiKeysListResponse | null): ApiClient[] {
  return (list?.entries ?? [])
    .filter((entry) => entry.kind !== 'managed')
    .map((entry) => ({
      id: entry.id,
      label: entry.label,
      key: entry.key,
      enabled: entry.enabled,
    }))
}

export function connectionToggleAction(
  connection: ConnectionEntry,
): ConnectionAction | null {
  if (connection.status === 'connected') {
    return connection.allowed_actions.includes('disconnect') ? 'disconnect' : null
  }
  if (connection.allowed_actions.includes('connect')) return 'connect'
  return connection.allowed_actions.includes('reconnect') ? 'reconnect' : null
}
import { useCallback, useEffect, useState, type ReactElement } from 'react'

import { Button, Note, Switch } from 'stuffbucket-electron/renderer'

import type {
  AppEntry,
  AppsListResponse,
  SettingsCapabilities,
} from './capabilities'
import { describeError } from './format'

interface AppsSectionProps {
  capabilities: SettingsCapabilities
}

function appStatus(app: AppEntry): string {
  if (app.kind === 'coming-soon') return 'Coming soon'
  if (app.conflict !== null) return `Blocked: ${app.conflict.replaceAll('-', ' ')}`
  if (app.status === 'not-installed') return 'Not installed'
  return app.enabled ? 'Connected' : 'Available'
}

export function AppsSection({ capabilities }: AppsSectionProps): ReactElement {
  const [list, setList] = useState<AppsListResponse | null>(null)
  const [busyId, setBusyId] = useState<AppEntry['id'] | 'rescan' | null>('rescan')
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setBusyId('rescan')
    setError(null)
    try {
      setList(await capabilities.apps.list())
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setBusyId(null)
    }
  }, [capabilities])

  useEffect(() => {
    let active = true
    void capabilities.apps
      .list()
      .then((next) => {
        if (active) setList(next)
      })
      .catch((cause: unknown) => {
        if (active) setError(describeError(cause))
      })
      .finally(() => {
        if (active) setBusyId(null)
      })
    return () => {
      active = false
    }
  }, [capabilities])

  const toggle = useCallback(
    async (app: AppEntry, enabled: boolean) => {
      setBusyId(app.id)
      setError(null)
      try {
        const updated = await capabilities.apps.setEnabled(app.id, enabled)
        setList((current) =>
          current === null
            ? current
            : {
                apps: current.apps.map((entry) =>
                  entry.id === updated.id ? updated : entry,
                ),
              },
        )
      } catch (cause) {
        setError(describeError(cause))
      } finally {
        setBusyId(null)
      }
    },
    [capabilities],
  )

  return (
    <section className="settings-section" aria-labelledby="settings-apps-heading">
      <div className="settings-section__title-row">
        <h1 id="settings-apps-heading" className="settings-section__heading">
          Apps
        </h1>
        <Button size="sm" onClick={() => void refresh()} disabled={busyId !== null}>
          {busyId === 'rescan' ? 'Scanning…' : 'Rescan'}
        </Button>
      </div>
      <Note>Connect detected developer tools to this Maximal endpoint.</Note>
      {error ? (
        <Note status="failed" live="assertive">
          {error}
        </Note>
      ) : null}
      {list === null ? (
        <Note live="polite">Scanning for supported apps…</Note>
      ) : list.apps.length === 0 ? (
        <Note>No supported apps were detected.</Note>
      ) : (
        <ul className="settings-list">
          {list.apps.map((app) => (
            <li key={app.id} className="settings-list__row">
              <div className="settings-list__content">
                <strong>{app.name}</strong>
                <span className="settings-list__meta">{appStatus(app)}</span>
                {app.installs[0] ? (
                  <code className="settings-list__detail">{app.installs[0].path}</code>
                ) : app.install ? (
                  <code className="settings-list__detail">{app.install.command}</code>
                ) : null}
              </div>
              {app.kind === 'config' ? (
                <Switch
                  label={app.enabled ? 'On' : 'Off'}
                  checked={app.enabled}
                  disabled={
                    busyId !== null ||
                    app.status !== 'ready' ||
                    app.conflict !== null
                  }
                  onChange={(next) => void toggle(app, next)}
                  testId={`app-${app.id}-enabled`}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

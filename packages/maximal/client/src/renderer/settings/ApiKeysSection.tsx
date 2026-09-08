import { useCallback, useEffect, useState, type ReactElement } from 'react'

import {
  ApiKeysDialog,
  Button,
  Note,
  Switch,
  type ApiClient,
} from 'stuffbucket-electron/renderer'

import type {
  ApiKeysListResponse,
  SettingsCapabilities,
} from './capabilities'
import { describeError } from './format'

interface ApiKeysSectionProps {
  capabilities: SettingsCapabilities
}

function clientsOf(list: ApiKeysListResponse | null): ApiClient[] {
  return (list?.entries ?? []).map((entry) => ({
    id: entry.id,
    label: entry.label,
    key: entry.key,
    enabled: entry.enabled,
  }))
}

export function ApiKeysSection({
  capabilities,
}: ApiKeysSectionProps): ReactElement {
  const [list, setList] = useState<ApiKeysListResponse | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void capabilities.apiKeys
      .list()
      .then((next) => {
        if (active) setList(next)
      })
      .catch((cause: unknown) => {
        if (active) setError(describeError(cause))
      })
    return () => {
      active = false
    }
  }, [capabilities])

  const mutate = useCallback(
    async (action: () => Promise<void>) => {
      setBusy(true)
      setError(null)
      try {
        await action()
        setList(await capabilities.apiKeys.list())
      } catch (cause) {
        setError(describeError(cause))
      } finally {
        setBusy(false)
      }
    },
    [capabilities],
  )

  return (
    <section className="settings-section" aria-labelledby="settings-api-keys-heading">
      <h1 id="settings-api-keys-heading" className="settings-section__heading">
        API keys
      </h1>
      <Note>Create separate credentials for applications that use this endpoint.</Note>
      {error ? (
        <Note status="failed" live="assertive">
          {error}
        </Note>
      ) : null}
      {list === null ? (
        <Note live="polite">Loading API keys…</Note>
      ) : (
        <div className="settings-field">
          <Switch
            label="Require an API key"
            checked={list.enforcing}
            disabled={busy}
            onChange={(enforcing) =>
              void mutate(async () => {
                setList(await capabilities.apiKeys.setEnforcement(enforcing))
              })
            }
            testId="api-key-enforcement"
          />
          <span className="settings-list__meta">
            {list.entries.length} {list.entries.length === 1 ? 'key' : 'keys'}
          </span>
          <Button onClick={() => setOpen(true)} disabled={busy}>
            Manage API keys…
          </Button>
        </div>
      )}

      <ApiKeysDialog
        open={open}
        onOpenChange={setOpen}
        clients={clientsOf(list)}
        onAddClient={(label) =>
          void mutate(async () => {
            await capabilities.apiKeys.create({ label })
          })
        }
        onRemoveClient={(id) =>
          void mutate(async () => {
            await capabilities.apiKeys.remove(id)
          })
        }
        onToggleClient={(id, enabled) =>
          void mutate(async () => {
            await capabilities.apiKeys.update(id, { enabled })
          })
        }
      />
    </section>
  )
}

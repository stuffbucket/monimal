import { useCallback, useEffect, useState, type ReactElement } from 'react'

import { Button, CopyButton, Note } from 'stuffbucket-electron/renderer'

import type { SettingsCapabilities } from './capabilities'
import { describeError } from './format'

interface LogsSectionProps {
  capabilities: SettingsCapabilities
}

export function LogsSection({ capabilities }: LogsSectionProps): ReactElement {
  const [location, setLocation] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revealing, setRevealing] = useState(false)

  useEffect(() => {
    let settled = false
    void capabilities.logs.location().then(
      (path) => {
        if (!settled) setLocation(path)
      },
      (cause: unknown) => {
        if (!settled) setError(describeError(cause))
      },
    )
    return () => {
      settled = true
    }
  }, [capabilities])

  const reveal = useCallback(async () => {
    setRevealing(true)
    setError(null)
    try {
      await capabilities.logs.reveal()
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setRevealing(false)
    }
  }, [capabilities])

  return (
    <section className="settings-section" aria-labelledby="settings-logs-heading">
      <h1 id="settings-logs-heading" className="settings-section__heading">
        Logs
      </h1>
      <Note>Open the folder containing maximal-core logs.</Note>
      {error ? (
        <Note status="failed" live="assertive">
          {error}
        </Note>
      ) : null}
      {location === null ? (
        <Note live="polite">Loading log location…</Note>
      ) : (
        <div className="settings-copy-value">
          <code>{location}</code>
          <CopyButton text={location} about="the log folder path" />
          <Button onClick={() => void reveal()} disabled={revealing}>
            {revealing ? 'Opening…' : 'Reveal logs'}
          </Button>
        </div>
      )}
    </section>
  )
}

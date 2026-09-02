import { useEffect, useState, type ReactElement } from 'react'

import { CopyButton, Note } from 'stuffbucket-electron/renderer'

import type { SettingsCapabilities } from './capabilities'
import { describeError } from './format'

// The Connection section: the proxy URL external programs (the Anthropic
// SDK, OpenAI SDK, opencode, custom scripts — see .design-context.md's "Who
// maximal is for") should point at. Display + copy only; there is nothing to
// configure here today.

interface ConnectionSectionProps {
  capabilities: SettingsCapabilities
}

export function ConnectionSection({ capabilities }: ConnectionSectionProps): ReactElement {
  const [proxyUrl, setProxyUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let settled = false

    // One effect owns the whole read lifetime: the first read, every later
    // push, and teardown. `proxyUrl()` tracks the sidecar's current port, but
    // that only helps a mounted component if it asks again after a restart.
    // `subscribe` fires on every control-plane change, including the
    // invalidation main emits after installing a replacement, so it doubles as
    // the restart signal even though this section holds no auth state.
    const refresh = () => {
      capabilities.connection
        .proxyUrl()
        .then((url) => {
          if (!settled) setProxyUrl(url)
        })
        .catch((cause: unknown) => {
          if (!settled) setError(describeError(cause))
        })
    }

    refresh()
    const unsubscribe = capabilities.subscribe(refresh)
    return () => {
      settled = true
      unsubscribe()
    }
  }, [capabilities])

  const endpoint = proxyUrl ? `${proxyUrl}/v1` : null

  return (
    <section className="settings-section" aria-labelledby="settings-connection-heading">
      <h2 id="settings-connection-heading" className="settings-section__heading">
        Connection
      </h2>
      <Note>Point OpenAI-compatible clients at this address.</Note>

      {error ? (
        <Note status="failed" live="assertive">
          {error}
        </Note>
      ) : endpoint === null ? (
        <Note live="polite">Loading connection details…</Note>
      ) : (
        <div className="settings-connection-row">
          <code className="settings-connection-row__value">{endpoint}</code>
          {/* CopyButton owns the whole interaction: the write, the label
              flipping to the catalogue's word for "copied", the timeout that
              flips it back, and the accessible name that says *what* was
              copied so four copy buttons in one dialog are told apart. All of
              that was hand-rolled here, minus the last part. */}
          <CopyButton text={endpoint} about="the endpoint address" testId="connection-copy" />
        </div>
      )}
    </section>
  )
}

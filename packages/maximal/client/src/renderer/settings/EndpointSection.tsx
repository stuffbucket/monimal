import { useEffect, useState, type ReactElement } from 'react'

import { CopyButton, Note } from 'stuffbucket-electron/renderer'

import type { SettingsCapabilities } from './capabilities'
import { describeError } from './format'

interface EndpointSectionProps {
  capabilities: SettingsCapabilities
}

export function EndpointSection({
  capabilities,
}: EndpointSectionProps): ReactElement {
  const [proxyUrl, setProxyUrl] = useState<string | null>(null)
  const [enforcing, setEnforcing] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let settled = false
    const refresh = (): void => {
      void Promise.all([
        capabilities.connection.proxyUrl(),
        capabilities.apiKeys.list(),
      ]).then(
        ([url, keys]) => {
          if (!settled) {
            setProxyUrl(url)
            setEnforcing(keys.enforcing)
            setError(null)
          }
        },
        (cause: unknown) => {
          if (!settled) setError(describeError(cause))
        },
      )
    }
    refresh()
    const unsubscribe = capabilities.subscribe(refresh)
    return () => {
      settled = true
      unsubscribe()
    }
  }, [capabilities])

  const openAiUrl = proxyUrl === null ? null : `${proxyUrl}/v1`
  const curl =
    proxyUrl === null
      ? null
      : `curl ${proxyUrl}/v1/models -H "Authorization: Bearer $MAXIMAL_API_KEY"`

  return (
    <section className="settings-section" aria-labelledby="settings-endpoint-heading">
      <h1 id="settings-endpoint-heading" className="settings-section__heading">
        Endpoint
      </h1>
      <Note>Point compatible developer tools at these local addresses.</Note>
      {error ? (
        <Note status="failed" live="assertive">
          {error}
        </Note>
      ) : proxyUrl === null || openAiUrl === null || curl === null ? (
        <Note live="polite">Loading endpoint details…</Note>
      ) : (
        <>
          <dl className="settings-details">
            <div className="settings-details__row">
              <dt>Anthropic base</dt>
              <dd className="settings-copy-value">
                <code>{proxyUrl}</code>
                <CopyButton text={proxyUrl} about="the Anthropic base address" />
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
              <dt>Public routes</dt>
              <dd>
                <code>/v1/messages</code>, <code>/v1/chat/completions</code>,{' '}
                <code>/v1/models</code>
              </dd>
            </div>
            <div className="settings-details__row">
              <dt>API key enforcement</dt>
              <dd>{enforcing ? 'Required' : 'Not required'}</dd>
            </div>
          </dl>
          <div className="settings-code-block">
            <code>{curl}</code>
            <CopyButton text={curl} about="the curl example" />
          </div>
        </>
      )}
    </section>
  )
}

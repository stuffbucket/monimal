import { useCallback, useEffect, useEffectEvent, useState, type ReactElement } from 'react'

import {
  Button,
  Field,
  FieldList,
  Note,
  SettingsGroup,
  SettingsItem,
  SettingsSection,
} from 'stuffbucket-electron/renderer'

import { displayAccountLogin } from '../shared/account-login'
import type { AuthStatus, SettingsCapabilities } from './capabilities'
import { AccountsSection } from './AccountsSection'
import { DeviceCodePanel } from './DeviceCodePanel'
import { describeError, formatTimestamp } from './format'
import { OllamaAccountsSection } from './OllamaAccountsSection'

// The Accounts section: who's signed in, sign in via GitHub's device flow,
// sign out. Written entirely against `SettingsCapabilities` — see
// capabilities.ts for why no component here imports `ControlClient` or
// touches `window.maximal` directly.

/** How often to re-read status while nothing is pushing changes. Covers the
 *  one transition the server doesn't proactively announce: a device code
 *  simply running out the clock (see capabilities.ts's `account.status` doc
 *  comment) — the next read is what collapses it, and this is what causes
 *  that next read to happen even if no one is pushing. */
const POLL_MS = 3000

interface AccountSectionProps {
  capabilities: SettingsCapabilities
}

export function AccountSection({ capabilities }: AccountSectionProps): ReactElement {
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const isBusy = useEffectEvent(() => busy)

  // One effect owns the whole read lifetime: the first read, every later
  // push, the poll fallback, and teardown.
  useEffect(() => {
    let settled = false

    const refresh = async () => {
      // A refresh racing an in-flight action (sign-in/out, cancel) would
      // render a status the action is about to supersede anyway; skip it
      // rather than flicker.
      if (isBusy()) return
      try {
        const next = await capabilities.account.status()
        if (!settled) {
          setStatus(next)
          // A successful read supersedes any earlier transient failure — the
          // control plane has spoken again since, which is a more current
          // signal than a stale error from a previous poll. Without this, one
          // failed poll (e.g. mid core-restart) pins an assertive alert on
          // screen forever even after every later poll succeeds.
          setError(null)
        }
      } catch (cause) {
        if (!settled) setError(describeError(cause))
      }
    }

    void refresh()
    const unsubscribe = capabilities.subscribe(() => void refresh())
    const poll = setInterval(() => void refresh(), POLL_MS)

    return () => {
      settled = true
      unsubscribe()
      clearInterval(poll)
    }
  }, [capabilities])

  const runAction = useCallback(
    async (action: () => Promise<AuthStatus | void>) => {
      setBusy(true)
      setError(null)
      try {
        const next = await action()
        if (next) setStatus(next)
      } catch (cause) {
        setError(describeError(cause))
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  const handleStart = useCallback(() => void runAction(() => capabilities.account.start()), [capabilities, runAction])
  const handleCancel = useCallback(() => void runAction(() => capabilities.account.cancel()), [capabilities, runAction])
  const handleSignOut = useCallback(
    () =>
      void runAction(async () => {
        await capabilities.account.signOut()
        return capabilities.account.status()
      }),
    [capabilities, runAction],
  )
  const handleOpenVerification = useCallback(
    (uri: string) => {
      void capabilities.openExternal(uri)
    },
    [capabilities],
  )

  return (
    <section className="settings-section">
      <SettingsSection title="GitHub Copilot">
        <SettingsGroup>
          <SettingsItem
            title="GitHub account"
            description={
              status?.state === 'authenticated'
                ? 'Connected to GitHub Copilot.'
                : 'Authorizes Maximal to use GitHub Copilot.'
            }
            actions={
              status?.state === 'unauthenticated' ? (
                <Button variant="primary" size="sm" onClick={handleStart} disabled={busy}>
                  {busy ? 'Starting…' : 'Sign in with GitHub'}
                </Button>
              ) : status?.state === 'authenticated' ? (
                <Button size="sm" onClick={handleSignOut} disabled={busy}>
                  {busy ? 'Signing out…' : 'Sign out'}
                </Button>
              ) : status?.state === 'error' ? (
                <Button variant="primary" onClick={handleStart} disabled={busy}>
                  {busy ? 'Starting…' : 'Try again'}
                </Button>
              ) : undefined
            }
          >
            {error ? (
              <Note status="failed" live="assertive">
                {error}
              </Note>
            ) : null}
            {status === null ? (
              <Note live="polite">Loading account status…</Note>
            ) : status.state === 'unauthenticated' ? (
              <>
                <Note>Not signed in.</Note>
                {status.last_upstream_rejection ? (
                  <Note status="needs-approval">{status.last_upstream_rejection.message}</Note>
                ) : null}
              </>
            ) : status.state === 'device_code_issued' || status.state === 'polling' ? (
              <DeviceCodePanel
                status={status}
                busy={busy}
                onOpenVerification={() => handleOpenVerification(status.verification_uri)}
                onCancel={handleCancel}
                onRequestNewCode={handleStart}
              />
            ) : status.state === 'authenticated' ? (
              <>
                <FieldList>
                  <Field
                    label="Signed in as"
                    value={displayAccountLogin(status.account_login)}
                  />
                  {status.account_type ? (
                    <Field label="Plan" value={status.account_type} />
                  ) : null}
                  {status.connected_since ? (
                    <Field
                      label="Connected since"
                      value={formatTimestamp(status.connected_since)}
                    />
                  ) : null}
                </FieldList>
                {status.last_upstream_rejection ? (
                  <Note status="needs-approval">{status.last_upstream_rejection.message}</Note>
                ) : null}
              </>
            ) : (
              // status.state === 'error'
              <>
                <Note status="failed" live="assertive">
                  {status.error}
                  {status.remediation_url ? (
                    <>
                      {' '}
                      <button
                        type="button"
                        className="settings-link-button"
                        onClick={() => handleOpenVerification(status.remediation_url ?? '')}
                      >
                        Learn more
                      </button>
                    </>
                  ) : null}
                </Note>
              </>
            )}
          </SettingsItem>
        </SettingsGroup>
        <AccountsSection capabilities={capabilities} />
      </SettingsSection>
      <OllamaAccountsSection capabilities={capabilities} />
    </section>
  )
}

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useState,
  type ReactElement,
} from 'react'

import {
  Banner,
  Button,
  SettingsGroup,
  SettingsItem,
  SettingsSection,
} from '@maximal/maximal-electron/renderer'
import {
  CopilotAccountUsage as CopilotAccountUsageSchema,
} from '@maximal/maximal-core-contract/settings'

import { describeError } from '../../shared/errors'
import type {
  AuthStatus,
  CopilotAccountUsage,
  SettingsCapabilities,
} from '../capabilities'
import { AccountsSection } from './AccountsSection'
import { AccountStatusBody } from './AccountStatusBody'
import { CopilotPlanDetails } from './CopilotPlanDetails'
import { OllamaAccountsSection } from './OllamaAccountsSection'
import {
  readSettingsCache,
  writeSettingsCache,
} from '../settings-cache'

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
const COPILOT_USAGE_CACHE_PREFIX = 'copilot-usage.'

function usageCacheKey(accountKey: string): string {
  return `${COPILOT_USAGE_CACHE_PREFIX}${encodeURIComponent(accountKey)}`
}

interface AccountSectionProps {
  capabilities: SettingsCapabilities
}

function networkBannerMessage(status: AuthStatus | null): string | null {
  if (
    status?.state !== 'authenticated'
    && status?.state !== 'unauthenticated'
  ) {
    return null
  }
  switch (status.network_diagnosis?.kind) {
    case 'offline':
      return 'No internet connection. Connect to a network to use GitHub accounts.'
    case 'dns-failure':
      return 'GitHub cannot be reached because the network lookup failed. Check your internet connection.'
    case 'scope-unreachable':
      return 'GitHub authentication is unreachable. Check your network or organization access.'
    case 'unknown':
      return 'GitHub cannot be reached right now. Check your internet connection.'
    case undefined:
      return null
  }
}

export function AccountSection({
  capabilities,
}: AccountSectionProps): ReactElement {
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [usage, setUsage] = useState<{
    identity: string
    value: CopilotAccountUsage
  } | null>(null)
  const [usageError, setUsageError] = useState<{
    identity: string
    message: string
  } | null>(null)
  const [activeAccountKey, setActiveAccountKey] = useState<string | null>(null)
  const [usageCacheError, setUsageCacheError] = useState<string | null>(null)
  const [usageLoading, setUsageLoading] = useState(false)
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
          let nextAccountKey: string | null = null
          if (next.state === 'authenticated') {
            try {
              const accounts = await capabilities.accounts.list()
              const accountKey = accounts.active_key
              nextAccountKey = accountKey
              if (accountKey !== null) {
                const cached = readSettingsCache(
                  usageCacheKey(accountKey),
                  CopilotAccountUsageSchema,
                )
                if (cached !== null) {
                  setUsage((current) =>
                    current?.identity === accountKey
                      ? current
                      : { identity: accountKey, value: cached })
                }
              }
              setUsageCacheError(null)
            } catch (cause) {
              setUsageCacheError(describeError(cause))
            }
          }
          if (settled) return
          setActiveAccountKey(nextAccountKey)
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

  const activateDeviceCode = useCallback(
    async (code: string, uri: string) => {
      const failures: string[] = []
      try {
        await capabilities.copyText(code)
      } catch (cause) {
        failures.push(`the code could not be copied: ${describeError(cause)}`)
      }
      try {
        await capabilities.openExternal(uri)
      } catch (cause) {
        failures.push(`the browser could not be opened: ${describeError(cause)}`)
      }
      if (failures.length > 0) {
        setError(`GitHub sign-in started, but ${failures.join('; ')}`)
      }
    },
    [capabilities],
  )
  const handleStart = useCallback(
    () =>
      void runAction(async () => {
        const next = await capabilities.account.start()
        if (
          next.state === 'device_code_issued'
          || next.state === 'polling'
        ) {
          await activateDeviceCode(next.user_code, next.verification_uri)
        }
        return next
      }),
    [activateDeviceCode, capabilities, runAction],
  )
  const handleCancel = useCallback(
    () => void runAction(() => capabilities.account.cancel()),
    [capabilities, runAction],
  )
  const handleSignOut = useCallback(
    () =>
      void runAction(async () => {
        await capabilities.account.signOut()
        return capabilities.account.status()
      }),
    [capabilities, runAction],
  )
  const handleOpenExternal = useCallback(
    (uri: string) => {
      void capabilities.openExternal(uri)
    },
    [capabilities],
  )
  const authenticatedLogin =
    status?.state === 'authenticated' ? status.account_login : null
  const usageIdentity = activeAccountKey ?? authenticatedLogin
  const networkMessage = networkBannerMessage(status)
  const refreshUsage = useCallback(async () => {
    if (usageIdentity === null) return
    setUsageLoading(true)
    setUsageError(null)
    try {
      const value = await capabilities.account.usage()
      if (activeAccountKey !== null) {
        try {
          writeSettingsCache(usageCacheKey(activeAccountKey), value)
          setUsageCacheError(null)
        } catch (cause) {
          setUsageCacheError(describeError(cause))
        }
      }
      setUsage({ identity: usageIdentity, value })
    } catch (cause) {
      setUsageError({
        identity: usageIdentity,
        message: describeError(cause),
      })
    } finally {
      setUsageLoading(false)
    }
  }, [activeAccountKey, capabilities, usageIdentity])

  useEffect(() => {
    if (usageIdentity === null) return
    let settled = false
    const identity = usageIdentity
    void capabilities.account.usage().then(
      (value) => {
        if (!settled) {
          if (activeAccountKey !== null) {
            try {
              writeSettingsCache(usageCacheKey(activeAccountKey), value)
              setUsageCacheError(null)
            } catch (cause) {
              setUsageCacheError(describeError(cause))
            }
          }
          setUsage({ identity, value })
          setUsageError(null)
        }
      },
      (cause: unknown) => {
        if (!settled) {
          setUsageError({ identity, message: describeError(cause) })
        }
      },
    )
    return () => {
      settled = true
    }
  }, [activeAccountKey, capabilities, usageIdentity])

  return (
    <section className="settings-section">
      <SettingsSection title="GitHub Copilot">
        {networkMessage ? (
          <Banner status="failed">{networkMessage}</Banner>
        ) : null}
        <SettingsGroup layout="grid">
          <SettingsItem
            title={
              status?.state === 'authenticated'
                ? 'Active Account'
                : 'GitHub account'
            }
            description={
              status?.state === 'authenticated'
                ? 'Connected to GitHub Copilot.'
                : 'Authorizes Maximal to use GitHub Copilot.'
            }
            actions={
              status?.state === 'unauthenticated' ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleStart}
                  disabled={busy}
                >
                  {busy ? 'Starting…' : 'Sign in with GitHub'}
                </Button>
              ) : status?.state === 'authenticated' ? (
                <Button size="sm" onClick={handleSignOut} disabled={busy}>
                  {busy ? 'Signing out…' : 'Sign out'}
                </Button>
              ) : status?.state === 'error' ? (
                <Button variant="primary" onClick={handleStart} disabled={busy}>
                  {busy ? 'Starting…' : 'Sign in again'}
                </Button>
              ) : undefined
            }
          >
            <AccountStatusBody
              status={status}
              error={error}
              busy={busy}
              onActivateDeviceCode={(code, uri) =>
                void activateDeviceCode(code, uri)
              }
              onOpenExternal={handleOpenExternal}
              onCancel={handleCancel}
              onRequestNewCode={handleStart}
            />
          </SettingsItem>
          {status?.state === 'authenticated' ? (
            <CopilotPlanDetails
              usage={
                usage?.identity === usageIdentity ? usage.value : null
              }
              loading={
                usageLoading
                || (usage?.identity !== usageIdentity
                  && usageError?.identity !== usageIdentity)
              }
              error={
                usageError?.identity === usageIdentity
                  ? usageError.message
                  : usageCacheError
              }
              onRefresh={() => void refreshUsage()}
              onOpenInsights={() =>
                void capabilities.openExternal(
                  'https://github.com/settings/copilot',
                )
              }
            />
          ) : null}
        </SettingsGroup>
        <AccountsSection
          capabilities={capabilities}
          addingAccount={busy}
          onAddAccount={handleStart}
          authenticatedAccount={
            status?.state === 'authenticated'
              ? {
                  login: status.account_login,
                  ...(status.account_avatar_url
                    ? { avatarUrl: status.account_avatar_url }
                    : {}),
                }
              : undefined
          }
        />
      </SettingsSection>
      <OllamaAccountsSection capabilities={capabilities} />
    </section>
  )
}
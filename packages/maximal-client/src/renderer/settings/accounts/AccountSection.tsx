import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  useCallback,
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

import { describeError } from '../../shared/errors'
import {
  accountStatusQueryKey,
  useAccountStatus,
} from '../../useAccountStatus'
import type {
  AuthStatus,
  SettingsCapabilities,
} from '../capabilities'
import { AccountsSection } from './AccountsSection'
import { AccountStatusBody } from './AccountStatusBody'
import { CopilotPlanDetails } from './CopilotPlanDetails'
import { OllamaAccountsSection } from './OllamaAccountsSection'
import { accountsQueryKey } from './useAccounts'

// The Accounts section: who's signed in, sign in via GitHub's device flow,
// sign out. Written entirely against `SettingsCapabilities` — see
// capabilities.ts for why no component here imports `ControlClient` or
// touches `window.maximal` directly.

const COPILOT_USAGE_STALE_MS = 5 * 60_000
const COPILOT_USAGE_RETAIN_MS = 24 * 60 * 60_000

export function copilotUsageQueryKey(accountKey: string) {
  return ['account', 'copilot-usage', accountKey] as const
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
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const status = useAccountStatus(capabilities, !busy)
  const accountsQuery = useQuery({
    queryKey: accountsQueryKey,
    queryFn: () => capabilities.accounts.list(),
    enabled: status?.state === 'authenticated',
  })
  const [actionError, setActionError] = useState<string | null>(null)
  const activeAccountKey = accountsQuery.data?.active_key ?? null
  const error = actionError
    ?? (accountsQuery.error === null
      ? null
      : describeError(accountsQuery.error))

  const runAction = useCallback(
    async (action: () => Promise<AuthStatus | void>) => {
      setBusy(true)
      setActionError(null)
      try {
        const next = await action()
        if (next) queryClient.setQueryData(accountStatusQueryKey, next)
      } catch (cause) {
        setActionError(describeError(cause))
      } finally {
        setBusy(false)
      }
    },
    [queryClient],
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
        setActionError(`GitHub sign-in started, but ${failures.join('; ')}`)
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
  const usageQuery = useQuery({
    queryKey: copilotUsageQueryKey(activeAccountKey ?? 'inactive'),
    queryFn: () => capabilities.account.usage(),
    enabled: authenticatedLogin !== null && activeAccountKey !== null,
    staleTime: COPILOT_USAGE_STALE_MS,
    gcTime: COPILOT_USAGE_RETAIN_MS,
    retry: false,
  })
  const networkMessage = networkBannerMessage(status)

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
              usage={usageQuery.data ?? null}
              loading={usageQuery.isFetching}
              error={
                usageQuery.error === null
                  ? null
                  : describeError(usageQuery.error)
              }
              onRefresh={() => void usageQuery.refetch()}
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
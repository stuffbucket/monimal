import { useCallback, useEffect, useState, type ReactElement } from 'react'

import {
  Banner,
  Button,
  SettingsGroup,
  SettingsSection,
  StatusChip,
} from 'stuffbucket-electron/renderer'

import type { AccountsListResponse, SettingsCapabilities } from './capabilities'
import { addedViaLabel, describeError, formatTimestamp } from './format'
import { AccountAvatar } from './service-icons'

// The Accounts section: every account maximal-core knows about, and which
// one is active. Switching is the only mutation this section offers —
// removing an account is explicitly deferred (see capabilities.ts).

interface AccountsSectionProps {
  capabilities: SettingsCapabilities
}

interface AccountCardProps {
  account: AccountsListResponse['accounts'][number]
  isActive: boolean
  isSwitching: boolean
  canReorder: boolean
  index: number
  totalAccounts: number
  reordering: boolean
  onSwitch: (key: string) => void
  onReorder: (index: number, direction: -1 | 1) => void
}

function AccountCard({
  account,
  isActive,
  isSwitching,
  canReorder,
  index,
  totalAccounts,
  reordering,
  onSwitch,
  onReorder,
}: AccountCardProps): ReactElement {
  return (
    <div
      className="settings__item account-person-card"
      data-active={isActive ? 'true' : undefined}
      data-testid={`account-card-${account.login}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--shell-space-3, 12px)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--shell-space-3, 12px)',
          minWidth: 0,
          flex: 1,
        }}
      >
        <AccountAvatar account={account} active={isActive} size={44} />
        <div
          className="settings__item-copy"
          style={{
            display: 'grid',
            gap: 'var(--shell-space-1, 4px)',
            minWidth: 0,
          }}
        >
          <span className="settings__item-title">{account.login}</span>
          <p className="settings__item-description">
            {account.host} · {addedViaLabel(account.added_via)} · added {formatTimestamp(account.obtained_at)}
          </p>
        </div>
      </div>
      <div
        className="settings__item-actions"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--shell-space-2, 8px)',
          flexShrink: 0,
        }}
      >
        {isActive ? (
          <StatusChip status="active" label="Active" />
        ) : (
          <Button
            size="sm"
            onClick={() => void onSwitch(account.key)}
            disabled={isSwitching}
          >
            {isSwitching ? 'Switching…' : 'Switch to account'}
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => void onReorder(index, -1)}
          disabled={reordering || !canReorder || index === 0}
          aria-label={`Move ${account.login} up`}
        >
          ↑
        </Button>
        <Button
          size="sm"
          onClick={() => void onReorder(index, 1)}
          disabled={reordering || !canReorder || index === totalAccounts - 1}
          aria-label={`Move ${account.login} down`}
        >
          ↓
        </Button>
      </div>
    </div>
  )
}

export function AccountsSection({
  capabilities,
}: AccountsSectionProps): ReactElement {
  const [list, setList] = useState<AccountsListResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [switchingKey, setSwitchingKey] = useState<string | null>(null)
  const [reordering, setReordering] = useState(false)
  const [dismissedError, setDismissedError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let settled = false

    const refresh = async () => {
      try {
        const next = await capabilities.accounts.list()
        if (!settled) {
          setList(next)
          setError(null)
        }
      } catch (cause) {
        if (!settled) setError(describeError(cause))
      }
    }

    void refresh()
    const unsubscribe = capabilities.subscribe(() => void refresh())

    return () => {
      settled = true
      unsubscribe()
    }
  }, [capabilities, reloadKey])

  const handleSwitch = useCallback(
    async (key: string) => {
      setSwitchingKey(key)
      setError(null)
      try {
        await capabilities.accounts.switchTo(key)
        setList(await capabilities.accounts.list())
      } catch (cause) {
        setError(describeError(cause))
      } finally {
        setSwitchingKey(null)
      }
    },
    [capabilities],
  )

  const handleReorder = useCallback(async (index: number, direction: -1 | 1) => {
    if (!list) return
    const next = [...list.accounts]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setReordering(true)
    try {
      await capabilities.accounts.reorder(next.map((account) => account.key))
      setList({ ...list, accounts: next })
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setReordering(false)
    }
  }, [capabilities, list])

  const bannerVisible = error !== null && dismissedError !== error
  const canReorder = (list?.accounts?.length ?? 0) >= 2

  return (
    <SettingsSection title="Saved accounts" as="h3">
      {bannerVisible ? (
        <Banner
          status="failed"
          action={<Button size="sm" onClick={() => setReloadKey((k) => k + 1)}>Try again</Button>}
          onDismiss={() => setDismissedError(error)}
        >
          {error}
        </Banner>
      ) : null}

      {list === null ? (
        <p>Loading accounts…</p>
      ) : list.accounts.length === 0 ? (
        <p>No accounts yet.</p>
      ) : (
        <SettingsGroup layout="grid">
          {list.accounts.map((account, index) => {
            const isActive = account.key === list.active_key
            const isSwitching = switchingKey === account.key
            return (
              <AccountCard
                key={account.key}
                account={account}
                isActive={isActive}
                isSwitching={isSwitching}
                canReorder={canReorder}
                index={index}
                totalAccounts={list.accounts.length}
                reordering={reordering}
                onSwitch={(k) => void handleSwitch(k)}
                onReorder={(idx, dir) => void handleReorder(idx, dir)}
              />
            )
          })}
        </SettingsGroup>
      )}
    </SettingsSection>
  )
}

import { useCallback, useEffect, useState, type ReactElement } from 'react'

import {
  Banner,
  Button,
  SettingsGroup,
  SettingsSection,
  StatusChip,
  Switch,
} from 'stuffbucket-electron/renderer'

import type { AccountsListResponse, SettingsCapabilities } from './capabilities'
import { addedViaLabel, describeError, formatTimestamp } from './format'
import { AccountAvatar } from './service-icons'

// The Accounts section: every account maximal-core knows about, which one is
// active, and whether services may use each saved credential. Removing an
// account is explicitly deferred (see capabilities.ts).

interface AccountsSectionProps {
  capabilities: SettingsCapabilities
}

interface AccountCardProps {
  account: AccountsListResponse['accounts'][number]
  isActive: boolean
  isSwitching: boolean
  isToggling: boolean
  canReorder: boolean
  index: number
  totalAccounts: number
  busy: boolean
  onSwitch: (key: string) => void
  onEnabledChange: (key: string, enabled: boolean) => void
  onReorder: (index: number, direction: -1 | 1) => void
}

function AccountCard({
  account,
  isActive,
  isSwitching,
  isToggling,
  canReorder,
  index,
  totalAccounts,
  busy,
  onSwitch,
  onEnabledChange,
  onReorder,
}: AccountCardProps): ReactElement {
  return (
    <div
      className="settings__item account-person-card"
      data-active={isActive ? 'true' : undefined}
      data-enabled={account.enabled ? 'true' : 'false'}
      data-testid={`account-card-${account.login}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--shell-space-3, 12px)',
        flexWrap: 'wrap',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--shell-space-3, 12px)',
          minWidth: 0,
          flex: '1 1 12rem',
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
          flexWrap: 'wrap',
          marginInlineStart: 'auto',
        }}
      >
        {isActive ? (
          <StatusChip status="active" label="Active" />
        ) : account.enabled ? (
          <Button
            size="sm"
            onClick={() => void onSwitch(account.key)}
            disabled={busy}
          >
            {isSwitching ? 'Switching…' : 'Switch to account'}
          </Button>
        ) : null}
        <Switch
          label={`Allow ${account.login}`}
          displayLabel={isToggling ? 'Updating…' : account.enabled ? 'Enabled' : 'Disabled'}
          checked={account.enabled}
          disabled={busy}
          onChange={(enabled) => void onEnabledChange(account.key, enabled)}
          testId={`account-enabled-${account.key}`}
        />
        <Button
          size="sm"
          onClick={() => void onReorder(index, -1)}
          disabled={busy || !canReorder || index === 0}
          aria-label={`Move ${account.login} up`}
        >
          ↑
        </Button>
        <Button
          size="sm"
          onClick={() => void onReorder(index, 1)}
          disabled={busy || !canReorder || index === totalAccounts - 1}
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
  const [togglingKey, setTogglingKey] = useState<string | null>(null)
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

  const handleEnabledChange = useCallback(
    async (key: string, enabled: boolean) => {
      setTogglingKey(key)
      setError(null)
      try {
        await capabilities.accounts.setEnabled(key, enabled)
        setList(await capabilities.accounts.list())
      } catch (cause) {
        setError(describeError(cause))
      } finally {
        setTogglingKey(null)
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
  const busy = switchingKey !== null || togglingKey !== null || reordering

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
                isToggling={togglingKey === account.key}
                canReorder={canReorder}
                index={index}
                totalAccounts={list.accounts.length}
                busy={busy}
                onSwitch={(key) => void handleSwitch(key)}
                onEnabledChange={(key, enabled) =>
                  void handleEnabledChange(key, enabled)
                }
                onReorder={(idx, dir) => void handleReorder(idx, dir)}
              />
            )
          })}
        </SettingsGroup>
      )}
    </SettingsSection>
  )
}

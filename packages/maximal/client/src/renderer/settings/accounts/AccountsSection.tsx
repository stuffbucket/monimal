import { useState, type ReactElement } from 'react'

import {
  Banner,
  Button,
  SettingsGroup,
  SettingsSection,
  StatusChip,
  Switch,
} from 'stuffbucket-electron/renderer'

import { formatTimestamp } from '../../shared/format'
import type { AccountsListResponse, SettingsCapabilities } from '../capabilities'
import { AccountAvatar } from '../service-icons'
import { addedViaLabel } from './format'
import { useAccounts } from './useAccounts'

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
  const [dismissedError, setDismissedError] = useState<string | null>(null)
  const {
    list,
    error,
    switchingKey,
    togglingKey,
    busy,
    reload,
    switchAccount,
    setAccountEnabled,
    reorderAccounts,
  } = useAccounts(capabilities)

  const bannerVisible = error !== null && dismissedError !== error
  const canReorder = (list?.accounts?.length ?? 0) >= 2

  return (
    <SettingsSection title="Saved accounts" as="h3">
      {bannerVisible ? (
        <Banner
          status="failed"
          action={<Button size="sm" onClick={reload}>Try again</Button>}
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
                onSwitch={(key) => void switchAccount(key)}
                onEnabledChange={(key, enabled) =>
                  void setAccountEnabled(key, enabled)
                }
                onReorder={(idx, dir) => void reorderAccounts(idx, dir)}
              />
            )
          })}
        </SettingsGroup>
      )}
    </SettingsSection>
  )
}
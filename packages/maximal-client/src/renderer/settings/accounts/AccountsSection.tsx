import { useState, type ReactElement } from 'react'

import {
  Banner,
  Button,
  PartitionedSortableList,
  SettingsGroup,
  SettingsItem,
  SettingsSection,
  StatusChip,
  type PartitionedSortableItem,
} from '@maximal/maximal-electron/renderer'

import { formatTimestamp } from '../../shared/format'
import type { SettingsCapabilities } from '../capabilities'
import { AccountAvatar } from '../service-icons'
import { addedViaLabel } from './format'
import { useAccounts } from './useAccounts'

// The Accounts section: every account maximal-core knows about, which one is
// active, and whether services may use each saved credential. Removing an
// account is explicitly deferred (see capabilities.ts).

interface AccountsSectionProps {
  capabilities: SettingsCapabilities
  addingAccount: boolean
  onAddAccount: () => void
  authenticatedAccount?: {
    login: string
    avatarUrl?: string
  }
}

export function AccountsSection({
  capabilities,
  addingAccount,
  onAddAccount,
  authenticatedAccount,
}: AccountsSectionProps): ReactElement {
  const [dismissedError, setDismissedError] = useState<string | null>(null)
  const {
    list,
    error,
    switchingKey,
    busy,
    reload,
    switchAccount,
    updateAccountLayout,
  } = useAccounts(capabilities)

  const bannerVisible = error !== null && dismissedError !== error
  const items = (list?.accounts ?? []).map((account): PartitionedSortableItem => {
    const isActive = account.key === list?.active_key
    const needsReauth = account.needs_reauth
    const hasAuthenticatedAvatar =
      authenticatedAccount !== undefined
      && authenticatedAccount.login !== 'unknown'
      && authenticatedAccount.login.toLowerCase() === account.login.toLowerCase()
    return {
      id: account.key,
      label: account.login,
      description: `${account.host} · ${addedViaLabel(account.added_via)}`,
      testId: `account-card-${account.login}`,
      meta:
        needsReauth ? <StatusChip status="failed" label="Needs sign-in" />
        : isActive ? <StatusChip status="active" label="Active" />
        : !account.enabled ? <StatusChip status="inactive" label="Disabled" />
        : undefined,
      leading: (
        <AccountAvatar
          account={
            hasAuthenticatedAvatar && authenticatedAccount.avatarUrl
              ? { ...account, avatarUrl: authenticatedAccount.avatarUrl }
              : account
          }
          active={isActive && account.enabled && !needsReauth}
          size={36}
        />
      ),
    }
  })
  const enabledItems = items.filter((item) =>
    list?.accounts.find((account) => account.key === item.id)?.enabled,
  )
  const disabledItems = items.filter(
    (item) => !enabledItems.some((enabled) => enabled.id === item.id),
  )

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
        <SettingsGroup>
          <SettingsItem
            title="Add GitHub account"
            description="Sign in with GitHub's device flow and save another account."
            actions={
              <Button
                variant="primary"
                size="sm"
                onClick={onAddAccount}
                disabled={addingAccount}
              >
                {addingAccount ? 'Adding…' : 'Add account'}
              </Button>
            }
          />
        </SettingsGroup>
      ) : (
        <SettingsGroup dividers={false}>
          <PartitionedSortableList
            ariaLabel="Saved GitHub accounts"
            enabledItems={enabledItems}
            disabledItems={disabledItems}
            disabled={busy || addingAccount}
            onChange={(nextEnabled, nextDisabled) =>
              void updateAccountLayout(
                nextEnabled.map((item) => item.id),
                nextDisabled.map((item) => item.id),
              )
            }
            renderDetails={(item) => {
              const account = list.accounts.find(({ key }) => key === item.id)
              if (!account) return null
              const isActive = account.key === list.active_key
              return (
                <div className="settings__item-actions">
                  <span className="settings__item-description">
                    Added {formatTimestamp(account.obtained_at)}
                  </span>
                  {account.needs_reauth ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={onAddAccount}
                      disabled={busy || addingAccount}
                    >
                      {addingAccount ? 'Starting…' : 'Sign in again'}
                    </Button>
                  ) : isActive ? (
                    <StatusChip status="active" label="Active" />
                  ) : account.enabled ? (
                    <Button
                      size="sm"
                      onClick={() => void switchAccount(account.key)}
                      disabled={busy}
                    >
                      {switchingKey === account.key
                        ? 'Switching…'
                        : 'Switch to account'}
                    </Button>
                  ) : null}
                </div>
              )
            }}
          />
          <SettingsItem
            title="Add GitHub account"
            description="Sign in with GitHub's device flow and save another account."
            actions={
              <Button
                variant="primary"
                size="sm"
                onClick={onAddAccount}
                disabled={busy || addingAccount}
              >
                {addingAccount ? 'Adding…' : 'Add account'}
              </Button>
            }
          />
        </SettingsGroup>
      )}
    </SettingsSection>
  )
}
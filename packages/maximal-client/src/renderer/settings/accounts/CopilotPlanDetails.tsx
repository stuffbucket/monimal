import { type ReactElement } from 'react'

import {
  Button,
  Note,
  SettingsItem,
} from '@maximal/maximal-electron/renderer'

import type { CopilotAccountUsage } from '../capabilities'

function planLabel(plan: string | undefined): string {
  if (!plan) return 'Copilot plan'
  return plan
    .split(/[-_]/u)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ')
}

function percentUsed(usage: CopilotAccountUsage): number | null {
  const quota =
    usage.quota_snapshots?.premium_interactions
    ?? usage.quota_snapshots?.chat
  if (!quota || quota.unlimited) return null
  if (quota.percent_remaining !== undefined) {
    return Math.min(100, Math.max(0, 100 - quota.percent_remaining))
  }
  if (
    quota.entitlement !== undefined
    && quota.entitlement > 0
    && quota.remaining !== undefined
  ) {
    return Math.min(
      100,
      Math.max(0, ((quota.entitlement - quota.remaining) / quota.entitlement) * 100),
    )
  }
  return null
}

function resetLabel(value: string | undefined): string {
  if (!value) return 'Reset date not reported'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return `Resets ${value}`
  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return `Resets ${date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    })}`
  }
  return `Resets ${date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })}`
}

function completionStatus(usage: CopilotAccountUsage): string {
  const quota = usage.quota_snapshots?.completions
  if (!quota) return 'Not reported'
  if (quota.unlimited) return 'Enabled'
  if (quota.remaining !== undefined) {
    return quota.remaining > 0 ? 'Enabled' : 'Quota used'
  }
  return 'Available'
}

function DetailRow({
  label,
  value,
}: {
  label: string
  value: string
}): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 'var(--shell-space-3)',
        paddingBlock: 'var(--shell-space-2)',
        borderTop: '1px solid var(--maximal-color-border-default)',
      }}
    >
      <span>{label}</span>
      <span style={{ color: 'var(--maximal-color-text-secondary)', textAlign: 'right' }}>
        {value}
      </span>
    </div>
  )
}

export function CopilotPlanDetails({
  usage,
  loading,
  error,
  onRefresh,
  onOpenInsights,
}: {
  usage: CopilotAccountUsage | null
  loading: boolean
  error: string | null
  onRefresh: () => void
  onOpenInsights: () => void
}): ReactElement {
  const used = usage ? percentUsed(usage) : null
  const primaryQuota =
    usage?.quota_snapshots?.premium_interactions
    ?? usage?.quota_snapshots?.chat
  const credits =
    primaryQuota?.unlimited ? 'Unlimited'
    : used === null ? 'Not reported'
    : `${Math.round(used)}% used`

  return (
    <SettingsItem
      title={planLabel(usage?.copilot_plan)}
      description="GitHub Copilot entitlement and quota."
      actions={
        <Button size="sm" onClick={onRefresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      }
    >
      {error ? <Note status="failed">{error}</Note> : null}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 'var(--shell-space-3)',
            alignItems: 'baseline',
            paddingBlockEnd: 'var(--shell-space-2)',
          }}
        >
          <strong>Credits</strong>
          <span style={{ color: 'var(--maximal-color-text-secondary)' }}>
            {usage ? resetLabel(usage.quota_reset_date) : 'Loading usage…'}
          </span>
        </div>
        <strong style={{ fontSize: 'var(--shell-text-xl)' }}>{credits}</strong>
        <progress
          aria-label="Copilot credits used"
          max={100}
          value={used ?? 0}
          style={{
            accentColor: 'var(--maximal-color-bg-brand)',
            display: 'block',
            marginBlock: 'var(--shell-space-2)',
            visibility: used === null ? 'hidden' : 'visible',
            width: '100%',
          }}
        />
        <DetailRow
          label="Inline Suggestions"
          value={usage ? completionStatus(usage) : 'Loading…'}
        />
        <DetailRow label="Codebase Semantic Index" value="Not available" />
        <DetailRow label="Session Sync" value="Not available" />
        <Button size="sm" onClick={onOpenInsights}>
          Show insights
        </Button>
      </div>
    </SettingsItem>
  )
}

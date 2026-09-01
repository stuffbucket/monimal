import { deriveExpiry } from '../shared/expiry'

/** Renders an ISO timestamp as a locale-formatted date + time, or an em dash
 *  when the value is absent (some fields, e.g. `connected_since`, are
 *  optional — the account may predate that field being recorded). */
export function formatTimestamp(iso: string | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** Whole minutes remaining until `expiresAtIso`, floored, never negative. An
 *  unparseable or absent value reads as already expired. `now` is injectable
 *  so a caller can recompute on a timer deterministically. */
export function minutesRemaining(expiresAtIso: string, now: number = Date.now()): number {
  return Math.floor(deriveExpiry(expiresAtIso, now).remainingMs / 60_000)
}

/** True once `expiresAtIso` has passed, or is absent/unparseable. Lets the
 *  device-code panel show "expired" without waiting for the next round trip
 *  to collapse the state. */
export function hasExpired(expiresAtIso: string, now: number = Date.now()): boolean {
  return deriveExpiry(expiresAtIso, now).expired
}

const ADDED_VIA_LABEL = {
  'device-code': 'Signed in here',
  'gh-cli': 'GitHub CLI',
  migration: 'Migrated account',
} as const

export function addedViaLabel(addedVia: keyof typeof ADDED_VIA_LABEL): string {
  return ADDED_VIA_LABEL[addedVia]
}

/** Renders an unknown thrown value as user-facing text without ever showing
 *  "[object Object]" — the common failure mode of `String(caughtValue)`. */
export function describeError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

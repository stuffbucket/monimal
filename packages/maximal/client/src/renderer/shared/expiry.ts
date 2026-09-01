// Shared "time until an ISO expiry" derivation, used by the first-run and
// settings countdowns. The one place that arithmetic happens, so the two
// surfaces cannot pick different guards for the same bad input.

export interface ExpiryInfo {
  /** Milliseconds remaining, clamped to >= 0. Meaningless when `expired` is
   *  true from an unparseable/absent input — callers that need a countdown
   *  should always check `expired` first. */
  remainingMs: number
  /** True once `expiresAtIso` has passed, *or* when it is absent or fails to
   *  parse. Treating "we don't know" as "expired" steers the UI toward
   *  "request a new code" rather than a countdown that never ends. */
  expired: boolean
}

/**
 * Derives remaining time and expiry from an ISO timestamp. `now` is
 * injectable so callers can recompute deterministically on a timer without
 * this function reaching for the clock itself.
 */
export function deriveExpiry(expiresAtIso: string | undefined, now: number = Date.now()): ExpiryInfo {
  const expiresAtMs = expiresAtIso ? Date.parse(expiresAtIso) : NaN
  if (!Number.isFinite(expiresAtMs)) {
    return { remainingMs: 0, expired: true }
  }
  const remainingMs = expiresAtMs - now
  return { remainingMs: Math.max(0, remainingMs), expired: remainingMs <= 0 }
}

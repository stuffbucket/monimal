import { useEffect, useState, type ReactElement } from 'react'

import { Button, Note } from '@maximal/maximal-electron/renderer'

import { spellOutCode } from '../../shared/device-code'
import { hasExpired, minutesRemaining } from '../../shared/expiry'

// The device-code panel: the code, the verification link, and the two ways
// out (finish on GitHub, or cancel). Presentational + a small local timer for
// the expiry text — no data fetching. See AccountSection.tsx for the
// subscribe/poll loop that keeps `status` current, including the collapse
// back to unauthenticated/authenticated that the server performs once the
// code actually expires (capabilities.ts's `account.status` doc comment).

export interface DeviceCodeStatus {
  user_code: string
  verification_uri: string
  expires_at: string
}

interface DeviceCodePanelProps {
  status: DeviceCodeStatus
  onOpenVerification: () => void
  onCancel: () => void
  onRequestNewCode: () => void
  busy: boolean
}

/** Recomputed every 15s rather than every second — this is a coarse "how much
 *  time do I have left" cue, not a precision countdown, and a coarser tick
 *  respects `prefers-reduced-motion` users by not re-rendering constantly. */
const TICK_MS = 15_000
const COPY_CONFIRMATION_MS = 1500

export function DeviceCodePanel({
  status,
  onOpenVerification,
  onCancel,
  onRequestNewCode,
  busy,
}: DeviceCodePanelProps): ReactElement {
  const [now, setNow] = useState(() => Date.now())
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (copyState !== 'copied') return
    const timer = window.setTimeout(() => setCopyState('idle'), COPY_CONFIRMATION_MS)
    return () => window.clearTimeout(timer)
  }, [copyState])

  const expired = hasExpired(status.expires_at, now)
  const minutesLeft = minutesRemaining(status.expires_at, now)
  const copyCode = async (): Promise<void> => {
    const clipboard = navigator.clipboard
    if (clipboard === undefined) {
      setCopyState('failed')
      return
    }
    try {
      await clipboard.writeText(status.user_code)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  return (
    <div className="settings-device-code">
      {/* Was `.settings-device-code__instructions`, whose four declarations
          were `.settings-note`'s four declarations under another name. */}
      <Note>Enter this code on GitHub to finish signing in:</Note>
      <button
        type="button"
        className="settings-device-code__code"
        onClick={() => void copyCode()}
        disabled={busy || expired}
      >
        <span aria-hidden="true">{status.user_code}</span>
        <span className="settings-visually-hidden">
          Copy verification code {spellOutCode(status.user_code)}
        </span>
        {copyState === 'copied' ? (
          <span className="settings-device-code__copied" role="status">
            (Copied to clipboard)
          </span>
        ) : null}
      </button>
      {copyState === 'failed' ? (
        <Note status="failed" live="assertive">
          Could not copy the code to your clipboard.
        </Note>
      ) : null}
      <p className="settings-device-code__link-row">
        Click on the code above to copy it to your clipboard and{' '}
        <button type="button" className="settings-link-button" onClick={onOpenVerification} disabled={busy}>
          launch sign in on your browser.
        </button>
      </p>
      {/* Polite: this is progress narration, not a blocking error. */}
      <Note live="polite">
        {expired
          ? 'This code has expired.'
          : `Waiting for you to finish on GitHub… code expires in ${String(minutesLeft)} minute${minutesLeft === 1 ? '' : 's'}.`}
      </Note>
      <div className="settings-device-code__actions">
        {expired ? (
          <Button variant="primary" onClick={onRequestNewCode} disabled={busy}>
            {busy ? 'Requesting…' : 'Get a new code'}
          </Button>
        ) : null}
        <Button onClick={onCancel} disabled={busy}>
          Cancel sign-in
        </Button>
      </div>
    </div>
  )
}
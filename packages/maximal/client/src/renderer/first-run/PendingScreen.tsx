import type { ReactElement } from 'react'

import { Button, Note } from 'stuffbucket-electron/renderer'

import { DeviceCode } from './DeviceCode'
import { formatRemaining } from './model'

// The pending screen: a live device code, a link to GitHub, and a polite
// countdown/waiting narration. This is the resumability-critical screen —
// a user who quit mid-flow and reopens lands here directly if the code is
// still live (see useFirstRun.ts: it reads current status on mount rather
// than assuming a fresh start).

interface PendingScreenProps {
  userCode: string
  verificationUri: string
  remainingMs: number
  polling: boolean
  busy: boolean
  onOpenVerification: (url: string) => void
}

export function PendingScreen({
  userCode,
  verificationUri,
  remainingMs,
  polling,
  busy,
  onOpenVerification,
}: PendingScreenProps): ReactElement {
  return (
    <div className="first-run-screen">
      <h1 className="first-run-heading">Enter this code on GitHub</h1>
      <DeviceCode code={userCode} />
      <Button variant="primary" onClick={() => onOpenVerification(verificationUri)} disabled={busy}>
        Open {verificationUri}
      </Button>
      {/* Polite: ongoing progress, never interrupts. */}
      <Note live="polite">
        {polling
          ? `Waiting for you to finish on GitHub… code expires in ${formatRemaining(remainingMs)}.`
          : `Code expires in ${formatRemaining(remainingMs)}.`}
      </Note>
    </div>
  )
}

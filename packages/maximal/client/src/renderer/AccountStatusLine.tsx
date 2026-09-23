import type { ReactElement } from 'react'
import { Button } from 'stuffbucket-electron/renderer'

import { SurfaceStatus } from './frame/AppFrame'
import type { AuthStatus } from './settings/capabilities'
import { useShutdownStatus } from './useShutdownStatus'

function statusText(status: AuthStatus | null): string {
  if (status === null) return 'Checking GitHub Copilot sign-in…'
  switch (status.state) {
    case 'unauthenticated':
      return 'GitHub Copilot: Not signed in'
    case 'device_code_issued':
    case 'polling':
      return 'GitHub Copilot: Waiting for sign-in'
    case 'authenticated':
      return `GitHub Copilot: Signed in as ${status.account_login}`
    case 'error':
      return `GitHub Copilot sign-in: ${status.error}`
  }
}

export function AccountStatusLine({
  status,
}: {
  status: AuthStatus | null
}): ReactElement {
  const shutdown = useShutdownStatus()
  if (shutdown?.phase === 'will') {
    const pending = shutdown.operations.filter(({ phase }) => phase === 'waiting')
    const progress = pending.map(({ label, detail }) => detail ?? label).join(' · ')
    return (
      <SurfaceStatus>
        <span aria-live="polite">Shutting down: {progress || 'finishing work'}</span>
        {pending.length > 0 ? (
          <Button onClick={() => void window.maximal.shutdown.force()}>
            Force quit
          </Button>
        ) : null}
      </SurfaceStatus>
    )
  }

  return (
    <SurfaceStatus>
      <span aria-live="polite">{statusText(status)}</span>
    </SurfaceStatus>
  )
}
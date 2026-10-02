import { Banner, Note } from '@maximal/maximal-electron/renderer'
import { type ReactElement } from 'react'

import type {
  SettingsCapabilities,
} from '../capabilities'
import { ensureSettingsStyles } from '../settings-styles'
import { TerminalTypographyPreview } from './TerminalTypographyPreview'
import { useTerminalTypographyQuery } from './useTerminalTypographyQuery'

export function TerminalTypographyPreviewWindow({
  capabilities,
}: {
  capabilities: SettingsCapabilities['terminalTypography']
}): ReactElement {
  const query = useTerminalTypographyQuery(capabilities)
  ensureSettingsStyles()
  const error = query.error instanceof Error
    ? query.error.message
    : query.error === null
      ? undefined
      : 'Terminal typography settings could not be loaded.'

  return (
    <main className="sb-shell terminal-typography-preview-window">
      {error !== undefined ? (
        <Banner status="failed">{error}</Banner>
      ) : query.data === undefined ? (
        <Note live="polite">Loading terminal typography…</Note>
      ) : (
        <TerminalTypographyPreview typography={query.data} />
      )}
    </main>
  )
}

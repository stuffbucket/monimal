import { Banner, Note } from '@maximal/maximal-electron/renderer'
import { useEffect, useState, type ReactElement } from 'react'

import type {
  SettingsCapabilities,
  TerminalTypographySettings,
} from '../capabilities'
import { ensureSettingsStyles } from '../settings-styles'
import { TerminalTypographyPreview } from './TerminalTypographyPreview'

export function TerminalTypographyPreviewWindow({
  capabilities,
}: {
  capabilities: SettingsCapabilities['terminalTypography']
}): ReactElement {
  const [typography, setTypography] = useState<TerminalTypographySettings>()
  const [error, setError] = useState<string>()
  ensureSettingsStyles()

  useEffect(() => {
    let active = true
    const unsubscribe = capabilities.subscribe((next) => {
      if (active) setTypography(next)
    })
    void capabilities.get().then(
      (loaded) => {
        if (active) setTypography(loaded)
      },
      (cause: unknown) => {
        if (!active) return
        setError(cause instanceof Error
          ? cause.message
          : 'Terminal typography settings could not be loaded.')
      },
    )
    return () => {
      active = false
      unsubscribe()
    }
  }, [capabilities])

  return (
    <main className="sb-shell terminal-typography-preview-window">
      {error !== undefined ? (
        <Banner status="failed">{error}</Banner>
      ) : typography === undefined ? (
        <Note live="polite">Loading terminal typography…</Note>
      ) : (
        <TerminalTypographyPreview typography={typography} />
      )}
    </main>
  )
}

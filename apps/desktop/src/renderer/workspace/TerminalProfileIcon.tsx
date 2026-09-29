import type { CSSProperties, ReactElement } from 'react'
import { TERMINAL_ICON_URLS } from '@maximal/maximal-assets/terminal-icons'
import type { TerminalProfileSummary } from '@maximal/maximal-electron/renderer'

const ICONS: Partial<Record<string, { url: string; color?: string }>> = {
  'claude-desktop': { url: TERMINAL_ICON_URLS.claudeDesktop, color: '#d97757' },
  'claude-code': { url: TERMINAL_ICON_URLS.claudeCode, color: '#d97757' },
  'copilot-cli': { url: TERMINAL_ICON_URLS.copilotCli },
  codex: { url: TERMINAL_ICON_URLS.codex },
}

type TerminalProfileIconStyle = CSSProperties & {
  '--terminal-profile-icon-color': string
  '--terminal-profile-icon-mask': string
}

export function renderTerminalProfileIcon(
  profile: TerminalProfileSummary,
): ReactElement | undefined {
  if (profile.id === 'maximal') {
    return (
      <img
        alt=""
        aria-hidden="true"
        data-testid="terminal-profile-icon-maximal"
        height={24}
        src={TERMINAL_ICON_URLS.maximal}
        width={24}
      />
    )
  }
  const icon = ICONS[profile.id]
  if (!icon) return undefined
  const style: TerminalProfileIconStyle = {
    '--terminal-profile-icon-color': icon.color ?? 'currentColor',
    '--terminal-profile-icon-mask': `url("${icon.url}")`,
  }
  return (
    <span
      aria-hidden="true"
      className="terminal-profile-icon"
      data-testid={`terminal-profile-icon-${profile.id}`}
      style={style}
    />
  )
}

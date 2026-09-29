import type { CSSProperties, ReactElement } from 'react'
import { TERMINAL_ICON_URLS } from '@maximal/maximal-assets/terminal-icons'
import type { TerminalProfileSummary } from '@maximal/maximal-electron/renderer'

const ICONS: Partial<Record<string, { url: string; color?: string }>> = {
  'claude-desktop': { url: TERMINAL_ICON_URLS.claudeDesktop, color: '#d97757' },
  'claude-code': { url: TERMINAL_ICON_URLS.claudeCode, color: '#d97757' },
  'copilot-cli': { url: TERMINAL_ICON_URLS.copilotCli },
  codex: { url: TERMINAL_ICON_URLS.codex },
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
  const style = {
    backgroundColor: icon.color ?? 'currentColor',
    height: 24,
    maskImage: `url("${icon.url}")`,
    maskPosition: 'center',
    maskRepeat: 'no-repeat',
    maskSize: 'contain',
    width: 24,
    WebkitMaskImage: `url("${icon.url}")`,
    WebkitMaskPosition: 'center',
    WebkitMaskRepeat: 'no-repeat',
    WebkitMaskSize: 'contain',
  } satisfies CSSProperties
  return (
    <span
      aria-hidden="true"
      data-testid={`terminal-profile-icon-${profile.id}`}
      style={style}
    />
  )
}

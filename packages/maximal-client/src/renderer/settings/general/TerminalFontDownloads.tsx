import {
  Button,
  SettingsDisclosure,
  SettingsGroup,
  SettingsItem,
} from '@maximal/maximal-electron/renderer'
import type { ReactElement } from 'react'

import type { TerminalFontCatalog } from '../capabilities'
import { FONT_SPECIMENS } from './font-specimens'

export function TerminalFontDownloads({
  catalog,
  installingFont,
  onInstall,
}: {
  catalog: Extract<TerminalFontCatalog, { status: 'available' }>
  installingFont?: string
  onInstall: (fontId: string) => void
}): ReactElement {
  return (
    <div className="terminal-font-downloads">
      <SettingsDisclosure
        title="More Nerd Fonts"
        description="Verified downloads from the official Nerd Fonts release. Fonts are installed for your macOS user account."
      >
        <SettingsGroup dividers={false}>
          {catalog.downloads.map((font) => (
            <SettingsItem
              key={font.id}
              title={
                <img
                  className="terminal-font-specimen"
                  src={FONT_SPECIMENS[font.id]?.name}
                  alt={font.label}
                />
              }
              description={`${font.family} · ${font.license} · ${(font.downloadSize / 1_000_000).toFixed(1)} MB`}
              actions={
                <Button
                  size="sm"
                  disabled={font.installed || installingFont !== undefined}
                  onClick={() => onInstall(font.id)}
                >
                  {font.installed
                    ? 'Installed'
                    : installingFont === font.id
                      ? 'Installing…'
                      : 'Install'}
                </Button>
              }
            />
          ))}
        </SettingsGroup>
      </SettingsDisclosure>
    </div>
  )
}

export interface NerdFontAsset {
  id: string
  label: string
  family: string
  archiveName: string
  downloadSize: number
  sha256: string
  license: string
  sourceUrl: string
}

export const NERD_FONTS_RELEASE = 'v3.5.1'

export const NERD_FONT_ASSETS: readonly NerdFontAsset[] = catalog

export function nerdFontDownloadUrl(asset: NerdFontAsset): string {
  return `https://github.com/ryanoasis/nerd-fonts/releases/download/${NERD_FONTS_RELEASE}/${asset.archiveName}`
}
import catalog from '@maximal/maximal-client/shared/terminal-font-downloads' with { type: 'json' }

import {
  Banner,
  Button,
  Note,
  SettingsGroup,
  SettingsItem,
} from '@maximal/maximal-electron/renderer'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react'

import type {
  SettingsCapabilities,
  TerminalFontCatalog,
  TerminalTypographySettings as TypographySettings,
} from '../capabilities'
import { TerminalFontDownloads } from './TerminalFontDownloads'
import { TerminalPaletteControls } from './TerminalPaletteControls'
import { TerminalTypographyControls } from './TerminalTypographyControls'
import { TerminalTypographyPreview } from './TerminalTypographyPreview'
import {
  terminalTypographyQueryKey,
  useTerminalTypographyQuery,
} from './useTerminalTypographyQuery'

export const terminalFontCatalogQueryKey = [
  'settings',
  'terminal',
  'font-catalog',
] as const

function errorMessage(cause: unknown, fallback: string): string {
  if (!(cause instanceof Error)) return fallback
  return cause.message.replace(
    /^Error invoking remote method '[^']+': Error: /u,
    '',
  )
}

function availableFontOptions(
  catalog: TerminalFontCatalog | null,
  settings: TypographySettings | null,
): Array<{ value: string; label: string }> {
  const fonts = catalog?.fonts ?? []
  const values = settings === null ? fonts : [settings.fontFamily, ...fonts]
  const downloadLabels = new Map(
    (catalog?.downloads ?? []).map(({ family, label }) => [family, label]),
  )
  const systemFamilies = new Set([
    'SF Mono',
    'Menlo',
    'Monaco',
    'Andale Mono',
    'Cascadia Mono',
    'Cascadia Code',
    'Consolas',
    'IBM Plex Mono',
    'Source Code Pro',
    'Noto Sans Mono',
    'Ubuntu Mono',
    'DejaVu Sans Mono',
    'Liberation Mono',
    'Courier Prime',
  ])
  const ordered = [...new Set(values)]
    .filter((font) => font !== 'ui-monospace')
    .sort((left, right) => {
      const systemOrder = Number(systemFamilies.has(right))
        - Number(systemFamilies.has(left))
      return systemOrder || left.localeCompare(right)
    })
  return [
    { value: 'ui-monospace', label: 'System monospace (recommended)' },
    ...ordered.map((font) => ({
      value: font,
      label: systemFamilies.has(font)
        ? `${font} (system)`
        : (downloadLabels.get(font) ?? font),
    })),
  ]
}

function catalogIncludesFont(
  catalog: TerminalFontCatalog,
  family: string,
): boolean {
  return catalog.status === 'available' && catalog.fonts.includes(family)
}

function TypographySurface({
  surface,
  settings,
  catalog,
  fontOptions,
  settingsError,
  fontError,
  fontNotice,
  previewError,
  installingFont,
  onPreview,
  onUpdate,
  onInstall,
  onOpenPreview,
}: {
  surface: 'typography' | 'palette'
  settings: TypographySettings | null
  catalog: TerminalFontCatalog | null
  fontOptions: Array<{ value: string; label: string }>
  settingsError?: string
  fontError?: string
  fontNotice?: string
  previewError?: string
  installingFont?: string
  onPreview: (patch: Partial<TypographySettings>) => void
  onUpdate: (patch: Partial<TypographySettings>) => void
  onInstall: (fontId: string) => void
  onOpenPreview: () => void
}): ReactElement {
  return (
    <section
      className="settings__section"
      aria-label={surface === 'typography'
        ? 'Terminal Typography'
        : 'Terminal Color Palettes'}
      data-testid="terminal-typography-settings"
    >
      {settingsError ? (
        <Banner status="failed">
          <strong>Terminal appearance could not be updated:</strong> {settingsError}
        </Banner>
      ) : null}
      {previewError ? (
        <Banner status="failed">
          <strong>The full specimen could not be opened:</strong> {previewError}
        </Banner>
      ) : null}
      {surface === 'typography' ? (
        <SettingsGroup dividers={false}>
          <SettingsItem
            title="Terminal Typography"
            description="Shape terminal type with a compact proof beside the controls."
            actions={(
              <Button size="sm" onClick={onOpenPreview}>
                Full specimen
              </Button>
            )}
          />
          <div className="terminal-typography-workbench">
            {settings === null ? (
              <Note live="polite">Loading terminal typography…</Note>
            ) : (
              <TerminalTypographyControls
                settings={settings}
                catalog={catalog}
                fontOptions={fontOptions}
                onPreview={onPreview}
                onUpdate={onUpdate}
              />
            )}
            <TerminalTypographyPreview typography={settings} compact />
          </div>
        </SettingsGroup>
      ) : settings === null ? (
        <Note live="polite">Loading terminal color palettes…</Note>
      ) : (
        <SettingsGroup dividers={false}>
          <SettingsItem
            title="Terminal Palette & Window"
            description="Coordinate light and dark palettes with window transparency, tint, tone, and contrast."
          />
          <div className="terminal-typography-workbench">
            <TerminalPaletteControls
              settings={settings}
              onPreview={onPreview}
              onUpdate={onUpdate}
            />
          </div>
        </SettingsGroup>
      )}
      {surface === 'typography' && fontError ? (
        <Banner status="failed">
          <strong>Font installation failed:</strong> {fontError}
        </Banner>
      ) : null}
      {surface === 'typography' && installingFont !== undefined ? (
        <Banner status="running">
          <strong>Installing font:</strong>{' '}
          {catalog?.downloads.find(({ id }) => id === installingFont)?.label
            ?? installingFont}. Downloading, verifying, and registering it
          with the terminal…
        </Banner>
      ) : null}
      {surface === 'typography' && fontNotice
        ? <Banner status="done">{fontNotice}</Banner>
        : null}
      {surface === 'typography'
      && catalog?.status === 'available'
      && catalog.downloads.length > 0 ? (
        <TerminalFontDownloads
          catalog={catalog}
          installingFont={installingFont}
          onInstall={onInstall}
        />
      ) : null}
    </section>
  )
}

export function TerminalTypographySettings({
  capabilities,
  surface,
}: {
  capabilities: SettingsCapabilities['terminalTypography']
  surface: 'typography' | 'palette'
}): ReactElement {
  const queryClient = useQueryClient()
  const settingsQuery = useTerminalTypographyQuery(capabilities)
  const fontCatalogQuery = useQuery({
    queryKey: terminalFontCatalogQueryKey,
    queryFn: () => capabilities.fonts(),
    enabled: surface === 'typography',
  })
  const [localSettings, setLocalSettings] =
    useState<TypographySettings | null>(null)
  const settings = localSettings ?? settingsQuery.data ?? null
  const catalog = useMemo<TerminalFontCatalog | null>(
    () => surface !== 'typography'
      ? null
      : fontCatalogQuery.data ?? (fontCatalogQuery.error === null
        ? null
        : {
            status: 'unavailable',
            fonts: [],
            downloads: [],
            message: errorMessage(
              fontCatalogQuery.error,
              'The terminal could not list the fonts installed on this host.',
            ),
          }),
    [fontCatalogQuery.data, fontCatalogQuery.error, surface],
  )
  const [updateError, setUpdateError] = useState<string>()
  const [fontError, setFontError] = useState<string>()
  const [fontNotice, setFontNotice] = useState<string>()
  const [previewError, setPreviewError] = useState<string>()
  const [installingFont, setInstallingFont] = useState<string>()
  const persisted = useRef<TypographySettings | null>(null)
  const settingsRef = useRef<TypographySettings | null>(null)
  const updateRevision = useRef(0)
  const saveQueue = useRef(Promise.resolve())

  useEffect(() => {
    settingsRef.current = settings
    if (persisted.current === null && settings !== null) {
      persisted.current = settings
    }
  }, [settings])
  const settingsError = updateError ?? (settingsQuery.error === null
    ? undefined
    : errorMessage(
        settingsQuery.error,
        'Terminal typography settings could not be loaded.',
      ))
  const fontOptions = useMemo(
    () => availableFontOptions(catalog, settings), [catalog, settings],
  )
  const preview = (patch: Partial<TypographySettings>): void => {
    if (settingsRef.current === null) return
    updateRevision.current += 1
    const next = { ...settingsRef.current, ...patch }
    settingsRef.current = next
    setLocalSettings(next)
    queryClient.setQueryData(terminalTypographyQueryKey, next)
  }
  const update = (patch: Partial<TypographySettings>): void => {
    if (settingsRef.current === null) return
    const next = { ...settingsRef.current, ...patch }
    settingsRef.current = next
    setLocalSettings(next)
    queryClient.setQueryData(terminalTypographyQueryKey, next)
    setUpdateError(undefined)
    const revision = updateRevision.current + 1
    updateRevision.current = revision
    saveQueue.current = saveQueue.current.then(async () => {
      try {
        const saved = await capabilities.update(next)
        persisted.current = saved
        if (updateRevision.current !== revision) return
        settingsRef.current = saved
        setLocalSettings(saved)
        queryClient.setQueryData(terminalTypographyQueryKey, saved)
      } catch (cause) {
        if (updateRevision.current !== revision) return
        const fallback = persisted.current ?? next
        settingsRef.current = fallback
        setLocalSettings(fallback)
        queryClient.setQueryData(terminalTypographyQueryKey, fallback)
        setUpdateError(errorMessage(
          cause,
          'Terminal typography settings could not be saved.',
        ))
      }
    })
  }

  const installFont = async (fontId: string): Promise<void> => {
    if (installingFont !== undefined) return
    const selectedFont = catalog?.downloads.find(({ id }) => id === fontId)
    setInstallingFont(fontId)
    setFontError(undefined)
    setFontNotice(undefined)
    try {
      const installedCatalog = await capabilities.installFont(fontId)
      if (
        selectedFont !== undefined
        && !catalogIncludesFont(installedCatalog, selectedFont.family)
      ) {
        throw new Error(
          `${selectedFont.label} was installed, but it is not available in the terminal font list.`,
        )
      }
      queryClient.setQueryData(terminalFontCatalogQueryKey, installedCatalog)
      setFontNotice(
        `${selectedFont?.label ?? 'The font'} is installed and available in Family.`,
      )
    } catch (cause) {
      setFontError(errorMessage(cause, 'The Nerd Font could not be installed.'))
    } finally {
      setInstallingFont(undefined)
    }
  }

  return (
    <TypographySurface
      surface={surface}
      {...{
        settings,
        catalog,
        fontOptions,
        settingsError,
        fontError,
        fontNotice,
        previewError,
        installingFont,
      }}
      onPreview={preview}
      onUpdate={update}
      onInstall={(fontId) => void installFont(fontId)}
      onOpenPreview={() => {
        setPreviewError(undefined)
        void capabilities.openPreview().catch((cause: unknown) => {
          setPreviewError(errorMessage(
            cause,
            'The terminal typography preview could not be opened.',
          ))
        })
      }}
    />
  )
}

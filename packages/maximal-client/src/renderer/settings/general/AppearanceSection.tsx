import {
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement,
  type RefObject,
} from 'react'

import {
  Button,
  Note,
  Select,
  SettingsGroup,
  SettingsItem,
  SettingsSection,
  TextInput,
} from '@maximal/maximal-electron/renderer'

import {
  APPEARANCE_PRESETS,
  appearanceAccent,
  appearanceSpatialCanvasBackground,
  parseAppearanceTheme,
  readAppearance,
  saveAppearance,
  serializeAppearance,
  type AppearanceMode,
  type AppearancePreset,
  type AppearanceThemeFile,
} from '../../appearance'

function ThemeFileControls({
  theme,
  importInput,
  onThemeChange,
  onDraftChange,
  onImport,
  onExport,
}: {
  theme: AppearanceThemeFile
  importInput: RefObject<HTMLInputElement | null>
  onThemeChange: (theme: AppearanceThemeFile) => void
  onDraftChange: (theme: AppearanceThemeFile) => void
  onImport: (event: ChangeEvent<HTMLInputElement>) => void
  onExport: () => void
}): ReactElement {
  return (
    <SettingsItem
      title="Custom theme"
      divider={false}
      description="Name the current theme and optionally choose one accent. Exported files use Maximal Theme JSON v1."
      actions={
        <div className="appearance-actions">
          <Button size="sm" onClick={() => importInput.current?.click()}>
            Import
          </Button>
          <Button size="sm" onClick={onExport}>Export</Button>
          <input
            ref={importInput}
            className="appearance-file-input"
            type="file"
            accept=".json,.maximal-theme.json,application/json"
            onChange={onImport}
            aria-label="Import theme file"
          />
        </div>
      }
    >
      <div className="appearance-editor">
        <TextInput
          value={theme.name}
          onChange={(name) => onDraftChange({ ...theme, name })}
          onBlur={() => onThemeChange(theme)}
          aria-label="Theme name"
        />
        <label className="appearance-color">
          <span>Accent</span>
          <input
            type="color"
            value={appearanceAccent(theme)}
            onChange={(event) =>
              onThemeChange({
                ...theme,
                colors: {
                  ...theme.colors,
                  accent: event.target.value.toUpperCase(),
                },
              })}
          />
        </label>
        <label className="appearance-color">
          <span>Spatial canvas</span>
          <input
            type="color"
            value={appearanceSpatialCanvasBackground(theme)}
            aria-label="Spatial canvas background"
            onChange={(event) =>
              onThemeChange({
                ...theme,
                colors: {
                  ...theme.colors,
                  spatialCanvasBackground: event.target.value.toUpperCase(),
                },
              })}
          />
        </label>
      </div>
    </SettingsItem>
  )
}

export function AppearanceSection(): ReactElement {
  const [appearance, setAppearance] = useState(readAppearance)
  const theme = appearance.theme
  const importInput = useRef<HTMLInputElement>(null)

  const updateTheme = (next: AppearanceThemeFile): void => {
    try {
      saveAppearance(next)
      setAppearance({ theme: next })
    } catch (error) {
      setAppearance({
        theme,
        error: error instanceof Error ? error.message : 'The theme could not be saved.',
      })
    }
  }

  const importTheme = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file === undefined) return
    try {
      updateTheme(parseAppearanceTheme(await file.text()))
    } catch (error) {
      setAppearance({
        theme,
        error: error instanceof Error ? error.message : 'The theme could not be imported.',
      })
    }
  }

  const exportTheme = (): void => {
    const url = URL.createObjectURL(
      new Blob([serializeAppearance(theme)], { type: 'application/json' }),
    )
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${
      theme.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-') || 'theme'
    }.maximal-theme.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      {appearance.error ? (
        <Note status="failed" live="assertive">
          {appearance.error}
        </Note>
      ) : null}
      <SettingsSection
        title="Theme"
        description="Quiet, legible palettes that follow the operating system or stay fixed."
      >
        <SettingsGroup>
          <SettingsItem
            title="Mode"
            description="Auto follows the macOS, Windows, or Linux appearance setting."
            control={
              <Select<AppearanceMode>
                value={theme.appearance}
                options={[
                  { value: 'system', label: 'Auto' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
                onChange={(appearanceMode) =>
                  updateTheme({ ...theme, appearance: appearanceMode })}
                aria-label="Appearance mode"
                testId="appearance-mode"
              />
            }
          />
          <SettingsItem
            title="Palette"
            divider={false}
            description={
              APPEARANCE_PRESETS.find(({ value }) => value === theme.preset)?.source
            }
            control={
              <Select<AppearancePreset>
                value={theme.preset}
                options={APPEARANCE_PRESETS.map(({ value, label }) => ({ value, label }))}
                onChange={(preset) =>
                  updateTheme({
                    ...theme,
                    name:
                      APPEARANCE_PRESETS.find(({ value }) => value === preset)?.label
                      ?? theme.name,
                    preset,
                    colors: undefined,
                  })}
                aria-label="Color palette"
                testId="appearance-preset"
              />
            }
          />
          <ThemeFileControls
            theme={theme}
            importInput={importInput}
            onThemeChange={updateTheme}
            onDraftChange={(draft) => setAppearance({ theme: draft })}
            onImport={(event) => void importTheme(event)}
            onExport={exportTheme}
          />
        </SettingsGroup>
      </SettingsSection>
    </>
  )
}

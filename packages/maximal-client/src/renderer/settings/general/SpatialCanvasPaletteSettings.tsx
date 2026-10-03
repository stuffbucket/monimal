import { useEffect, useState, type ReactElement } from 'react'

import {
  SettingsGroup,
  SettingsItem,
  SettingsSection,
} from '@maximal/maximal-electron/renderer'

import {
  appearanceSpatialCanvasBackground,
  readAppearance,
  saveAppearance,
  subscribeToAppearance,
  type AppearanceThemeFile,
} from '../../appearance'

export function SpatialCanvasPaletteSettings(): ReactElement {
  const [theme, setTheme] = useState<AppearanceThemeFile>(
    () => readAppearance().theme,
  )

  useEffect(() => subscribeToAppearance(setTheme), [])

  return (
    <SettingsSection
      title="Workspace palette"
      description="Set colors used by spatial workspaces independently from terminal palettes."
    >
      <SettingsGroup>
        <SettingsItem
          title="Spatial canvas background"
          divider={false}
          description="Set the default background behind projects, pages, and spatial canvas content."
          control={
            <label className="appearance-color">
              <span>{appearanceSpatialCanvasBackground(theme)}</span>
              <input
                type="color"
                value={appearanceSpatialCanvasBackground(theme)}
                aria-label="Spatial canvas background"
                data-testid="spatial-canvas-background"
                onChange={(event) => {
                  const next = {
                    ...theme,
                    colors: {
                      ...theme.colors,
                      spatialCanvasBackground:
                        event.target.value.toUpperCase(),
                    },
                  }
                  saveAppearance(next)
                  setTheme(next)
                }}
              />
            </label>
          }
        />
      </SettingsGroup>
    </SettingsSection>
  )
}

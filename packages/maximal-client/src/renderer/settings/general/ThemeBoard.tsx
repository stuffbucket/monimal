import type { CSSProperties, ReactElement } from 'react'

import {
  themeGradient,
  type AppearanceThemeFile,
} from '../../appearance'
import { themeBoardPlacement } from '../../themes/catalog'

const HUE_LABELS = [
  'Crimson',
  'Amber',
  'Gold',
  'Leaf',
  'Turquoise',
  'Cobalt',
  'Violet',
  'Magenta',
] as const

const CUE_LABELS = [
  'Nocturne',
  'Dusk',
  'Jewel',
  'Vivid',
  'Garden',
  'Seasonal',
  'Mineral',
  'Luminous',
] as const

export function ThemeCard({
  theme,
  selected,
  disabled,
  compact = false,
  showMeta = false,
  meta,
  testId,
  onSelect,
}: {
  theme: AppearanceThemeFile
  selected: boolean
  disabled: boolean
  compact?: boolean
  showMeta?: boolean
  meta?: string
  testId?: string
  onSelect?: () => void
}): ReactElement {
  const palette = theme.colors[theme.appearance === 'light' ? 'light' : 'dark']
  const gradient = themeGradient(theme)
  const style = {
    '--theme-card-background': palette.background,
    '--theme-card-surface': palette.surface,
    '--theme-card-text': palette.text,
    '--theme-card-accent': palette.accent,
    ...(gradient === undefined ? {} : { '--theme-card-gradient': gradient }),
  } as CSSProperties
  const className = [
    'theme-card',
    compact ? 'theme-card--compact' : '',
    showMeta ? 'theme-card--show-meta' : '',
  ].filter(Boolean).join(' ')
  const content = (
    <>
      <span className="theme-card__preview" aria-hidden="true">
        <span /><span /><span />
      </span>
      <span className="theme-card__copy">
        <strong>{theme.name}</strong>
        <span>{theme.description}</span>
      </span>
      <span className="theme-card__meta">
        {meta ?? (
          <>
            {theme.shader ? 'Shader · ' : ''}
            {theme.category.replace('-', ' ')}
          </>
        )}
      </span>
    </>
  )
  if (onSelect === undefined) {
    return (
      <div
        className={className}
        style={style}
        data-current={selected ? 'true' : undefined}
        data-testid={testId}
      >
        {content}
      </div>
    )
  }
  return (
    <button
      type="button"
      className={className}
      style={style}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      data-testid={testId ?? `theme-card-${theme.id}`}
    >
      {content}
    </button>
  )
}

export function ThemeBoard({
  themes,
  currentId,
  busy,
  onSelect,
}: {
  themes: AppearanceThemeFile[]
  currentId: string
  busy: boolean
  onSelect: (theme: AppearanceThemeFile) => void
}): ReactElement {
  return (
    <div className="theme-board-scroll">
      <div className="theme-board" aria-label="Themes by hue and cue">
        <span className="theme-board__corner">Cue / hue</span>
        {HUE_LABELS.map((label, hue) => (
          <span
            key={label}
            className="theme-board__hue"
            style={{ gridColumn: hue + 2 }}
          >
            {label}
          </span>
        ))}
        {CUE_LABELS.map((label, cue) => (
          <span
            key={label}
            className="theme-board__cue"
            style={{ gridRow: cue + 2 }}
          >
            {label}
          </span>
        ))}
        {CUE_LABELS.flatMap((cueLabel, cue) =>
          HUE_LABELS.map((hueLabel, hue) => {
            const cellThemes = themes.filter((theme) => {
              const placement = themeBoardPlacement(theme)
              return placement.hue === hue && placement.cue === cue
            })
            const placedThemes = cellThemes.filter(({ placement }) =>
              placement !== undefined)
            const nearbyThemes = cellThemes.filter(({ placement }) =>
              placement === undefined)
            return (
              <div
                key={`${String(cue)}-${String(hue)}`}
                className="theme-board__cell"
                style={{ gridColumn: hue + 2, gridRow: cue + 2 }}
                aria-label={`${cueLabel} ${hueLabel}`}
              >
                {placedThemes.map((theme) => (
                  <ThemeCard
                    key={theme.id}
                    theme={theme}
                    selected={theme.id === currentId}
                    disabled={busy}
                    compact
                    onSelect={() => onSelect(theme)}
                  />
                ))}
                {nearbyThemes.length > 0 ? (
                  <details className="theme-board__nearby">
                    <summary>
                      +{String(nearbyThemes.length)} nearby
                    </summary>
                    <div>
                      {nearbyThemes.map((theme) => (
                        <ThemeCard
                          key={theme.id}
                          theme={theme}
                          selected={theme.id === currentId}
                          disabled={busy}
                          compact
                          onSelect={() => onSelect(theme)}
                        />
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
            )
          }),
        )}
      </div>
    </div>
  )
}

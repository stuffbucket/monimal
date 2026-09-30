import {
  Select,
  Slider,
  Switch,
} from '@maximal/maximal-electron/renderer'
import {
  DEFAULT_TERMINAL_PALETTE_SETTINGS,
  resolveTerminalAppearance,
  type TerminalBlendMode,
  type TerminalColorMode,
  type TerminalPalette,
  type TerminalPaletteSettings,
} from '@maximal/maximal-terminal/renderer'
import { useState, type CSSProperties, type ReactElement } from 'react'

import type { TerminalTypographySettings } from '../capabilities'
import { TerminalColorPicker } from './TerminalColorPicker'

const MODE_OPTIONS = [
  { value: 'auto', label: 'Auto — follow window' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]
const BLEND_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
]
const PRIMARY_COLOURS: Array<[keyof TerminalPalette, string]> = [
  ['background', 'Background'],
  ['foreground', 'Foreground'],
  ['cursor', 'Cursor'],
  ['selectionBackground', 'Selection'],
]
const ANSI_COLOURS: Array<[keyof TerminalPalette, string]> = [
  ['black', 'Black'], ['red', 'Red'], ['green', 'Green'], ['yellow', 'Yellow'],
  ['blue', 'Blue'], ['magenta', 'Magenta'], ['cyan', 'Cyan'], ['white', 'White'],
  ['brightBlack', 'Bright black'], ['brightRed', 'Bright red'],
  ['brightGreen', 'Bright green'], ['brightYellow', 'Bright yellow'],
  ['brightBlue', 'Bright blue'], ['brightMagenta', 'Bright magenta'],
  ['brightCyan', 'Bright cyan'], ['brightWhite', 'Bright white'],
]

function options(
  minimum: number,
  maximum: number,
  step: number,
  label: (value: number) => string,
): ReadonlyArray<{ value: number; label: string }> {
  const count = Math.round((maximum - minimum) / step)
  return Array.from({ length: count + 1 }, (_, index) => {
    const value = Number((minimum + (index * step)).toFixed(4))
    return { value, label: label(value) }
  })
}

function PaletteSlider({
  title,
  label,
  value,
  values,
  disabled,
  testId,
  onPreview,
  onCommit,
}: {
  title: string
  label: string
  value: number
  values: ReadonlyArray<{ value: number; label: string }>
  disabled?: boolean
  testId: string
  onPreview: (value: number) => void
  onCommit: (value: number) => void
}): ReactElement {
  const selected = values.reduce((closest, option) =>
    Math.abs(option.value - value) < Math.abs(closest.value - value)
      ? option
      : closest)
  return (
    <div className="terminal-palette-field" data-disabled={disabled || undefined}>
      <div className="terminal-palette-field__heading">
        <span>{title}</span>
        <output>{selected.label}</output>
      </div>
      <Slider
        label={label}
        value={value}
        options={values}
        disabled={disabled}
        showLabels={false}
        showDetents={false}
        directionalSnap
        onChange={onPreview}
        onCommit={onCommit}
        testId={testId}
      />
    </div>
  )
}

function validMode(value: string): value is TerminalColorMode {
  return value === 'auto' || value === 'light' || value === 'dark'
}

function validBlend(value: string): value is TerminalBlendMode {
  return BLEND_OPTIONS.some((option) => option.value === value)
}

function effectPreviewStyle(
  palette: TerminalPaletteSettings,
  dark: boolean,
): { frame: CSSProperties; terminal: CSSProperties; theme: TerminalPalette } {
  const windowBackground = dark ? '#1c1f26' : '#eef0f4'
  const resolved = resolveTerminalAppearance(palette, dark, windowBackground)
  const { window, theme } = resolved
  const layers: string[] = []
  const blendModes: string[] = []
  if (window.tint && (window.tintAmount ?? 0) > 0) {
    layers.push(`linear-gradient(rgb(from ${window.tint} r g b / ${String(window.tintAmount)}), rgb(from ${window.tint} r g b / ${String(window.tintAmount)}))`)
    blendModes.push(window.blendMode ?? 'normal')
  }
  if ((window.tone ?? 0) !== 0) {
    const tone = window.tone ?? 0
    const colour = tone < 0 ? '0 0 0' : '255 255 255'
    layers.push(`linear-gradient(rgb(${colour} / ${String(Math.abs(tone))}), rgb(${colour} / ${String(Math.abs(tone))}))`)
    blendModes.push('normal')
  }
  return {
    frame: { backgroundColor: windowBackground },
    terminal: {
      backgroundColor: `color-mix(in srgb, ${theme.background} ${String((window.opacity ?? 1) * 100)}%, transparent)`,
      backgroundImage: layers.join(', '),
      backgroundBlendMode: blendModes.join(', '),
      backdropFilter: window.blur ? `blur(${String(window.blur)}px)` : 'none',
      color: theme.foreground,
    },
    theme,
  }
}

function ColourControl({
  name,
  label,
  value,
  onPreview,
  onCommit,
}: {
  name: string
  label: string
  value: string
  onPreview: (value: string) => void
  onCommit: (value: string) => void
}): ReactElement {
  return (
    <div className="terminal-palette-colour">
      <TerminalColorPicker
        label={label}
        value={value}
        onPreview={onPreview}
        onCommit={onCommit}
        testId={`terminal-palette-${name}`}
      />
      <span>{label}</span>
      <output>{value.toUpperCase()}</output>
    </div>
  )
}

export function TerminalPaletteControls({
  settings,
  onPreview,
  onUpdate,
}: {
  settings: TerminalTypographySettings
  onPreview: (patch: Partial<TerminalTypographySettings>) => void
  onUpdate: (patch: Partial<TerminalTypographySettings>) => void
}): ReactElement {
  const palette = settings.palette ?? DEFAULT_TERMINAL_PALETTE_SETTINGS
  const initialDark = palette.mode === 'dark'
    || (
      palette.mode === 'auto'
      && (document.documentElement.dataset.theme === 'dark'
        || (
          document.documentElement.dataset.theme === undefined
          && window.matchMedia?.('(prefers-color-scheme: dark)').matches
        ))
    )
  const [editing, setEditing] = useState<'light' | 'dark'>(
    initialDark ? 'dark' : 'light',
  )
  const colours = palette[editing]
  const preview = effectPreviewStyle(palette, editing === 'dark')
  const patchPalette = (
    next: Partial<TerminalPaletteSettings>,
  ): Partial<TerminalTypographySettings> => ({
    palette: { ...palette, ...next },
  })
  const patchEffects = (
    next: Partial<TerminalPaletteSettings['effects']>,
  ): Partial<TerminalTypographySettings> => ({
    palette: {
      ...palette,
      effects: { ...palette.effects, ...next },
    },
  })
  const updateColour = (key: keyof TerminalPalette, value: string): void => {
    onUpdate(patchPalette({
      [editing]: { ...colours, [key]: value },
    }))
  }
  const previewColour = (key: keyof TerminalPalette, value: string): void => {
    onPreview(patchPalette({
      [editing]: { ...colours, [key]: value },
    }))
  }
  return (
    <div className="terminal-palette-controls">
      <div className="terminal-palette-toolbar">
        <label>
          <span>Terminal mode</span>
          <Select
            aria-label="Terminal color mode"
            value={palette.mode}
            options={MODE_OPTIONS}
            onChange={(mode) => {
              if (validMode(mode)) onUpdate(patchPalette({ mode }))
            }}
            testId="terminal-color-mode"
          />
        </label>
        <label>
          <span>Edit palette</span>
          <Select
            aria-label="Palette to edit"
            value={editing}
            options={[
              { value: 'light', label: 'Light palette' },
              { value: 'dark', label: 'Dark palette' },
            ]}
            onChange={(value) => {
              if (value === 'light' || value === 'dark') setEditing(value)
            }}
            testId="terminal-palette-editing"
          />
        </label>
      </div>

      <div
        className="terminal-palette-preview-frame"
        style={preview.frame}
      >
        <div
          className="terminal-palette-preview"
          style={preview.terminal}
        >
          <span>$ maximal terminal --palette</span>
          <strong>The quick brown fox jumps over 0123456789</strong>
          <div className="terminal-palette-preview__swatches" aria-hidden="true">
            {ANSI_COLOURS.map(([key]) => (
              <span key={key} style={{ backgroundColor: preview.theme[key] }} />
            ))}
          </div>
        </div>
      </div>

      <div className="terminal-palette-primary">
        {PRIMARY_COLOURS.map(([key, label]) => (
          <ColourControl
            key={key}
            name={`${editing}-${key}`}
            label={label}
            value={colours[key]}
            onPreview={(value) => previewColour(key, value)}
            onCommit={(value) => updateColour(key, value)}
          />
        ))}
      </div>

      <details className="terminal-palette-ansi">
        <summary>ANSI palette</summary>
        <div>
          {ANSI_COLOURS.map(([key, label]) => (
            <ColourControl
              key={key}
              name={`${editing}-${key}`}
              label={label}
              value={colours[key]}
              onPreview={(value) => previewColour(key, value)}
              onCommit={(value) => updateColour(key, value)}
            />
          ))}
        </div>
      </details>

      <div className="terminal-palette-effects">
        <div className="terminal-palette-effects__header">
          <h4>Window effects</h4>
          <p>
            Adjust the terminal background layer without changing text or ANSI colors.
            Contrast compensation can adapt the palette to remain readable.
          </p>
        </div>
        <div className="terminal-palette-effects__grid">
          <PaletteSlider
            title="Opacity"
            label="Terminal background opacity"
            value={palette.effects.opacity}
            values={options(0, 1, 0.01, (value) => `${String(Math.round(value * 100))}%`)}
            testId="terminal-background-opacity"
            onPreview={(opacity) => onPreview(patchEffects({ opacity }))}
            onCommit={(opacity) => onUpdate(patchEffects({ opacity }))}
          />
          <PaletteSlider
            title="Blur"
            label="Terminal backdrop blur"
            value={palette.effects.blur}
            values={options(0, 64, 1, (value) => `${String(value)} px`)}
            testId="terminal-background-blur"
            onPreview={(blur) => onPreview(patchEffects({ blur }))}
            onCommit={(blur) => onUpdate(patchEffects({ blur }))}
          />
          <div className="terminal-palette-field terminal-palette-field--tint">
            <span>Tint</span>
            <TerminalColorPicker
              label="Terminal window tint"
              value={palette.effects.tint}
              onPreview={(tint) => onPreview(patchEffects({ tint }))}
              onCommit={(tint) => onUpdate(patchEffects({ tint }))}
              testId="terminal-window-tint"
            />
            <Select
              aria-label="Terminal tint blend mode"
              value={palette.effects.blendMode}
              options={BLEND_OPTIONS}
              onChange={(blendMode) => {
                if (validBlend(blendMode)) {
                  onUpdate(patchEffects({ blendMode }))
                }
              }}
              testId="terminal-tint-blend-mode"
            />
          </div>
          <PaletteSlider
            title="Tint amount"
            label="Terminal tint amount"
            value={palette.effects.tintAmount}
            values={options(0, 1, 0.01, (value) => `${String(Math.round(value * 100))}%`)}
            testId="terminal-tint-amount"
            onPreview={(tintAmount) => onPreview(patchEffects({ tintAmount }))}
            onCommit={(tintAmount) => onUpdate(patchEffects({ tintAmount }))}
          />
          <PaletteSlider
            title="Tone"
            label="Terminal tone"
            value={palette.effects.tone}
            values={options(-1, 1, 0.01, (value) => `${value > 0 ? '+' : ''}${String(Math.round(value * 100))}%`)}
            testId="terminal-tone"
            onPreview={(tone) => onPreview(patchEffects({ tone }))}
            onCommit={(tone) => onUpdate(patchEffects({ tone }))}
          />
          <PaletteSlider
            title="Minimum contrast"
            label="Terminal minimum contrast"
            value={palette.minimumContrast}
            values={options(1, 21, 0.25, (value) => value === 1 ? 'Off' : `${String(value)}:1`)}
            disabled={!palette.effects.compensate}
            testId="terminal-minimum-contrast"
            onPreview={(minimumContrast) => onPreview(patchPalette({ minimumContrast }))}
            onCommit={(minimumContrast) => onUpdate(patchPalette({ minimumContrast }))}
          />
        </div>
        <div className="terminal-palette-effects__switches">
          <label>
            <span>
              <strong>Compensate palette</strong>
              <small>Lift text and ANSI colors against the composited window.</small>
            </span>
            <Switch
              label="Compensate terminal palette contrast"
              displayLabel={null}
              checked={palette.effects.compensate}
              onChange={(compensate) => onUpdate(patchEffects({ compensate }))}
              testId="terminal-palette-compensate"
            />
          </label>
          <label>
            <span>
              <strong>Stamp tint and tone</strong>
              <small>Write adjustments into palette colors instead of a window layer.</small>
            </span>
            <Switch
              label="Stamp tint and tone into terminal palette"
              displayLabel={null}
              checked={palette.effects.stamp}
              onChange={(stamp) => onUpdate(patchEffects({ stamp }))}
              testId="terminal-palette-stamp"
            />
          </label>
        </div>
      </div>
    </div>
  )
}

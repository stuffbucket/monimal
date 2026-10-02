import {
  Slider,
  Switch,
} from '@maximal/maximal-electron/renderer'
import { useState, type ReactElement } from 'react'

import type {
  TerminalFontAxis,
  TerminalFontCatalog,
  TerminalTypographySettings as TypographySettings,
} from '../capabilities'
import { TerminalTypographyBasics } from './TerminalTypographyBasics'

function numericOptions(
  minimum: number,
  maximum: number,
  step: number,
  label: (value: number) => string,
): ReadonlyArray<{ value: number; label: string }> {
  const count = Math.floor((maximum - minimum) / step)
  const options = Array.from({ length: count + 1 }, (_, index) => {
    const value = Number((minimum + (index * step)).toFixed(4))
    return { value, label: label(value) }
  })
  if (options.at(-1)?.value !== maximum) {
    options.push({ value: maximum, label: label(maximum) })
  }
  return options
}

function percentageLabel(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

const BASELINE = numericOptions(-20, 20, 0.1, percentageLabel)
const STRENGTH = numericOptions(0, 100, 1, (value) => `${String(value)}%`)
type TypographySection = 'font' | 'spacing' | 'rendering' | 'features'
const TYPOGRAPHY_SECTIONS: Array<{
  value: TypographySection
  label: string
}> = [
  { value: 'font', label: 'Font' },
  { value: 'spacing', label: 'Spacing & alignment' },
  { value: 'rendering', label: 'Rendering' },
  { value: 'features', label: 'Features' },
]
const FONT_FEATURES = [
  { tag: 'liga', label: 'Standard ligatures', description: 'Common joined glyphs.' },
  { tag: 'calt', label: 'Contextual alternates', description: 'Context-aware programming forms.' },
  { tag: 'dlig', label: 'Discretionary ligatures', description: 'Optional decorative joins.' },
  { tag: 'zero', label: 'Slashed zero', description: 'Distinguish zero from capital O.' },
  { tag: 'tnum', label: 'Tabular figures', description: 'Equal-width numerals for columns.' },
  { tag: 'onum', label: 'Old-style figures', description: 'Lowercase-style numerals.' },
  { tag: 'smcp', label: 'Small capitals', description: 'Use designed small-cap glyphs.' },
  { tag: 'case', label: 'Case-sensitive forms', description: 'Align punctuation for capitals.' },
  ...Array.from({ length: 10 }, (_, index) => {
    const tag = `ss${String(index + 1).padStart(2, '0')}`
    return {
      tag,
      label: `Stylistic set ${String(index + 1)}`,
      description: 'Typeface-specific alternate glyphs.',
    }
  }),
]

function SectionTabs({
  selected,
  onSelect,
}: {
  selected: TypographySection
  onSelect: (section: TypographySection) => void
}): ReactElement {
  return (
    <div
      className="terminal-typography-tabs"
      role="tablist"
      aria-label="Terminal typography controls"
    >
      {TYPOGRAPHY_SECTIONS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          className="terminal-typography-tabs__tab"
          role="tab"
          aria-selected={selected === value}
          onClick={() => onSelect(value)}
          data-testid={`terminal-typography-section-${value}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

interface ControlProps {
  settings: TypographySettings
  onPreview: (patch: Partial<TypographySettings>) => void
  onUpdate: (patch: Partial<TypographySettings>) => void
}

function CompactSlider({
  title,
  label,
  value,
  options,
  disabled,
  testId,
  onPreview,
  onCommit,
}: {
  title: string
  label: string
  value: number
  options: ReadonlyArray<{ value: number; label: string }>
  disabled?: boolean
  testId: string
  onPreview: (value: number) => void
  onCommit: (value: number) => void
}): ReactElement {
  const selected = options.reduce((closest, option) =>
    Math.abs(option.value - value) < Math.abs(closest.value - value)
      ? option
      : closest)
  return (
    <div
      className="terminal-typography-field"
      data-disabled={disabled ? 'true' : undefined}
    >
      <div className="terminal-typography-field__heading">
        <span className="terminal-typography-field__label">{title}</span>
        <output>{selected.label}</output>
      </div>
      <div className="terminal-typography-field__slider">
        <Slider
          label={label}
          value={value}
          options={options}
          disabled={disabled}
          showLabels={false}
          showDetents={false}
          directionalSnap
          onChange={onPreview}
          onCommit={onCommit}
          testId={testId}
        />
      </div>
    </div>
  )
}

const AXIS_LABELS: Record<string, string> = {
  GRAD: 'Grade',
  WONK: 'Wonky',
  ital: 'Italic',
  opsz: 'Optical size axis',
  slnt: 'Slant',
  wdth: 'Width',
}

function axisStep(axis: TerminalFontAxis): number {
  const range = axis.maximum - axis.minimum
  if (range <= 1) return 0.01
  if (range <= 20) return 0.1
  if (range <= 200) return 1
  return 5
}

function AxisControl({
  axis,
  settings,
  onPreview,
  onUpdate,
}: ControlProps & { axis: TerminalFontAxis }): ReactElement {
  const step = axisStep(axis)
  const value = settings.fontVariations[axis.tag] ?? axis.default
  const options = numericOptions(
    axis.minimum,
    axis.maximum,
    step,
    (next) => Number(next.toFixed(4)).toString(),
  )
  const patch = (next: number): Partial<TypographySettings> => ({
    fontVariations: {
      ...settings.fontVariations,
      [axis.tag]: next,
    },
  })
  return (
    <CompactSlider
      title={AXIS_LABELS[axis.tag] ?? axis.tag}
      label={`${AXIS_LABELS[axis.tag] ?? axis.tag} font axis`}
      value={value}
      options={options}
      testId={`terminal-font-axis-${axis.tag}`}
      onPreview={(next) => onPreview(patch(next))}
      onCommit={(next) => onUpdate(patch(next))}
    />
  )
}

export function TerminalTypographyControls({
  settings,
  catalog,
  fontOptions,
  onPreview,
  onUpdate,
}: ControlProps & {
  catalog: TerminalFontCatalog | null
  fontOptions: Array<{ value: string; label: string }>
}): ReactElement {
  const [section, setSection] = useState<TypographySection>('font')
  const axes = (catalog?.status === 'available'
    ? catalog.fontAxes?.[settings.fontFamily] ?? []
    : []).filter(({ tag }) => tag !== 'wght')
  const featureEnabled = (tag: string): boolean =>
    settings.fontFeatures?.[tag]
      ?? ((tag === 'liga' || tag === 'calt') && settings.ligatures)
  const updateFeature = (tag: string, enabled: boolean): void => {
    const fontFeatures = {
      ...settings.fontFeatures,
      [tag]: enabled,
    }
    const ligatures = ['liga', 'calt', 'dlig'].some((feature) =>
      fontFeatures[feature] ?? (
        (feature === 'liga' || feature === 'calt') && settings.ligatures
      ))
    onUpdate({ fontFeatures, ligatures })
  }
  return (
    <div className="terminal-typography-controls">
      <SectionTabs selected={section} onSelect={setSection} />
      <div className="terminal-typography-group">
        <div
          className={`terminal-typography-group__fields terminal-typography-group__fields--${section}`}
        >
          {section === 'font' ? (
            <TerminalTypographyBasics
              {...{ settings, catalog, fontOptions, onUpdate }}
            >
              {axes.length > 0 ? (
                <div className="terminal-typography-axes">
                  <div className="terminal-typography-group__title">
                    <h5>Font-specific axes</h5>
                    <span>{settings.fontFamily}</span>
                  </div>
                  <div className="terminal-typography-group__fields">
                    {axes.map((axis) => (
                      <AxisControl
                        key={axis.tag}
                        {...{ axis, settings, onPreview, onUpdate }}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </TerminalTypographyBasics>
          ) : null}
          {section === 'spacing' ? (
            <>
              <CompactSlider
                title="Baseline"
                label="Terminal baseline"
                value={settings.baseline}
                options={BASELINE}
                testId="terminal-baseline"
                onPreview={(baseline) => onPreview({ baseline })}
                onCommit={(baseline) => onUpdate({ baseline })}
              />
            </>
          ) : null}
          {section === 'rendering' ? (
            <CompactSlider
              title="Thicken"
              label="Terminal thicken strength"
              value={settings.thicken ? settings.thickenStrength : 0}
              options={STRENGTH}
              testId="terminal-thicken-strength"
              onPreview={(thickenStrength) => onPreview({
                thicken: thickenStrength > 0,
                thickenStrength,
              })}
              onCommit={(thickenStrength) => onUpdate({
                thicken: thickenStrength > 0,
                thickenStrength,
              })}
            />
          ) : null}
          {section === 'features' ? (
            <div className="terminal-typography-features">
              {FONT_FEATURES.map(({ tag, label, description }) => (
                <label key={tag}>
                  <span>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                  <Switch
                    label={`${label} (${tag})`}
                    displayLabel={null}
                    checked={featureEnabled(tag)}
                    onChange={(enabled) => updateFeature(tag, enabled)}
                    testId={`terminal-font-feature-${tag}`}
                  />
                </label>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {catalog?.status === 'unavailable' ? (
        <p className="terminal-typography-controls__note">{catalog.message}</p>
      ) : null}
      {catalog?.status === 'available' && catalog.fontAxesMessage !== undefined ? (
        <p className="terminal-typography-controls__note">
          {catalog.fontAxesMessage}
        </p>
      ) : null}
    </div>
  )
}

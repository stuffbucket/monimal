import { Slider, Switch } from '@maximal/maximal-design-system'
import { useState, type ReactElement } from 'react'

import type {
  TerminalFontAxis,
  TerminalFontCatalog,
  TerminalTypographySettings as TypographySettings,
} from '../capabilities'
import { TerminalTypographyBasics } from './TerminalTypographyBasics'

/** A bounded numeric range and how the design-system slider displays its value. */
interface SliderRange {
  min: number
  max: number
  step: number
  format?: Intl.NumberFormatOptions
}

const BASELINE: SliderRange = {
  min: -20,
  max: 20,
  step: 0.1,
  format: { maximumFractionDigits: 1, signDisplay: 'exceptZero' },
}
const STRENGTH: SliderRange = { min: 0, max: 100, step: 1 }
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
  value,
  range,
  disabled,
  testId,
  onPreview,
  onCommit,
}: {
  title: string
  value: number
  range: SliderRange
  disabled?: boolean
  testId: string
  onPreview: (value: number) => void
  onCommit: (value: number) => void
}): ReactElement {
  return (
    <div
      className="terminal-typography-field"
      data-disabled={disabled ? 'true' : undefined}
    >
      <Slider
        label={title}
        value={value}
        min={range.min}
        max={range.max}
        step={range.step}
        format={range.format}
        disabled={disabled}
        data-testid={testId}
        onValueChange={onPreview}
        onValueCommitted={onCommit}
      />
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
  const value = settings.fontVariations[axis.tag] ?? axis.default
  const range = { min: axis.minimum, max: axis.maximum, step: axisStep(axis) }
  const patch = (next: number): Partial<TypographySettings> => ({
    fontVariations: {
      ...settings.fontVariations,
      [axis.tag]: next,
    },
  })
  return (
    <CompactSlider
      title={AXIS_LABELS[axis.tag] ?? axis.tag}
      value={value}
      range={range}
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
                value={settings.baseline}
                range={BASELINE}
                testId="terminal-baseline"
                onPreview={(baseline) => onPreview({ baseline })}
                onCommit={(baseline) => onUpdate({ baseline })}
              />
            </>
          ) : null}
          {section === 'rendering' ? (
            <CompactSlider
              title="Thicken"
              value={settings.thicken ? settings.thickenStrength : 0}
              range={STRENGTH}
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
                    aria-label={`${label} (${tag})`}
                    label={null}
                    checked={featureEnabled(tag)}
                    onCheckedChange={(enabled) => updateFeature(tag, enabled)}
                    data-testid={`terminal-font-feature-${tag}`}
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

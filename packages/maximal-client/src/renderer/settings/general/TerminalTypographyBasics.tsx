import {
  NumberInput,
  Select,
} from '@maximal/maximal-electron/renderer'
import { type ReactElement } from 'react'

import type {
  TerminalFontCatalog,
  TerminalTypographySettings as TypographySettings,
} from '../capabilities'

const WEIGHT_NAMES = new Map([
  [100, 'Thin'],
  [200, 'Extra Light'],
  [300, 'Light'],
  [400, 'Regular'],
  [500, 'Medium'],
  [600, 'Semibold'],
  [700, 'Bold'],
  [800, 'Extra Bold'],
  [900, 'Black'],
])

function supportedWeights(
  catalog: TerminalFontCatalog | null,
  family: string,
): number[] {
  if (catalog?.status !== 'available') return [400]
  const weights = catalog.fontWeights?.[family]
  return weights && weights.length > 0
    ? [...new Set(weights)].sort((left, right) => left - right)
    : [400]
}

function nearestWeight(value: number, weights: number[]): number {
  return weights.reduce((nearest, weight) =>
    Math.abs(weight - value) < Math.abs(nearest - value) ? weight : nearest)
}

function EditableValue({
  title,
  label,
  value,
  minimum,
  maximum,
  step,
  suffix,
  testId,
  onCommit,
}: {
  title: string
  label: string
  value: number
  minimum: number
  maximum: number
  step: number
  suffix?: string
  testId: string
  onCommit: (value: number) => void
}): ReactElement {
  return (
    <label className="terminal-typography-basic-field">
      <span>{title}</span>
      <span className="terminal-typography-basic-field__value">
        <NumberInput
          aria-label={label}
          value={value}
          min={minimum}
          max={maximum}
          step={step}
          onCommit={onCommit}
          testId={testId}
        />
        {suffix ? <span aria-hidden="true">{suffix}</span> : null}
      </span>
    </label>
  )
}

export function TerminalTypographyBasics({
  settings,
  catalog,
  fontOptions,
  onUpdate,
}: {
  settings: TypographySettings
  catalog: TerminalFontCatalog | null
  fontOptions: Array<{ value: string; label: string }>
  onUpdate: (patch: Partial<TypographySettings>) => void
}): ReactElement {
  const weights = supportedWeights(catalog, settings.fontFamily)
  const selectedWeight = nearestWeight(settings.fontWeight, weights)
  return (
    <div className="terminal-typography-basics">
      <label className="terminal-typography-field terminal-typography-field--family">
        <span className="terminal-typography-field__label">Family</span>
        <Select
          aria-label="Terminal font family"
          value={settings.fontFamily}
          options={fontOptions}
          onChange={(fontFamily) => {
            const nextWeights = supportedWeights(catalog, fontFamily)
            onUpdate({
              fontFamily,
              fontWeight: nearestWeight(settings.fontWeight, nextWeights),
              fontVariations: {},
            })
          }}
          testId="terminal-font-family"
        />
      </label>
      <label className="terminal-typography-basic-field">
        <span>Style</span>
        <Select
          aria-label="Terminal font style"
          value={String(selectedWeight)}
          options={weights.map((weight) => ({
            value: String(weight),
            label: WEIGHT_NAMES.get(weight) ?? String(weight),
          }))}
          onChange={(fontWeight) => onUpdate({ fontWeight: Number(fontWeight) })}
          testId="terminal-font-style"
        />
      </label>
      <EditableValue
        title="Weight"
        label="Terminal font weight"
        value={settings.fontWeight}
        minimum={50}
        maximum={1000}
        step={25}
        testId="terminal-font-weight"
        onCommit={(fontWeight) => onUpdate({ fontWeight })}
      />
      <EditableValue
        title="Optical size"
        label="Terminal optical font size in points"
        value={settings.fontSize}
        minimum={1}
        maximum={255}
        step={0.25}
        suffix="pt"
        testId="terminal-font-size"
        onCommit={(fontSize) => onUpdate({ fontSize })}
      />
      <EditableValue
        title="Line height"
        label="Terminal leading"
        value={settings.cellHeight}
        minimum={-50}
        maximum={100}
        step={0.1}
        suffix="%"
        testId="terminal-cell-height"
        onCommit={(cellHeight) => onUpdate({ cellHeight })}
      />
      <EditableValue
        title="Letter spacing"
        label="Terminal tracking"
        value={settings.tracking}
        minimum={-20}
        maximum={50}
        step={0.1}
        suffix="%"
        testId="terminal-tracking"
        onCommit={(tracking) => onUpdate({ tracking })}
      />
    </div>
  )
}

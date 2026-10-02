import {
  TypefaceControls,
  type MeasurementUnit,
  type TypefaceMetric,
} from '@maximal/maximal-electron/renderer'
import { type ReactElement, type ReactNode } from 'react'

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
const PIXELS_PER_POINT = 4 / 3

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

function fontSizeUnits(): MeasurementUnit<'pt' | 'px'>[] {
  return [
    {
      value: 'pt',
      label: 'pt',
      step: 0.25,
      fromCanonical: (value) => value,
      toCanonical: (value) => value,
    },
    {
      value: 'px',
      label: 'px',
      step: 0.25,
      fromCanonical: (value) => value * PIXELS_PER_POINT,
      toCanonical: (value) => value / PIXELS_PER_POINT,
    },
  ]
}

function lineHeightUnits(
  fontSize: number,
): MeasurementUnit<'percent' | 'em' | 'pt' | 'px'>[] {
  return [
    {
      value: 'percent',
      label: '%',
      aliases: ['percent'],
      step: 1,
      fromCanonical: (value) => 100 + value,
      toCanonical: (value) => value - 100,
    },
    {
      value: 'em',
      label: 'em',
      step: 0.01,
      fromCanonical: (value) => 1 + (value / 100),
      toCanonical: (value) => (value - 1) * 100,
    },
    {
      value: 'pt',
      label: 'pt',
      step: 0.25,
      fromCanonical: (value) => fontSize * (1 + (value / 100)),
      toCanonical: (value) => ((value / fontSize) - 1) * 100,
    },
    {
      value: 'px',
      label: 'px',
      step: 0.25,
      fromCanonical: (value) =>
        fontSize * PIXELS_PER_POINT * (1 + (value / 100)),
      toCanonical: (value) =>
        ((value / (fontSize * PIXELS_PER_POINT)) - 1) * 100,
    },
  ]
}

function letterSpacingUnits(
  fontSize: number,
): MeasurementUnit<'percent' | 'em' | 'pt' | 'px'>[] {
  return [
    {
      value: 'percent',
      label: '%',
      aliases: ['percent'],
      step: 0.1,
      fromCanonical: (value) => value,
      toCanonical: (value) => value,
    },
    {
      value: 'em',
      label: 'em',
      step: 0.001,
      fromCanonical: (value) => value / 100,
      toCanonical: (value) => value * 100,
    },
    {
      value: 'pt',
      label: 'pt',
      step: 0.05,
      fromCanonical: (value) => fontSize * value / 100,
      toCanonical: (value) => value / fontSize * 100,
    },
    {
      value: 'px',
      label: 'px',
      step: 0.05,
      fromCanonical: (value) => fontSize * PIXELS_PER_POINT * value / 100,
      toCanonical: (value) => value / (fontSize * PIXELS_PER_POINT) * 100,
    },
  ]
}

export function TerminalTypographyBasics({
  settings,
  catalog,
  fontOptions,
  children,
  onUpdate,
}: {
  settings: TypographySettings
  catalog: TerminalFontCatalog | null
  fontOptions: Array<{ value: string; label: string }>
  children?: ReactNode
  onUpdate: (patch: Partial<TypographySettings>) => void
}): ReactElement {
  const weights = supportedWeights(catalog, settings.fontFamily)
  const selectedWeight = nearestWeight(settings.fontWeight, weights)
  const metrics: TypefaceMetric[] = [
    {
      id: 'terminal-font-size-control',
      label: 'Optical size',
      value: settings.fontSize,
      units: fontSizeUnits(),
      defaultUnit: 'pt',
      minimum: 1,
      maximum: 255,
      canonicalStep: 0.25,
      storageKey: 'maximal.typeface.terminal.optical-size',
      testId: 'terminal-font-size',
      onCommit: (fontSize) => onUpdate({ fontSize }),
    },
    {
      id: 'terminal-line-height-control',
      label: 'Line height',
      value: settings.cellHeight,
      units: lineHeightUnits(settings.fontSize),
      defaultUnit: 'percent',
      minimum: -50,
      maximum: 100,
      canonicalStep: 0.1,
      autoValue: 0,
      storageKey: 'maximal.typeface.terminal.line-height',
      testId: 'terminal-cell-height',
      onCommit: (cellHeight) => onUpdate({ cellHeight }),
    },
    {
      id: 'terminal-letter-spacing-control',
      label: 'Letter spacing',
      value: settings.tracking,
      units: letterSpacingUnits(settings.fontSize),
      defaultUnit: 'percent',
      minimum: -20,
      maximum: 50,
      canonicalStep: 0.1,
      autoValue: 0,
      storageKey: 'maximal.typeface.terminal.letter-spacing',
      testId: 'terminal-tracking',
      onCommit: (tracking) => onUpdate({ tracking }),
    },
  ]
  return (
    <TypefaceControls
      family={{
        label: 'Family',
        ariaLabel: 'Terminal font family',
        value: settings.fontFamily,
        options: fontOptions,
        testId: 'terminal-font-family',
        onChange: (fontFamily) => {
          const nextWeights = supportedWeights(catalog, fontFamily)
          onUpdate({
            fontFamily,
            fontWeight: nearestWeight(settings.fontWeight, nextWeights),
            fontVariations: {},
          })
        },
      }}
      style={{
        label: 'Style',
        ariaLabel: 'Terminal font style',
        value: String(selectedWeight),
        options: weights.map((weight) => ({
          value: String(weight),
          label: WEIGHT_NAMES.get(weight) ?? String(weight),
        })),
        testId: 'terminal-font-style',
        onChange: (fontWeight) => onUpdate({ fontWeight: Number(fontWeight) }),
      }}
      weight={{
        ariaLabel: 'Terminal font weight',
        value: settings.fontWeight,
        minimum: 50,
        maximum: 1000,
        step: 25,
        testId: 'terminal-font-weight',
        onCommit: (fontWeight) => onUpdate({ fontWeight }),
      }}
      metrics={metrics}
    >
      {children}
    </TypefaceControls>
  )
}

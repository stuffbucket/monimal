import type { CSSProperties, ReactElement, ReactNode } from 'react'

import { ColorStyleIcon } from './ColorStyleIcon'
import { wcagContrast } from './oklab'
import { paletteTokens, resolvePaletteToken, type PaletteSeeds, type PaletteTokens } from './palette'
import type { ColorMode } from './ramps'

/*
 * The reference sheet layout shared by the colour stories. Values are read
 * from `paletteTokens` rather than the cascade, so both modes render side by
 * side whatever the toolbar theme is.
 */

export const MODES = ['light', 'dark'] as const
/* Built rather than written out, so the token inventory does not read the story as a reference. */
export function tokenName(ramp: string, step: number): `--${string}` {
  return `--${['maximal', 'color', ramp, String(step)].join('-')}`
}

export function value(tokens: PaletteTokens, ramp: string, step: number): string {
  return resolvePaletteToken(tokens, tokenName(ramp, step))
}

export interface Chrome {
  panel: string
  pill: string
  border: string
  heading: string
  label: string
  muted: string
}

/*
 * The reference sheets: white in light mode and dark grey 800 in dark mode,
 * with pills the colour of the panel. The label is the first pink step that
 * reads at 4.5:1 on the pill.
 */
export function chrome(tokens: PaletteTokens, mode: ColorMode): Chrome {
  const panel = mode === 'light' ? value(tokens, 'white', 1000) : value(tokens, 'grey', 800)
  const pill = panel
  const order = mode === 'light' ? [500, 600, 700, 800, 900] : [500, 400, 300, 200, 100]
  const label = order
    .map((step) => value(tokens, 'pink', step))
    .find((color) => wcagContrast(color, pill) >= 4.5) ?? value(tokens, 'pink', 500)
  return {
    panel,
    pill,
    border: value(tokens, 'grey', mode === 'light' ? 200 : 700),
    heading: value(tokens, 'grey', mode === 'light' ? 600 : 400),
    label,
    muted: value(tokens, 'grey', mode === 'light' ? 600 : 300),
  }
}

/* Steps are fixed squares, as in the reference sheet, so a narrow viewport wraps panels instead of squeezing ramps. */
export const SWATCH = 20
export const RAMP_PANEL_WIDTH = 15 * 8 + (10 * SWATCH) + 70
export const THEME_PANEL_WIDTH = 480

export function ModePanel({
  mode,
  tokens,
  width,
  edge,
  children,
}: {
  mode: ColorMode
  tokens: PaletteTokens
  width: number
  edge: string
  children: (colors: Chrome) => ReactNode
}): ReactElement {
  const colors = chrome(tokens, mode)
  return (
    <section aria-label={`${mode} mode`} style={{ boxSizing: 'border-box', width, alignSelf: 'stretch', background: colors.panel, border: `1px solid ${edge}`, padding: '16px 20px 24px' }}>
      <h3
        style={{
          margin: '0 0 20px',
          font: '500 13px/1 system-ui, sans-serif',
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
          color: colors.heading,
        }}
      >
        {mode} mode
      </h3>
      {children(colors)}
    </section>
  )
}

/* A colour style as the reference sheets draw it: drop, `$name`, and swatch. */
export function StylePill({ name, color, colors }: { name: string; color: string; colors: Chrome }): ReactElement {
  return (
    <li
      title={color}
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'center',
        gap: 10,
        padding: '9px 10px 9px 12px',
        border: `1px solid ${colors.border}`,
        borderRadius: 2,
        background: colors.pill,
      }}
    >
      <ColorStyleIcon color={colors.muted} />
      <span style={{ font: '15px/1 ui-monospace, SFMono-Regular, Menlo, monospace', whiteSpace: 'nowrap' }}>
        <span style={{ color: colors.muted }}>$</span>
        <span style={{ color: colors.label }}>{name}</span>
      </span>
      <span
        aria-label={color}
        style={{ width: 24, height: 24, boxSizing: 'border-box', border: `1px solid ${colors.border}`, background: color }}
      />
    </li>
  )
}

export const prose: CSSProperties = { margin: '0 0 12px', font: '14px/1.6 system-ui, sans-serif' }

export function RampSheet({
  title,
  seeds,
  panel,
  panelWidth = RAMP_PANEL_WIDTH,
  children,
}: {
  title: string
  seeds: PaletteSeeds
  panelWidth?: number
  panel: (mode: ColorMode, tokens: PaletteTokens, colors: Chrome) => ReactNode
  children: ReactNode
}): ReactElement {
  const tokens = paletteTokens(seeds)
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        gap: 40,
        minHeight: '100vh',
        boxSizing: 'border-box',
        padding: 24,
        color: value(tokens.light, 'grey', 1000),
        background: value(tokens.light, 'white', 1000),
      }}
    >
      <div style={{ flex: '1 1 260px', maxWidth: 340 }}>
        <h2 style={{ margin: '0 0 12px', font: '400 20px/1.3 system-ui, sans-serif' }}>{title}</h2>
        {children}
      </div>
      <div
        style={{
          flex: `1 1 ${String(panelWidth)}px`,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
        }}
      >
        {MODES.map((mode) => (
          <ModePanel key={mode} mode={mode} tokens={tokens[mode]} width={panelWidth} edge={value(tokens.light, 'grey', 200)}>
            {(colors) => panel(mode, tokens[mode], colors)}
          </ModePanel>
        ))}
      </div>
    </div>
  )
}

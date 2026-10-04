import { useId, type ReactElement, type ReactNode } from 'react'

import { DEFAULT_APPEARANCE } from '../appearance'
import { RampSheet, StylePill, value, type Chrome } from './ColorSheet'
import { paletteTokens, resolvePaletteToken, type PaletteTokens } from './palette'
import type { ColorMode } from './ramps'

const PANEL_WIDTH = 440

/* Built rather than written out, so the token inventory does not read the story as a reference. */
export function semantic(tokens: PaletteTokens, name: string): string {
  return resolvePaletteToken(tokens, `--${['maximal', 'color', name].join('-')}`)
}

export interface Entry {
  name: string
  description: ReactNode
}

function Glossary({ entries }: { entries: readonly Entry[] }): ReactElement {
  return (
    <dl style={{ margin: '20px 0 0', font: '14px/1.6 system-ui, sans-serif' }}>
      {entries.map(({ name, description }) => (
        <div key={name} style={{ marginBottom: 16 }}>
          <dt style={{ fontWeight: 600 }}>{name}</dt>
          <dd style={{ margin: 0 }}>{description}</dd>
        </div>
      ))}
    </dl>
  )
}

export function ApplicationSheet({
  title,
  entries,
  sample,
  children,
}: {
  title: string
  entries: readonly Entry[]
  sample: (entry: Entry, tokens: PaletteTokens, colors: Chrome, mode: ColorMode) => ReactNode
  children: ReactNode
}): ReactElement {
  return (
    <RampSheet
      title={title}
      seeds={DEFAULT_APPEARANCE.colors}
      panelWidth={PANEL_WIDTH}
      panel={(mode, tokens, colors) => (
        <ul style={{ display: 'grid', gap: 28, margin: 0, padding: 0, listStyle: 'none' }}>
          {entries.map((entry) => (
            <li key={entry.name}>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                <StylePill name={entry.name} color={semantic(tokens, entry.name)} colors={colors} />
              </ul>
              {sample(entry, tokens, colors, mode)}
            </li>
          ))}
        </ul>
      )}
    >
      {children}
      <Glossary entries={entries} />
    </RampSheet>
  )
}

export const FILL_ROLES = ['brand', 'component', 'assistive', 'danger', 'warning', 'success'] as const
export type FillRole = (typeof FILL_ROLES)[number]

export type Canvas = 'light' | 'dark'

/* Light canvases draw from the light green ramp and dark canvases from its dark end, the same in both modes. */
const CANVAS_TOKENS = paletteTokens(DEFAULT_APPEARANCE.colors).light
const CANVAS_COLORS: Record<Canvas, { ground: string; leaves: readonly string[] }> = {
  light: {
    ground: value(CANVAS_TOKENS, 'pale-green', 100),
    leaves: [value(CANVAS_TOKENS, 'pale-green', 200), value(CANVAS_TOKENS, 'pale-green', 300)],
  },
  dark: {
    ground: value(CANVAS_TOKENS, 'green', 700),
    leaves: [value(CANVAS_TOKENS, 'green', 900), value(CANVAS_TOKENS, 'green', 800)],
  },
}

/* A split leaf in a 100 by 100 box, pointing down. */
const LEAF = 'M50 96C22 84 4 60 8 34C11 14 30 4 50 16C70 4 89 14 92 34C96 60 78 84 50 96Z'
const SPLITS = [0, 1, 2, 3].flatMap((index) => {
  const y = 30 + (index * 14)
  return [`M50 ${String(y + 6)}L6 ${String(y - 4)}`, `M50 ${String(y + 6)}L94 ${String(y - 4)}`]
})
const LEAVES = [
  { x: -10, y: -30, size: 120, turn: 150, tone: 0 },
  { x: 90, y: 20, size: 140, turn: 200, tone: 1 },
  { x: 230, y: -50, size: 130, turn: 120, tone: 0 },
  { x: 300, y: 30, size: 110, turn: 230, tone: 1 },
  { x: 160, y: -60, size: 90, turn: 170, tone: 1 },
] as const

/* An original foliage pattern standing in for user content on a canvas. */
export function Foliage({ canvas }: { canvas: Canvas }): ReactElement {
  const mask = useId()
  const { ground, leaves } = CANVAS_COLORS[canvas]
  return (
    <svg
      viewBox="0 0 400 120"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    >
      <mask id={mask} maskContentUnits="userSpaceOnUse">
        <rect x={0} y={0} width={100} height={100} fill="black" />
        <path d={LEAF} fill="white" />
        <path d={[...SPLITS, 'M50 18L50 94'].join('')} stroke="black" strokeWidth={3.5} />
      </mask>
      <rect width={400} height={120} fill={ground} />
      {LEAVES.map(({ x, y, size, turn, tone }) => (
        <g key={`${String(x)}-${String(y)}`} transform={`translate(${String(x)} ${String(y)}) rotate(${String(turn)} ${String(size / 2)} ${String(size / 2)}) scale(${String(size / 100)})`}>
          <rect width={100} height={100} fill={leaves[tone]} mask={`url(#${mask})`} />
        </g>
      ))}
    </svg>
  )
}

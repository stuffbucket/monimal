import type { Meta, StoryObj } from '@maximal/maximal-storybook'
import type { ReactElement } from 'react'

import { DEFAULT_PALETTE_FIXTURE, PALETTE_FIXTURES } from './fixtures'
import {
  BRAND_CREAM_HEX,
  BRAND_CREAM_SOURCE_HEX,
  BRAND_HEX,
  BRAND_RAMP,
  BRAND_SOURCE_HEX,
  COLOR_HUES,
  COLOR_STEPS,
  resolvePaletteToken,
  type ColorMode,
  type PaletteTokens,
} from '@maximal/maximal-design-system/color'
import {
  RampSheet,
  StylePill,
  SWATCH,
  THEME_PANEL_WIDTH,
  prose,
  value,
  type Chrome,
} from '@maximal/maximal-design-system/color/tools'


const FULL_RAMPS = ['white', 'black', 'cream', 'grey', ...COLOR_HUES, BRAND_RAMP] as const
const PALE_RAMPS = COLOR_HUES.map((hue) => `pale-${hue}`)

/* Alpha steps are shown over the colour they are drawn against: white over black, black over white, cream over crimson. */
function backing(ramp: string, tokens: PaletteTokens): string | undefined {
  if (ramp === 'white') return value(tokens, 'black', 1000)
  if (ramp === 'black') return value(tokens, 'white', 1000)
  if (ramp === 'cream') return value(tokens, BRAND_RAMP, 500)
  return undefined
}

function RampRow({ ramp, tokens, colors }: { ramp: string; tokens: PaletteTokens; colors: Chrome }): ReactElement {
  const behind = backing(ramp, tokens)
  const label = ramp.replace(/^pale-/, 'pale ')
  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: '15ch auto',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
        padding: '6px 6px 6px 8px',
        border: `1px solid ${colors.border}`,
        borderRadius: 2,
        background: colors.pill,
      }}
    >
      <span
        style={{
          font: '13px/1 ui-monospace, SFMono-Regular, Menlo, monospace',
          color: colors.label,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      <ol aria-label={`${label} ramp`} style={{ display: 'flex', margin: 0, padding: 0, listStyle: 'none', background: behind }}>
        {COLOR_STEPS.map((step) => {
          const color = value(tokens, ramp, step)
          return (
            <li
              key={step}
              title={`${ramp}-${String(step)}  ${color}`}
              aria-label={`${String(step)} ${color}`}
              style={{ width: SWATCH, height: SWATCH, background: color }}
            />
          )
        })}
      </ol>
    </li>
  )
}

function RampRows({ ramps, tokens, colors }: { ramps: readonly string[]; tokens: PaletteTokens; colors: Chrome }): ReactElement {
  return (
    <ul style={{ display: 'grid', gap: 10, margin: 0, padding: 0, listStyle: 'none' }}>
      {ramps.map((ramp) => <RampRow key={ramp} ramp={ramp} tokens={tokens} colors={colors} />)}
    </ul>
  )
}

/* One pill per step, ordered from the panel outward: 100 first on light, 1000 first on dark. */
function StepList({ ramp, tokens, colors, mode }: { ramp: string; tokens: PaletteTokens; colors: Chrome; mode: ColorMode }): ReactElement {
  const steps = mode === 'light' ? COLOR_STEPS : [...COLOR_STEPS].reverse()
  return (
    <ul aria-label={`${ramp} ramp`} style={{ display: 'grid', gap: 12, margin: 0, padding: 0, listStyle: 'none' }}>
      {steps.map((step) => {
        const color = value(tokens, ramp, step)
        return (
          <StylePill key={step} name={`${ramp}-${String(step)}`} color={color} colors={colors} />
        )
      })}
    </ul>
  )
}

function ColorRamps(): ReactElement {
  return (
    <RampSheet
      title="Color ramps"
      seeds={DEFAULT_PALETTE_FIXTURE.colors}
      panel={(_mode, tokens, colors) => <RampRows ramps={FULL_RAMPS} tokens={tokens} colors={colors} />}
    >
      <p style={prose}>
        Each ramp has ten steps from 100 to 1000, lightest to darkest in both modes. Step 500 is the
        anchor; the other steps are calculated from it in OKLCH with a profile per hue and per mode, so
        equal steps look equally far apart.
      </p>
      <p style={prose}>
        <strong>Use semantic colours.</strong> Surfaces read names such as bg-default or text-secondary,
        which the palette aliases to a step here. Atomic steps are for the palette, not for components.
      </p>
      <p style={prose}>
        <strong>Neutrals.</strong> white, black and cream are alpha ramps of #FFFFFF, #000000 and{' '}
        {BRAND_CREAM_HEX.toUpperCase()}, shown over the colour they are drawn against; grey is opaque.
      </p>
      <p style={prose}>
        <strong>Hues.</strong> {COLOR_HUES.join(', ')}.
      </p>
      <p style={prose}>
        <strong>Brand.</strong> {BRAND_RAMP} is the Maximal brand colour. The published {BRAND_SOURCE_HEX.toUpperCase()} is
        refined to {BRAND_HEX.toUpperCase()} at the same lightness and hue with more chroma, which removes the grey cast.
        Brand marks and text on it are cream: the published {BRAND_CREAM_SOURCE_HEX.toUpperCase()} reads as white on the
        refined crimson, so its chroma rises by the same factor, to {BRAND_CREAM_HEX.toUpperCase()}.
      </p>
    </RampSheet>
  )
}

function PaleColors(): ReactElement {
  return (
    <RampSheet
      title="Pale colors"
      seeds={DEFAULT_PALETTE_FIXTURE.colors}
      panel={(_mode, tokens, colors) => <RampRows ramps={PALE_RAMPS} tokens={tokens} colors={colors} />}
    >
      <p style={prose}>
        Pale ramps carry the same hues at lower chroma, for backgrounds and accents that should sit back.
        They are the same in both modes.
      </p>
      <p style={prose}>
        The reference set has no pale orange; it applies a pale profile interpolated by hue between its
        neighbours, red and yellow, to the orange anchor.
      </p>
    </RampSheet>
  )
}

const THEME_RAMPS = ['neutral', 'brand'] as const
const THEME_IDS = PALETTE_FIXTURES.map((theme) => theme.id)

function ThemeRamps({ themeId }: { themeId: string }): ReactElement {
  const theme = PALETTE_FIXTURES.find((candidate) => candidate.id === themeId) ?? DEFAULT_PALETTE_FIXTURE
  return (
    <RampSheet
      title={`Theme ramps: ${theme.name}`}
      seeds={theme.colors}
      panelWidth={THEME_PANEL_WIDTH}
      panel={(mode, tokens, colors) => (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 }}>
          {THEME_RAMPS.map((ramp) => <StepList key={ramp} ramp={ramp} mode={mode} tokens={tokens} colors={colors} />)}
        </div>
      )}
    >
      <p style={prose}>
        Each theme adds two ramps. neutral runs from the theme background to its text, spaced like the
        grey ramp; brand keeps the theme accent exactly at 500 and reaches the reference lightness at
        100 and 1000, so every step stays visible on both panels.
      </p>
      <p style={prose}>Steps run from the panel outward: 100 first in light mode, 1000 first in dark mode.</p>
      <p style={prose}>Choose a theme in the controls panel.</p>
    </RampSheet>
  )
}

const ROLE_TYPES = ['bg', 'text', 'icon', 'border'] as const
type RoleType = (typeof ROLE_TYPES)[number]

const ROLES = [
  ['brand', 'Maximal crimson, for the primary action and brand moments. Themes replace it with their accent.'],
  ['selected', 'Selection and focus: selected rows, canvas selection, and focus rings.'],
  ['disabled', 'Controls that cannot be used yet.'],
  ['component', 'Reusable parts: components, instances, and shared tools.'],
  ['assistive', 'Where Maximal or an agent assists: suggestions, generated content, and agent activity.'],
  ['danger', 'Errors and destructive actions.'],
  ['measure', 'Canvas guides, measurements, and spacing annotations.'],
  ['warning', 'Cautions that need attention but do not block.'],
  ['success', 'Completed work and passing checks.'],
  ['info', 'Neutral notices and help.'],
  ['inverse', 'Contrasting surfaces such as tooltips and toasts.'],
] as const

function roleToken(type: RoleType, role: string): `--${string}` {
  return `--${['maximal', 'color', type, role].join('-')}`
}

function ColorRoles({ type }: { type: RoleType }): ReactElement {
  return (
    <RampSheet
      title="Color roles"
      seeds={DEFAULT_PALETTE_FIXTURE.colors}
      panelWidth={THEME_PANEL_WIDTH}
      panel={(_mode, tokens, colors) => (
        <ul style={{ display: 'grid', gap: 16, margin: 0, padding: 0, listStyle: 'none' }}>
          {ROLES.map(([role, description]) => (
            <li key={role} style={{ display: 'grid', gridTemplateColumns: '1fr 220px', alignItems: 'center', gap: 16 }}>
              <div style={{ font: '13px/1.4 system-ui, sans-serif', color: colors.muted }}>
                <strong style={{ display: 'block', color: colors.heading }}>-{role}</strong>
                {description}
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                <StylePill name={`${type}-${role}`} color={resolvePaletteToken(tokens, roleToken(type, role))} colors={colors} />
              </ul>
            </li>
          ))}
        </ul>
      )}
    >
      <p style={prose}>
        Roles give a hue one meaning across the app. Each role is a modifier that applies to every colour
        type: text-danger, bg-danger, icon-danger, and border-danger.
      </p>
      <p style={prose}>
        <strong>Fills.</strong> bg-role is the vivid 500 fill; bg-onrole, text-onrole, and icon-onrole
        are white or black, whichever contrasts more with it; brand content is cream wherever cream reads at
        4.5:1, and the Maximal theme pins icon-onbrand to cream in both modes. selected is brand 200 and
        info blue 200 in both modes, with text-onselected and text-oninfo on them; disabled is translucent
        white in dark mode.
      </p>
      <p style={prose}>
        <strong>Foregrounds.</strong> text-role reads at 4.5:1 and icon-role and border-role at 3:1 on
        every surface and on the role's secondary fill.
      </p>
      <p style={prose}>Choose a type in the controls panel.</p>
    </RampSheet>
  )
}

const meta = {
  title: 'Foundations/Color ramps',
  component: ColorRamps,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ColorRamps>

export default meta

type Story = StoryObj<typeof meta>

export const Ramps: Story = {}

export const Pale: Story = {
  render: () => <PaleColors />,
}

export const Theme: StoryObj<typeof ThemeRamps> = {
  args: { themeId: DEFAULT_PALETTE_FIXTURE.id },
  argTypes: { themeId: { control: 'select', options: THEME_IDS } },
  render: (args) => <ThemeRamps {...args} />,
}

export const Roles: StoryObj<typeof ColorRoles> = {
  args: { type: 'bg' },
  argTypes: { type: { control: 'inline-radio', options: ROLE_TYPES } },
  render: (args) => <ColorRoles {...args} />,
}

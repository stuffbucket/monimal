import type { Meta, StoryObj } from '@maximal/maximal-storybook'
import type { CSSProperties, ReactElement, ReactNode } from 'react'

import { ApplicationSheet, semantic, type Entry } from './ColorApplications'
import { prose } from './ColorSheet'
import type { PaletteTokens } from './palette'

const SAMPLE_HEIGHT = 84
const label: CSSProperties = { font: '300 24px/1 system-ui, sans-serif' }
const strip: CSSProperties = { display: 'flex', alignItems: 'center', flex: 1, padding: '0 12px', font: '13px/1 ui-monospace, monospace' }

/* An "Aa" tile on `fill` in `text`, optionally followed by labelled strips of the fill's states. */
function Tile({
  tokens,
  fill,
  text,
  states = [],
  border = false,
}: {
  tokens: PaletteTokens
  fill: string
  text: string
  states?: readonly { suffix: string; fill: string; text: string }[]
  border?: boolean
}): ReactElement {
  return (
    <div style={{ display: 'flex', height: SAMPLE_HEIGHT, marginTop: 10 }}>
      <div
        style={{
          ...label,
          display: 'grid',
          placeItems: 'center',
          width: SAMPLE_HEIGHT,
          color: semantic(tokens, text),
          background: semantic(tokens, fill),
          boxShadow: border ? `inset 0 0 0 1px ${semantic(tokens, 'border-default')}` : undefined,
        }}
      >
        Aa
      </div>
      {states.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          {states.map((state) => (
            <span key={state.suffix} style={{ ...strip, color: semantic(tokens, state.text), background: semantic(tokens, state.fill) }}>
              {state.suffix}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

type Sample = (tokens: PaletteTokens) => ReactNode

function BackgroundSheet({
  title,
  entries,
  children,
}: {
  title: string
  entries: readonly (Entry & { sample: Sample })[]
  children: ReactNode
}): ReactElement {
  return (
    <ApplicationSheet
      title={title}
      entries={entries}
      sample={(entry, tokens) => entries.find((candidate) => candidate.name === entry.name)?.sample(tokens)}
    >
      {children}
    </ApplicationSheet>
  )
}

const HIERARCHY = [
  { name: 'bg-default', description: 'The window chrome and side panels.' },
  { name: 'bg-secondary', description: 'The canvas: documents, terminals, and the spatial canvas.' },
  { name: 'bg-tertiary', description: 'Floating surfaces, such as menus, tooltips, and popovers, and containers within a secondary background.' },
].map((entry) => ({ ...entry, sample: (tokens: PaletteTokens) => <Tile tokens={tokens} fill={entry.name} text="text-default" border /> }))

function Hierarchy(): ReactElement {
  return (
    <BackgroundSheet title="Creating hierarchy" entries={HIERARCHY}>
      <p style={prose}>Neutral backgrounds, from the theme&apos;s background toward its text.</p>
    </BackgroundSheet>
  )
}

const INTERACTION = [
  { name: 'bg-hover', text: 'text-default', description: 'A neutral fill behind icons and selectable elements under the pointer.' },
  {
    name: 'bg-selected',
    text: 'text-onselected',
    description: 'A light Maximal fill for selected elements, in both modes. Content on it uses text-onselected and icon-onselected.',
  },
  {
    name: 'bg-disabled',
    text: 'text-disabled',
    description: 'A fill for elements that cannot be used, such as a disabled button; translucent white in dark mode.',
  },
].map(({ text, ...entry }) => ({ ...entry, sample: (tokens: PaletteTokens) => <Tile tokens={tokens} fill={entry.name} text={text} border /> }))

function Interaction(): ReactElement {
  return (
    <BackgroundSheet title="Common interaction states" entries={INTERACTION}>
      <p style={prose}>Selection takes the theme&apos;s brand ramp at 200, with 300 on hover and 400 when pressed.</p>
    </BackgroundSheet>
  )
}

const HUE_ROLES = [
  ['brand', 'Maximal crimson for the primary button. A theme replaces it with its accent.'],
  ['component', 'Purple for components and reusable parts.'],
  ['danger', 'Red behind destructive buttons and error banners.'],
  ['warning', 'Yellow for warning banners.'],
  ['success', 'Green for confirmation banners and buttons.'],
  ['assistive', 'Pink for assistive UI.'],
] as const

const HUES = HUE_ROLES.map(([role, description]) => ({
  name: `bg-${role}`,
  description,
  sample: (tokens: PaletteTokens) => (
    <Tile
      tokens={tokens}
      fill={`bg-${role}`}
      text={`text-on${role}`}
      states={[
        { suffix: '-hover', fill: `bg-${role}-hover`, text: `text-on${role}` },
        { suffix: '-pressed', fill: `bg-${role}-pressed`, text: `text-on${role}` },
        { suffix: '-secondary', fill: `bg-${role}-secondary`, text: `text-${role}` },
      ]}
    />
  ),
}))

function Hues(): ReactElement {
  return (
    <BackgroundSheet title="Common hues" entries={HUES}>
      <p style={prose}>
        Each role has a vivid 500 fill with hover and pressed states, and a -secondary tint for containers
        that sit on top. Text and icons on the fill use the -on version of the role, such as
        text-ondanger.
      </p>
    </BackgroundSheet>
  )
}

const TERTIARY = HUE_ROLES.map(([role]) => ({
  name: `bg-${role}-tertiary`,
  description: `The faintest ${role} fill.`,
  sample: (tokens: PaletteTokens) => <Tile tokens={tokens} fill={`bg-${role}-tertiary`} text="text-default" />,
}))

function Tertiary(): ReactElement {
  return (
    <BackgroundSheet title="Tertiary backgrounds" entries={TERTIARY}>
      <p style={prose}>
        The faintest version of each hue, one step from the background. It works with the default text
        and icon colours.
      </p>
    </BackgroundSheet>
  )
}

const ELEMENTS = [
  ['toolbar', 'Toolbars, on the window chrome.'],
  ['menu', 'Menus, on the floating surface.'],
  ['tooltip', 'Tooltips, on the floating surface.'],
] as const

const SPECIAL = ELEMENTS.map(([element, description]) => ({
  name: `bg-${element}-default`,
  description: (
    <>
      {description} -hover is one neutral step further from the background; -selected is the Maximal
      brand fill, with text-onbrand and icon-onbrand on it.
    </>
  ),
  sample: (tokens: PaletteTokens) => (
    <Tile
      tokens={tokens}
      fill={`bg-${element}-default`}
      text="text-default"
      border
      states={[
        { suffix: '-hover', fill: `bg-${element}-hover`, text: 'text-default' },
        { suffix: '-selected', fill: `bg-${element}-selected`, text: 'text-onbrand' },
      ]}
    />
  ),
}))

function Special(): ReactElement {
  return (
    <BackgroundSheet title="Special UI elements" entries={SPECIAL}>
      <p style={prose}>Element backgrounds, for surfaces whose colours differ from the global ones.</p>
    </BackgroundSheet>
  )
}

const meta = {
  title: 'Foundations/Background colors',
  component: Hierarchy,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Hierarchy>

export default meta

type Story = StoryObj<typeof meta>

export const CreatingHierarchy: Story = { name: 'Creating hierarchy' }

export const InteractionStates: Story = {
  name: 'Interaction states',
  render: () => <Interaction />,
}

export const CommonHues: Story = {
  name: 'Common hues',
  render: () => <Hues />,
}

export const TertiaryBackgrounds: Story = {
  name: 'Tertiary backgrounds',
  render: () => <Tertiary />,
}

export const SpecialElements: Story = {
  name: 'Special UI elements',
  render: () => <Special />,
}

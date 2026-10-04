import type { Meta, StoryObj } from '@maximal/maximal-storybook'
import {
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Component,
  Diamond,
  Hash,
  House,
  Link,
  SlidersVertical,
  Sparkles,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'

import { HEAVY_STROKE_SIZE, lucideStroke } from '../shared/lucide-stroke'
import { ApplicationSheet, FILL_ROLES, Foliage, semantic, type Canvas, type Entry, type FillRole } from './ColorApplications'
import { prose } from './ColorSheet'
import type { PaletteTokens } from './palette'

/* Each sample draws the glyph small and at the heavy-stroke size, so the stroke switch is visible. */
const SIZES = [16, 24, HEAVY_STROKE_SIZE] as const

interface IconEntry extends Entry {
  icon: LucideIcon
}

function Glyphs({ icon: Icon, color }: { icon: LucideIcon; color: string }): ReactElement {
  return (
    <>
      {SIZES.map((size) => (
        <Icon key={size} color={color} aria-hidden="true" {...lucideStroke(size)} />
      ))}
    </>
  )
}

const row = { display: 'flex', alignItems: 'center', gap: 20, marginTop: 10 } as const

function IconSheet({
  title,
  entries,
  sample,
  children,
}: {
  title: string
  entries: readonly IconEntry[]
  sample?: (entry: IconEntry, tokens: PaletteTokens) => ReactNode
  children: ReactNode
}): ReactElement {
  return (
    <ApplicationSheet
      title={title}
      entries={entries}
      sample={(entry, tokens) => {
        const match = entries.find((candidate) => candidate.name === entry.name)
        if (match === undefined) return null
        return sample === undefined ? (
          <div style={row}>
            <Glyphs icon={match.icon} color={semantic(tokens, match.name)} />
          </div>
        ) : (
          sample(match, tokens)
        )
      }}
    >
      {children}
      <p style={prose}>
        Lucide glyphs draw a 1px stroke, and a 2px stroke at {HEAVY_STROKE_SIZE}px and larger, whatever their size.
      </p>
    </ApplicationSheet>
  )
}

const BASIC: readonly IconEntry[] = [
  { name: 'icon-default', icon: SlidersVertical, description: 'The default icon colour. It matches text-default.' },
  {
    name: 'icon-secondary',
    icon: ChevronRight,
    description: 'Icons on inactive elements that step back to create hierarchy. It matches text-secondary.',
  },
  {
    name: 'icon-tertiary',
    icon: ChevronDown,
    description: 'Carets and other quiet affordances. It matches text-tertiary, so it stays readable.',
  },
  {
    name: 'icon-disabled',
    icon: Diamond,
    description: 'Icons on a control that cannot be used. It is exempt from contrast minimums.',
  },
]

function BasicIcons(): ReactElement {
  return (
    <IconSheet title="Basic icon colors" entries={BASIC}>
      <p style={prose}>Neutral icons for everything that does not carry a role.</p>
    </IconSheet>
  )
}

const TINTED: readonly IconEntry[] = [
  { name: 'icon-brand', icon: Link, description: 'Maximal crimson, for links and brand moments. A theme replaces it with its accent.' },
  { name: 'icon-component', icon: Component, description: 'Purple icons for components, instances, and other reusable parts.' },
  { name: 'icon-danger', icon: TriangleAlert, description: 'Red icons that alert about an error.' },
  { name: 'icon-warning', icon: TriangleAlert, description: 'Icons that warn about a potential problem.' },
  { name: 'icon-success', icon: CircleCheck, description: 'Green icons for confirmation and approval.' },
  { name: 'icon-assistive', icon: Sparkles, description: 'Pink icons where Maximal or an agent is assisting.' },
]

function TintedIcons(): ReactElement {
  return (
    <IconSheet title="Tinted icon colors" entries={TINTED}>
      <p style={prose}>
        Role colours for icons. Each is the first step of its role&apos;s ramp that reaches 3:1, the
        minimum for graphics, on every surface and on the role&apos;s secondary fill.
      </p>
    </IconSheet>
  )
}

function IconsOnFill({ role }: { role: FillRole }): ReactElement {
  const entries: readonly IconEntry[] = [
    {
      name: `icon-on${role}`,
      icon: House,
      description: (
        <>
          Icons on a filled background, such as a primary button. Each fill role has its own on colour,
          white or black, whichever contrasts more with the fill. Brand icons are the Maximal cream
          wherever it reads at 4.5:1.
        </>
      ),
    },
  ]
  return (
    <IconSheet
      title="Icons against background colors"
      entries={entries}
      sample={({ icon: Icon, name }, tokens) => (
        <div style={row}>
          {SIZES.map((size) => (
            <span
              key={size}
              style={{ display: 'grid', placeItems: 'center', padding: size / 4, background: semantic(tokens, `bg-${role}`) }}
            >
              <Icon color={semantic(tokens, name)} aria-hidden="true" {...lucideStroke(size)} />
            </span>
          ))}
        </div>
      )}
    >
      <p style={prose}>
        Pair a fill with the icon of the same role: bg-{role} with icon-on{role}. Choose a role in the
        controls panel.
      </p>
    </IconSheet>
  )
}

const CANVAS_ENTRIES: readonly (IconEntry & { canvas: Canvas })[] = [
  { name: 'icon-onlightcanvas', icon: Hash, canvas: 'light', description: 'Icons over content lighter than 50% lightness.' },
  { name: 'icon-ondarkcanvas', icon: Hash, canvas: 'dark', description: 'Icons over content at or below 50% lightness.' },
]

function IconsOnCanvas(): ReactElement {
  return (
    <IconSheet
      title="Icons on a canvas or image"
      entries={CANVAS_ENTRIES}
      sample={({ icon, name }, tokens) => {
        const canvas = CANVAS_ENTRIES.find((candidate) => candidate.name === name)?.canvas ?? 'light'
        return (
          <div style={{ position: 'relative', display: 'grid', placeItems: 'center', height: 104, marginTop: 10, overflow: 'hidden' }}>
            <Foliage canvas={canvas} />
            <div style={{ ...row, position: 'relative', marginTop: 0 }}>
              <Glyphs icon={icon} color={semantic(tokens, name)} />
            </div>
          </div>
        )
      }}
    >
      <p style={prose}>
        Icons over user content, such as a marker on the spatial canvas or on a preview, cannot rely on
        the theme. These colours are the same in every theme and mode; choose by the lightness of the
        content underneath.
      </p>
    </IconSheet>
  )
}

const meta = {
  title: 'Foundations/Icon colors',
  component: BasicIcons,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof BasicIcons>

export default meta

type Story = StoryObj<typeof meta>

export const Basic: Story = {}

export const Tinted: Story = {
  render: () => <TintedIcons />,
}

export const OnFill: StoryObj<typeof IconsOnFill> = {
  name: 'On fill',
  args: { role: 'brand' },
  argTypes: { role: { control: 'select', options: FILL_ROLES } },
  render: (args) => <IconsOnFill {...args} />,
}

export const OnCanvas: Story = {
  name: 'On canvas',
  render: () => <IconsOnCanvas />,
}

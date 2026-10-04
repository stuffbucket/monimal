import type { Meta, StoryObj } from '@maximal/maximal-storybook'
import type { CSSProperties, ReactElement } from 'react'

import { ApplicationSheet, FILL_ROLES, Foliage, semantic, type Canvas, type Entry, type FillRole } from './ColorApplications'
import { prose } from './ColorSheet'
import type { PaletteTokens } from './palette'

const SAMPLE = 'The quick brown fox'
const sampleText: CSSProperties = { margin: '10px 0 0', font: '300 28px/1.2 system-ui, sans-serif', whiteSpace: 'nowrap' }

const BASIC: readonly Entry[] = [
  { name: 'text-default', description: 'The default text colour for most titles, tabs, and body text.' },
  {
    name: 'text-secondary',
    description: 'Inactive tabs, labels, timestamps, and other text that steps back to create hierarchy.',
  },
  {
    name: 'text-tertiary',
    description: 'Placeholder text, such as in a search field, and hierarchy below secondary. Maximal keeps it readable: at least 4.5:1 on every surface.',
  },
  {
    name: 'text-disabled',
    description: 'Text on a control that cannot be used. It is exempt from contrast minimums, so it never carries information on its own.',
  },
]

function BasicText(): ReactElement {
  return (
    <ApplicationSheet
      title="Basic text colors"
      entries={BASIC}
      sample={({ name }, tokens) => <p style={{ ...sampleText, color: semantic(tokens, name) }}>{SAMPLE}</p>}
    >
      <p style={prose}>Neutral text for everything that does not carry a role.</p>
    </ApplicationSheet>
  )
}

const TINTED: readonly Entry[] = [
  { name: 'text-brand', description: 'Maximal crimson, for links and brand moments. A theme replaces it with its accent.' },
  { name: 'text-component', description: 'Purple text for components, instances, and other reusable parts.' },
  { name: 'text-danger', description: 'Red text for errors and destructive actions.' },
  {
    name: 'text-warning',
    description: 'Warns about a potential problem. Yellow where it reads; orange on light surfaces, where no yellow step does.',
  },
  { name: 'text-success', description: 'Green text for confirmation and completed work.' },
  { name: 'text-assistive', description: 'Pink text where Maximal or an agent is assisting.' },
]

function TintedText(): ReactElement {
  return (
    <ApplicationSheet
      title="Tinted text colors"
      entries={TINTED}
      sample={({ name }, tokens) => <p style={{ ...sampleText, color: semantic(tokens, name) }}>{SAMPLE}</p>}
    >
      <p style={prose}>
        Role colours for text. Each is the first step of its role&apos;s ramp that reads at 4.5:1 on every
        surface and on the role&apos;s secondary fill.
      </p>
    </ApplicationSheet>
  )
}

function FillSample({ role, name, tokens }: { role: FillRole; name: string; tokens: PaletteTokens }): ReactElement {
  return (
    <div
      style={{
        display: 'grid',
        placeItems: 'center',
        height: 104,
        marginTop: 10,
        background: semantic(tokens, `bg-${role}`),
      }}
    >
      <span style={{ ...sampleText, margin: 0, color: semantic(tokens, name) }}>{SAMPLE}</span>
    </div>
  )
}

function TextOnFill({ role }: { role: FillRole }): ReactElement {
  const entries: readonly Entry[] = [
    {
      name: `text-on${role}`,
      description: (
        <>
          Text on a filled background, such as a primary button. Each fill role has its own on colour,
          white or black, whichever contrasts more with the fill, so text flips to black on a yellow
          warning fill. Brand text is the Maximal cream wherever it reads at 4.5:1.
        </>
      ),
    },
    { name: `text-on${role}-secondary`, description: 'The on colour at 80%, for supporting text on the fill.' },
    {
      name: `text-on${role}-tertiary`,
      description: 'The on colour faded further, for placeholders and hints. It is below the contrast minimum.',
    },
  ]
  return (
    <ApplicationSheet
      title="Text against background colors"
      entries={entries}
      sample={({ name }, tokens) => <FillSample role={role} name={name} tokens={tokens} />}
    >
      <p style={prose}>
        Pair a fill with the text of the same role: bg-{role} with text-on{role}. Choose a role in the
        controls panel.
      </p>
    </ApplicationSheet>
  )
}

function CanvasSample({ canvas, name, tokens }: { canvas: Canvas; name: string; tokens: PaletteTokens }): ReactElement {
  return (
    <div style={{ position: 'relative', display: 'grid', placeItems: 'center', height: 104, marginTop: 10, overflow: 'hidden' }}>
      <Foliage canvas={canvas} />
      <span style={{ ...sampleText, position: 'relative', margin: 0, color: semantic(tokens, name) }}>{SAMPLE}</span>
    </div>
  )
}

const CANVAS_ENTRIES: readonly (Entry & { canvas: Canvas })[] = [
  { name: 'text-onlightcanvas', canvas: 'light', description: 'Text over content lighter than 50% lightness.' },
  { name: 'text-onlightcanvas-secondary', canvas: 'light', description: 'Supporting text over the same content.' },
  { name: 'text-ondarkcanvas', canvas: 'dark', description: 'Text over content at or below 50% lightness.' },
  { name: 'text-ondarkcanvas-secondary', canvas: 'dark', description: 'Supporting text over the same content.' },
]

function TextOnCanvas(): ReactElement {
  return (
    <ApplicationSheet
      title="Text on a canvas or image"
      entries={CANVAS_ENTRIES}
      sample={(entry, tokens) => {
        const canvas = CANVAS_ENTRIES.find((candidate) => candidate.name === entry.name)?.canvas ?? 'light'
        return <CanvasSample canvas={canvas} name={entry.name} tokens={tokens} />
      }}
    >
      <p style={prose}>
        Text over user content, such as a label on the spatial canvas or a caption on a preview, cannot
        rely on the theme. These colours are the same in every theme and mode; choose by the lightness of
        the content underneath.
      </p>
    </ApplicationSheet>
  )
}

const meta = {
  title: 'Foundations/Text colors',
  component: BasicText,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof BasicText>

export default meta

type Story = StoryObj<typeof meta>

export const Basic: Story = {}

export const Tinted: Story = {
  render: () => <TintedText />,
}

export const OnFill: StoryObj<typeof TextOnFill> = {
  name: 'On fill',
  args: { role: 'brand' },
  argTypes: { role: { control: 'select', options: FILL_ROLES } },
  render: (args) => <TextOnFill {...args} />,
}

export const OnCanvas: Story = {
  name: 'On canvas',
  render: () => <TextOnCanvas />,
}

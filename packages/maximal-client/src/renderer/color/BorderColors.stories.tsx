import type { Meta, StoryObj } from '@maximal/maximal-storybook'
import { Check, Scan } from 'lucide-react'
import type { CSSProperties, ReactElement } from 'react'

import { lucideStroke } from '../shared/lucide-stroke'
import { ApplicationSheet, semantic } from './ColorApplications'
import { prose } from './ColorSheet'
import type { PaletteTokens } from './palette'

const specimen: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-around',
  gap: 24, minHeight: 100, padding: 20, boxSizing: 'border-box',
}
const caption: CSSProperties = {
  display: 'grid', justifyItems: 'center', gap: 12, font: '12px/1.4 system-ui, sans-serif',
}

function NeutralSample({
  tokens, element, strong,
}: { tokens: PaletteTokens; element?: 'toolbar' | 'menu'; strong: boolean }): ReactElement {
  const prefix = element === undefined ? 'border' : `border-${element}`
  return (
    <div
      style={{
        ...specimen, marginTop: 10,
        background: semantic(tokens, element === undefined ? 'bg-default' : `bg-${element}-default`),
        color: semantic(tokens, 'text-default'),
      }}
    >
      <div style={caption}>
        <span>{strong ? 'Strong' : 'Default'}</span>
        {strong ? (
          <span style={{ border: `1px solid ${semantic(tokens, `${prefix}-strong`)}`, padding: '8px 16px', borderRadius: 6 }}>
            Button
          </span>
        ) : (
          <span aria-label="Default divider" style={{ width: 180, borderTop: `1px solid ${semantic(tokens, `${prefix}-default`)}` }} />
        )}
      </div>
    </div>
  )
}

function DefaultBorders(): ReactElement {
  return (
    <ApplicationSheet
      title="Default borders"
      entries={[
        { name: 'border-default', description: 'Subtle dividers between sections and decorative outlines.' },
        { name: 'border-strong', description: 'A more prominent outline for inputs and controls.' },
      ]}
      sample={(entry, tokens) => <NeutralSample tokens={tokens} strong={entry.name.endsWith('-strong')} />}
    >
      <p style={prose}>Borders establish boundaries without competing with the content.</p>
    </ApplicationSheet>
  )
}

function SelectionBorders(): ReactElement {
  return (
    <ApplicationSheet
      title="Selection borders"
      entries={[
        { name: 'border-selected', description: 'The Maximal brand outline for focused or selected inputs on normal surfaces.' },
        { name: 'border-selected-strong', description: 'A brand outline that stays readable against an already selected background, in both modes.' },
      ]}
      sample={(entry, tokens) => {
        const selected = entry.name.endsWith('-strong')
        return (
          <div
            style={{
              ...specimen, marginTop: 10,
              background: semantic(tokens, selected ? 'bg-selected' : 'bg-default'),
              color: semantic(tokens, selected ? 'text-onselected' : 'text-default'),
            }}
          >
            <span
              aria-label={selected ? 'Selected control' : 'Focused control'}
              style={{
                display: 'grid', placeItems: 'center', width: 24, height: 24,
                border: `1px solid ${semantic(tokens, entry.name)}`, borderRadius: 5,
              }}
            >
              {selected ? <Check {...lucideStroke(16)} aria-hidden="true" /> : <Scan {...lucideStroke(16)} aria-hidden="true" />}
            </span>
          </div>
        )
      }}
    >
      <p style={prose}>Selection follows the theme&apos;s brand ramp, not blue. The strong variant contrasts with the selection fill.</p>
    </ApplicationSheet>
  )
}

function ElementBorders(): ReactElement {
  return (
    <ApplicationSheet
      title="Toolbar and menu borders"
      entries={(['toolbar', 'menu'] as const).flatMap((element) => [
        { name: `border-${element}-default`, description: `Subtle dividers on the ${element}'s own surface.` },
        { name: `border-${element}-strong`, description: `Control outlines with at least 3:1 contrast on the ${element}'s own surface.` },
      ])}
      sample={(entry, tokens) => (
        <NeutralSample
          tokens={tokens}
          element={entry.name.includes('-toolbar-') ? 'toolbar' : 'menu'}
          strong={entry.name.endsWith('-strong')}
        />
      )}
    >
      <p style={prose}>Element-specific borders use Maximal&apos;s toolbar and menu surfaces, in light and dark mode.</p>
    </ApplicationSheet>
  )
}

const meta = {
  title: 'Foundations/Border colors',
  component: DefaultBorders,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof DefaultBorders>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = { name: 'Default borders' }
export const Selection: Story = { name: 'Selection borders', render: () => <SelectionBorders /> }
export const ToolbarAndMenu: Story = { name: 'Toolbar and menu borders', render: () => <ElementBorders /> }

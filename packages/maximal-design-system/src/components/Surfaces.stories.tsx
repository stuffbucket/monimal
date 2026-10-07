import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

import '../styles/index.css'
import { Button } from '../primitives/button'
import {
  Accordion,
  Avatar,
  Callout,
  Card,
  Collapsible,
  ScrollArea,
  Separator,
} from './surfaces'

const meta = {
  title: 'Components/Surfaces',
  globals: { shell: 'design-system' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function SurfacesShowcase() {
  const [selected, setSelected] = useState('card')

  return (
    <div style={{ display: 'grid', gap: 'var(--spacer-4)', maxWidth: 'var(--width-content-standard)' }}>
      <div style={{ display: 'flex', gap: 'var(--spacer-2)', alignItems: 'center' }}>
        <Avatar alt="Maximal" />
        <Avatar alt="Example account" fallback="EA" />
      </div>
      <div aria-label="Selectable surfaces" role="listbox" style={{ display: 'grid', gap: 'var(--spacer-2)' }}>
        <Card selected={selected === 'card'} onSelect={() => setSelected('card')}>
          Selectable card option
        </Card>
        <Callout
          title="Selectable callout option"
          selected={selected === 'callout'}
          onSelect={() => setSelected('callout')}
          actions={<Button variant="link">Review</Button>}
        >
          This callout participates in the same listbox selection model.
        </Callout>
      </div>
      <Separator />
      <Collapsible title="Collapsible details">
        Content remains mounted and follows Base UI disclosure behavior.
      </Collapsible>
      <Accordion
        defaultValue={['first']}
        items={[
          { value: 'first', title: 'First section', content: 'First panel content.' },
          { value: 'second', title: 'Second section', content: 'Second panel content.' },
        ]}
      />
      <ScrollArea style={{ height: 'var(--width-sidebar-minimum)' }}>
        <div style={{ display: 'grid', gap: 'var(--spacer-2)', width: 'var(--width-content-standard)' }}>
          {Array.from({ length: 12 }, (_, index) => (
            <Card
              key={index}
              selected={false}
              onSelect={() => undefined}
            >
              Scrollable item {index + 1}
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

export const AllSurfaces: Story = {
  render: () => <SurfacesShowcase />,
}

import type { Meta, StoryObj } from '@storybook/react-vite'
import { Bold, Italic, Underline } from 'lucide-react'
import { useState } from 'react'

import '../styles/index.css'
import {
  Tabs,
  ToggleGroup,
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
} from './navigation-controls'

const meta = {
  title: 'Components/Navigation controls',
  globals: { shell: 'design-system' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function NavigationShowcase() {
  const [tab, setTab] = useState('details')
  const [format, setFormat] = useState<string[]>(['bold'])

  return (
    <div style={{ display: 'grid', gap: 'var(--spacer-4)', maxWidth: 'var(--width-content-standard)' }}>
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(String(value))}
        items={[
          { value: 'details', label: 'Details', content: 'Details panel' },
          { value: 'activity', label: 'Activity', content: 'Activity panel' },
        ]}
      />
      <Toolbar aria-label="Text tools">
        <ToolbarGroup>
          <ToolbarButton aria-label="Bold"><Bold aria-hidden size={16} /></ToolbarButton>
          <ToolbarButton aria-label="Italic"><Italic aria-hidden size={16} /></ToolbarButton>
        </ToolbarGroup>
      </Toolbar>
      <ToggleGroup
        aria-label="Formatting"
        multiple
        value={format}
        onValueChange={setFormat}
        options={[
          { value: 'bold', label: <Bold aria-label="Bold" size={16} /> },
          { value: 'italic', label: <Italic aria-label="Italic" size={16} /> },
          { value: 'underline', label: <Underline aria-label="Underline" size={16} /> },
        ]}
      />
    </div>
  )
}

export const AllNavigationControls: Story = {
  render: () => <NavigationShowcase />,
}

import type { Meta, StoryObj } from '@storybook/react-vite'

import { Button } from '../../primitives/button'
import '../../styles/index.css'
import { Callout } from './index'

const meta = {
  title: 'Components/Callout',
  component: Callout,
  globals: { shell: 'design-system' },
  args: {
    actions: <Button variant="link">Review</Button>,
    children: 'This callout participates in a listbox selection model.',
    onSelect: () => undefined,
    selected: false,
    title: 'Selectable callout option',
  },
  render: (args) => (
    <div
      aria-label="Callout options"
      role="listbox"
      style={{ width: 'var(--width-content-standard)' }}
    >
      <Callout {...args} />
    </div>
  ),
} satisfies Meta<typeof Callout>

export default meta
type Story = StoryObj<typeof meta>

export const Unselected: Story = {}

export const Selected: Story = {
  args: {
    selected: true,
  },
}

export const Disabled: Story = {
  args: {
    disabled: true,
  },
}

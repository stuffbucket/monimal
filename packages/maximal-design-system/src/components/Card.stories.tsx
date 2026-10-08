import type { Meta, StoryObj } from '@storybook/react-vite'

import '../styles/index.css'
import { Card } from './surfaces'

const meta = {
  title: 'Components/Card',
  component: Card,
  globals: { shell: 'design-system' },
  args: {
    children: 'Selectable card option',
    onSelect: () => undefined,
    selected: false,
  },
  render: (args) => (
    <div
      aria-label="Card options"
      role="listbox"
      style={{ width: 'var(--width-content-standard)' }}
    >
      <Card {...args} />
    </div>
  ),
} satisfies Meta<typeof Card>

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

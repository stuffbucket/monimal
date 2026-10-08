import type { Meta, StoryObj } from '@storybook/react-vite'

import { Button } from '../../primitives/button'
import '../../styles/index.css'
import { Popover } from './index'

const meta = {
  title: 'Components/Popover',
  component: Popover,
  globals: { shell: 'design-system' },
} satisfies Meta<typeof Popover>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    trigger: <Button>Open popover</Button>,
    title: 'Popover title',
    description: 'A reusable nonmodal surface.',
    children: 'Popover content belongs to the consumer.',
  },
}

export const OpenNonmodal: Story = {
  args: {
    defaultOpen: true,
    modal: false,
    trigger: <Button>Open nonmodal popover</Button>,
    title: 'Nonmodal popover',
    description: 'The rest of the page remains interactive.',
    children: 'Nonmodal content',
  },
}

export const OpenModal: Story = {
  args: {
    defaultOpen: true,
    modal: true,
    trigger: <Button>Open modal popover</Button>,
    title: 'Modal popover',
    description: 'Interaction is limited to this surface while open.',
    children: 'Modal content',
  },
}

export const DisabledControl: Story = {
  args: {
    trigger: <Button disabled>Unavailable popover</Button>,
    title: 'Unavailable',
    children: 'This content cannot be opened from the disabled control.',
  },
}

export const ContentVariations: Story = {
  args: {
    defaultOpen: true,
    trigger: <Button>Open detailed popover</Button>,
    title: 'Project details',
    description: 'Updated just now',
    children: (
      <div style={{ display: 'grid', gap: 'var(--spacer-2)' }}>
        <strong>Design system</strong>
        <span>Shared primitives and visual tokens.</span>
        <Button variant="primary">Open project</Button>
      </div>
    ),
  },
}

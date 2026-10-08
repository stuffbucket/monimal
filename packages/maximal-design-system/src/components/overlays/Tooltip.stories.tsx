import type { Meta, StoryObj } from '@storybook/react-vite'

import { Button } from '../../primitives/button'
import '../../styles/index.css'
import { Tooltip } from './index'

const meta = {
  title: 'Components/Tooltip',
  component: Tooltip,
  globals: { shell: 'design-system' },
} satisfies Meta<typeof Tooltip>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    trigger: <Button>Hover for tooltip</Button>,
    children: 'Helpful context',
  },
}

export const Open: Story = {
  args: {
    defaultOpen: true,
    trigger: <Button>Tooltip trigger</Button>,
    children: 'The tooltip is initially open.',
  },
}

export const DisabledControl: Story = {
  args: {
    disabled: true,
    trigger: <Button disabled>Unavailable action</Button>,
    children: 'This tooltip is disabled.',
  },
}

export const ContentVariations: Story = {
  args: {
    defaultOpen: true,
    trigger: <Button>Rich tooltip</Button>,
    children: (
      <span style={{ display: 'grid', gap: 'var(--spacer-1)' }}>
        <strong>Keyboard shortcut</strong>
        <span>Press ⇧⌘P to open commands.</span>
      </span>
    ),
  },
}

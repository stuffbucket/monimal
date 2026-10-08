import type { Meta, StoryObj } from '@storybook/react-vite'

import { Button } from '../primitives/button'
import '../styles/index.css'
import { Menu } from './overlays'

const meta = {
  title: 'Components/Menu',
  component: Menu,
  globals: { shell: 'design-system' },
} satisfies Meta<typeof Menu>

export default meta
type Story = StoryObj<typeof meta>

const items = [
  { label: 'Open' },
  { label: 'Duplicate' },
  { label: 'Delete' },
]

export const Default: Story = {
  args: {
    trigger: <Button>Open menu</Button>,
    items,
  },
}

export const Open: Story = {
  args: {
    defaultOpen: true,
    trigger: <Button>Open menu</Button>,
    items,
  },
}

export const DisabledItem: Story = {
  args: {
    defaultOpen: true,
    trigger: <Button>Open menu</Button>,
    items: [
      { label: 'Open' },
      { label: 'Duplicate', disabled: true },
      { label: 'Delete' },
    ],
  },
}

export const ContentVariations: Story = {
  args: {
    defaultOpen: true,
    trigger: <Button>Open menu</Button>,
    items: [
      { label: 'Short label' },
      { label: <strong>Emphasized</strong> },
      { label: <span style={{ color: 'var(--maximal-color-text-secondary)' }}>Muted label</span> },
    ],
  },
}

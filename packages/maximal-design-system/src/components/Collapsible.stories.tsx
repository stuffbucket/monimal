import type { Meta, StoryObj } from '@storybook/react-vite'

import '../styles/index.css'
import { Collapsible } from './surfaces'

const meta = {
  title: 'Components/Collapsible',
  component: Collapsible,
  globals: { shell: 'design-system' },
  args: {
    children: 'Content follows Base UI disclosure behavior.',
    title: 'Collapsible details',
  },
} satisfies Meta<typeof Collapsible>

export default meta
type Story = StoryObj<typeof meta>

export const Closed: Story = {
  args: {
    defaultOpen: false,
  },
}

export const Open: Story = {
  args: {
    defaultOpen: true,
  },
}

export const Disabled: Story = {
  args: {
    disabled: true,
  },
}

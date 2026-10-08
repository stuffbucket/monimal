import type { Meta, StoryObj } from '@storybook/react-vite'

import '../styles/index.css'
import { Accordion } from './surfaces'

const items = [
  {
    value: 'first',
    title: 'First section',
    content: 'First panel content.',
  },
  {
    value: 'second',
    title: 'Second section',
    content: 'Second panel content.',
  },
] as const

const meta = {
  title: 'Components/Accordion',
  component: Accordion,
  globals: { shell: 'design-system' },
  args: {
    items,
  },
} satisfies Meta<typeof Accordion>

export default meta
type Story = StoryObj<typeof meta>

export const Closed: Story = {
  args: {
    defaultValue: [],
  },
}

export const Open: Story = {
  args: {
    defaultValue: ['first'],
  },
}

export const Disabled: Story = {
  args: {
    items: [
      items[0],
      {
        ...items[1],
        disabled: true,
      },
    ],
  },
}

export const Multiple: Story = {
  args: {
    defaultValue: ['first', 'second'],
    multiple: true,
  },
}

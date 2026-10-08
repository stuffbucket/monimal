import type { Meta, StoryObj } from '@storybook/react-vite'
import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react'

import '../../styles/index.css'
import { ToggleGroup } from './index'

const options = [
  { value: 'left', label: <AlignLeft aria-label="Align left" size={16} /> },
  { value: 'center', label: <AlignCenter aria-label="Align center" size={16} /> },
  { value: 'right', label: <AlignRight aria-label="Align right" size={16} /> },
] as const

const meta = {
  title: 'Components/ToggleGroup',
  component: ToggleGroup,
  globals: { shell: 'design-system' },
  args: {
    'aria-label': 'Alignment',
    defaultValue: ['left'],
    options,
  },
} satisfies Meta<typeof ToggleGroup>

export default meta
type Story = StoryObj<typeof meta>

export const SingleSelection: Story = {}

export const NoSelection: Story = {
  args: {
    defaultValue: [],
  },
}

export const MultipleSelection: Story = {
  args: {
    defaultValue: ['left', 'right'],
    multiple: true,
  },
}

export const DisabledItem: Story = {
  args: {
    options: [
      options[0],
      { ...options[1], disabled: true },
      options[2],
    ],
  },
}

export const DisabledGroup: Story = {
  args: {
    disabled: true,
  },
}

export const Vertical: Story = {
  args: {
    orientation: 'vertical',
  },
}

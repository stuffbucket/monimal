import type { Meta, StoryObj } from '@storybook/react-vite'
import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react'
import { expect, userEvent, within } from 'storybook/test'

import '@maximal/maximal-design-system/styles.css'
import { ToggleGroup } from '@maximal/maximal-design-system/components'

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

export const SingleSelection: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const left = canvas.getByRole('button', { name: 'Align left' })
    const center = canvas.getByRole('button', { name: 'Align center' })

    await expect(left).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(left)
    await userEvent.keyboard('{ArrowRight} ')
    await expect(center).toHaveFocus()
    await expect(center).toHaveAttribute('aria-pressed', 'true')
    await expect(left).toHaveAttribute('aria-pressed', 'false')
  },
}

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

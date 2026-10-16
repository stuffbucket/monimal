import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'

import '@maximal/maximal-design-system/styles.css'
import { NumberInput } from '@maximal/maximal-design-system/components'

const meta = {
  title: 'Components/NumberInput',
  component: NumberInput,
  globals: { shell: 'design-system' },
  args: {
    label: 'Columns',
    min: 1,
    max: 24,
  },
} satisfies Meta<typeof NumberInput>

export default meta
type Story = StoryObj<typeof meta>

export const Uncontrolled: Story = {
  args: { defaultValue: 8, inputProps: { 'aria-label': 'Columns' } },
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole('textbox', { name: 'Columns' })

    await userEvent.click(input)
    await userEvent.keyboard('{ArrowUp}')
    await expect(input).toHaveValue('9')
  },
}

function ControlledNumberInput() {
  const [value, setValue] = useState<number | null>(8)
  return (
    <NumberInput
      label="Columns"
      max={24}
      min={1}
      onValueChange={setValue}
      value={value}
    />
  )
}

export const Controlled: Story = {
  render: () => <ControlledNumberInput />,
}

export const Empty: Story = {}

export const Disabled: Story = {
  args: { defaultValue: 8, disabled: true },
}

export const Required: Story = {
  args: { required: true },
}

export const ReadOnly: Story = {
  args: { defaultValue: 8, readOnly: true },
}

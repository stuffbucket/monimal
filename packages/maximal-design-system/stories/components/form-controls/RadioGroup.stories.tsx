import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'

import '@maximal/maximal-design-system/styles.css'
import { RadioGroup } from '@maximal/maximal-design-system/components'

const options = [
  { value: 'compact', label: 'Compact' },
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'spacious', label: 'Spacious', disabled: true },
] as const

const meta = {
  title: 'Components/RadioGroup',
  component: RadioGroup,
  globals: { shell: 'design-system' },
  args: {
    'aria-label': 'Density',
    options,
  },
} satisfies Meta<typeof RadioGroup>

export default meta
type Story = StoryObj<typeof meta>

export const Unselected: Story = {}

export const Uncontrolled: Story = {
  args: { defaultValue: 'comfortable' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const comfortable = canvas.getByRole('radio', { name: 'Comfortable' })
    const compact = canvas.getByRole('radio', { name: 'Compact' })

    await userEvent.click(comfortable)
    await userEvent.keyboard('{ArrowUp}')
    await expect(compact).toBeChecked()
    await expect(compact).toHaveFocus()
  },
}

function ControlledRadioGroup() {
  const [value, setValue] = useState<(typeof options)[number]['value']>('compact')
  return (
    <RadioGroup
      aria-label="Density"
      onValueChange={setValue}
      options={options}
      value={value}
    />
  )
}

export const Controlled: Story = {
  render: () => <ControlledRadioGroup />,
}

export const Disabled: Story = {
  args: { defaultValue: 'comfortable', disabled: true },
}

export const Required: Story = {
  args: { required: true },
}

export const ReadOnly: Story = {
  args: { defaultValue: 'comfortable', readOnly: true },
}

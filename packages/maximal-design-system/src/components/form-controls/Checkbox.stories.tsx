import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

import '../../styles/index.css'
import { Checkbox } from './index'

const meta = {
  title: 'Components/Checkbox',
  component: Checkbox,
  globals: { shell: 'design-system' },
  args: { label: 'Show grid' },
} satisfies Meta<typeof Checkbox>

export default meta
type Story = StoryObj<typeof meta>

export const Unchecked: Story = {}

export const Checked: Story = {
  args: { defaultChecked: true },
}

function ControlledCheckbox() {
  const [checked, setChecked] = useState(true)
  return <Checkbox checked={checked} label="Show grid" onCheckedChange={setChecked} />
}

export const Controlled: Story = {
  render: () => <ControlledCheckbox />,
}

export const Indeterminate: Story = {
  args: { indeterminate: true },
}

export const Disabled: Story = {
  args: { defaultChecked: true, disabled: true },
}

export const Required: Story = {
  args: { required: true },
}

export const ReadOnly: Story = {
  args: { defaultChecked: true, readOnly: true },
}

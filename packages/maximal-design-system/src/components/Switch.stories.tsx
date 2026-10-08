import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

import '../styles/index.css'
import { Switch } from './form-controls'

const meta = {
  title: 'Components/Switch',
  component: Switch,
  globals: { shell: 'design-system' },
  args: { label: 'Live updates' },
} satisfies Meta<typeof Switch>

export default meta
type Story = StoryObj<typeof meta>

export const Unchecked: Story = {}

export const Checked: Story = {
  args: { defaultChecked: true },
}

function ControlledSwitch() {
  const [checked, setChecked] = useState(true)
  return <Switch checked={checked} label="Live updates" onCheckedChange={setChecked} />
}

export const Controlled: Story = {
  render: () => <ControlledSwitch />,
}

export const DisabledUnchecked: Story = {
  args: { disabled: true },
}

export const DisabledChecked: Story = {
  args: { defaultChecked: true, disabled: true },
}

export const Required: Story = {
  args: { required: true },
}

export const ReadOnly: Story = {
  args: { defaultChecked: true, readOnly: true },
}

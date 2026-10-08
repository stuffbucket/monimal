import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

import '../../styles/index.css'
import { Select } from './index'

const options = [
  { value: 'canvas', label: 'Canvas' },
  { value: 'terminal', label: 'Terminal' },
  { value: 'settings', label: 'Settings', disabled: true },
] as const

const meta = {
  title: 'Components/Select',
  component: Select,
  globals: { shell: 'design-system' },
  args: {
    label: 'Surface',
    options,
  },
} satisfies Meta<typeof Select>

export default meta
type Story = StoryObj<typeof meta>

export const Uncontrolled: Story = {
  args: { defaultValue: 'canvas' },
}

function ControlledSelect() {
  const [value, setValue] = useState<(typeof options)[number]['value']>('terminal')
  return <Select label="Surface" options={options} value={value} onValueChange={setValue} />
}

export const Controlled: Story = {
  render: () => <ControlledSelect />,
}

export const EmptyPlaceholder: Story = {
  args: { placeholder: 'Choose a surface' },
}

export const Disabled: Story = {
  args: { defaultValue: 'canvas', disabled: true },
}

export const Required: Story = {
  args: { placeholder: 'Required selection', required: true },
}

export const WithDisabledOption: Story = {
  args: { defaultValue: 'terminal' },
}

import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

import '../styles/index.css'
import { Autocomplete } from './form-controls'

const items = ['Open project', 'Open settings', 'Open terminal']

const meta = {
  title: 'Components/Autocomplete',
  component: Autocomplete,
  globals: { shell: 'design-system' },
  args: {
    items,
    label: 'Command',
    placeholder: 'Search commands',
  },
} satisfies Meta<typeof Autocomplete>

export default meta
type Story = StoryObj<typeof meta>

export const EmptyPlaceholder: Story = {}

export const Uncontrolled: Story = {
  args: { defaultValue: 'Open project' },
}

function ControlledAutocomplete() {
  const [value, setValue] = useState('Open settings')
  return (
    <Autocomplete
      items={items}
      label="Command"
      onValueChange={setValue}
      placeholder="Search commands"
      value={value}
    />
  )
}

export const Controlled: Story = {
  render: () => <ControlledAutocomplete />,
}

export const NoMatchingValue: Story = {
  args: { defaultValue: 'Unknown command' },
}

export const NoItems: Story = {
  args: { items: [] },
}

export const Disabled: Story = {
  args: { defaultValue: 'Open project', disabled: true },
}

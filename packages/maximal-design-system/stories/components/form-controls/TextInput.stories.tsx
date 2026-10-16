import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'

import { TextInput } from '@maximal/maximal-design-system/components'
import { SearchIcon } from '@maximal/maximal-design-system/icons'
import '@maximal/maximal-design-system/styles.css'

const meta = {
  title: 'Components/TextInput',
  component: TextInput,
  globals: { shell: 'design-system' },
  args: {
    label: 'Command',
    placeholder: 'Search commands',
  },
} satisfies Meta<typeof TextInput>

export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole('textbox', { name: 'Command' })

    await userEvent.click(input)
    await userEvent.type(input, 'Open terminal')
    await expect(input).toHaveValue('Open terminal')
  },
}

export const Search: Story = {
  args: {
    leading: <SearchIcon />,
    showLabel: false,
    type: 'search',
  },
}

function ControlledTextInput() {
  const [value, setValue] = useState('Open project')
  return (
    <TextInput
      label="Command"
      onValueChange={setValue}
      value={value}
    />
  )
}

export const Controlled: Story = {
  render: () => <ControlledTextInput />,
}

export const Error: Story = {
  args: {
    defaultValue: 'x',
    description: 'Use at least two characters.',
    error: 'The command is too short.',
  },
}

export const Disabled: Story = {
  args: {
    defaultValue: 'Open settings',
    disabled: true,
  },
}

export const ReadOnly: Story = {
  args: {
    defaultValue: 'Open settings',
    readOnly: true,
  },
}

export const LongValue: Story = {
  args: {
    defaultValue: 'Open the terminal connected to the long-running development container',
  },
}

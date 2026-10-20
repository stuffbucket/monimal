import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'

import '@maximal/maximal-design-system/styles.css'
import { Autocomplete } from '@maximal/maximal-design-system/components'

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

export const EmptyPlaceholder: Story = {
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole('combobox', { name: 'Command' })

    await userEvent.click(input)
    await userEvent.type(input, 'term')
    const option = await within(canvasElement.ownerDocument.body).findByRole('option', {
      name: 'Open terminal',
    })
    await expect(option).toBeVisible()
    await userEvent.keyboard('{ArrowDown}{Enter}')
    await expect(input).toHaveValue('Open terminal')
  },
}

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

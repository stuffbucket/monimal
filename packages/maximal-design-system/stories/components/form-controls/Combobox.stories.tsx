import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'

import { Combobox } from '@maximal/maximal-design-system/components'
import { CommandIcon, SearchIcon } from '@maximal/maximal-design-system/icons'
import '@maximal/maximal-design-system/styles.css'

const groups = [
  {
    label: 'Recent',
    options: [
      {
        value: 'local',
        label: 'Local',
        textValue: 'Local',
        description: 'Open a shell on this computer',
        icon: <CommandIcon />,
        keywords: ['shell'],
      },
    ],
  },
  {
    label: 'Available',
    options: [
      {
        value: 'docker',
        label: 'Docker',
        textValue: 'Docker',
        description: 'Connect to a development container',
        icon: <CommandIcon />,
        keywords: ['container'],
      },
      {
        value: 'ssh',
        label: 'Remote host with a long descriptive name',
        textValue: 'Remote host with a long descriptive name',
        description: 'Connect over SSH',
        icon: <CommandIcon />,
        keywords: ['remote'],
      },
    ],
  },
] as const

const meta = {
  title: 'Components/Combobox',
  component: Combobox,
  globals: { shell: 'design-system' },
  args: {
    groups,
    label: 'Terminal',
    leading: <SearchIcon />,
    placeholder: 'Search terminals',
  },
} satisfies Meta<typeof Combobox>

export default meta
type Story = StoryObj<typeof meta>

export const Grouped: Story = {
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole('combobox', { name: 'Terminal' })

    await userEvent.click(input)
    await userEvent.type(input, 'container')
    const body = within(canvasElement.ownerDocument.body)
    const dockerOption = await body.findByRole('option', { name: /Docker/ })
    await expect(dockerOption).toBeVisible()
    await userEvent.click(dockerOption)
    await expect(input).toHaveValue('Docker')
  },
}

export const InlineGrouped: Story = {
  args: {
    inline: true,
  },
}

function ControlledCombobox() {
  const [value, setValue] = useState<string | null>('docker')
  return (
    <Combobox
      groups={groups}
      label="Terminal"
      onValueChange={(nextValue) => setValue(nextValue)}
      value={value}
    />
  )
}

export const Controlled: Story = {
  render: () => <ControlledCombobox />,
}

export const Loading: Story = {
  args: {
    defaultOpen: true,
    groups: [],
    loading: true,
    loadingMessage: 'Loading terminals...',
  },
}

export const Empty: Story = {
  args: {
    defaultOpen: true,
    groups: [],
  },
}

export const Error: Story = {
  args: {
    error: 'Terminals are unavailable.',
    groups: [],
  },
}

export const InlineLoading: Story = {
  args: {
    groups: [],
    inline: true,
    loading: true,
    loadingMessage: 'Loading terminals...',
  },
}

export const InlineEmpty: Story = {
  args: {
    groups: [],
    inline: true,
  },
}

export const InlineError: Story = {
  args: {
    error: 'Terminals are unavailable.',
    groups: [],
    inline: true,
  },
}

export const Disabled: Story = {
  args: {
    disabled: true,
  },
}

import type { Meta, StoryObj } from '@storybook/react-vite'
import { FileText, History } from 'lucide-react'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'

import '@maximal/maximal-design-system/styles.css'
import { Tabs } from '@maximal/maximal-design-system/components'

const items = [
  {
    value: 'details',
    label: 'Details',
    icon: <FileText aria-hidden size={16} />,
    content: 'Project details panel',
  },
  {
    value: 'activity',
    label: 'Activity',
    icon: <History aria-hidden size={16} />,
    content: 'Project activity panel',
  },
] as const

const meta = {
  title: 'Components/Tabs',
  component: Tabs,
  globals: { shell: 'design-system' },
  args: {
    defaultValue: 'details',
    items,
  },
} satisfies Meta<typeof Tabs>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const details = canvas.getByRole('tab', { name: 'Details' })
    const activity = canvas.getByRole('tab', { name: 'Activity' })

    await userEvent.click(details)
    await userEvent.keyboard('{ArrowRight}')
    await expect(activity).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect(activity).toHaveAttribute('aria-selected', 'true')
    await expect(canvas.getByRole('tabpanel')).toHaveTextContent('Project activity panel')
  },
}

function ControlledTabs() {
  const [value, setValue] = useState('activity')
  return (
    <Tabs
      items={items}
      value={value}
      onValueChange={(next) => setValue(String(next))}
    />
  )
}

export const Controlled: Story = {
  render: () => <ControlledTabs />,
}

export const DisabledTab: Story = {
  args: {
    items: [
      items[0],
      { ...items[1], disabled: true },
    ],
  },
}

export const Vertical: Story = {
  args: {
    orientation: 'vertical',
  },
}

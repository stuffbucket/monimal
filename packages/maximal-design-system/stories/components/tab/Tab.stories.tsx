import { Tabs } from '@base-ui/react/tabs'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { FileText } from 'lucide-react'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'

import '@maximal/maximal-design-system/styles.css'
import { Tab } from '@maximal/maximal-design-system/components'

function TabState({
  active = false,
  closable = true,
  disabled = false,
  icon = false,
}: {
  active?: boolean
  closable?: boolean
  disabled?: boolean
  icon?: boolean
}) {
  const [visible, setVisible] = useState(true)

  if (!visible) return <span role="status">Document tab closed</span>

  return (
    <Tabs.Root value={active ? 'document' : 'other'}>
      <Tabs.List className="maximal-tabs__list">
        <Tab
          active={active}
          closable={closable}
          disabled={disabled}
          icon={icon ? <FileText aria-hidden size={16} /> : undefined}
          label="Document"
          onClose={() => setVisible(false)}
          value="document"
        />
      </Tabs.List>
    </Tabs.Root>
  )
}

const meta = {
  title: 'Components/Tab',
  component: Tab,
  globals: { shell: 'design-system' },
  args: {
    label: 'Document',
    value: 'document',
  },
  render: () => <TabState />,
} satisfies Meta<typeof Tab>

export default meta
type Story = StoryObj<typeof meta>

export const Inactive: Story = {}

export const ActiveClosable: Story = {
  render: () => <TabState active />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const tab = canvas.getByRole('tab', { name: 'Document' })

    await userEvent.click(tab)
    await userEvent.keyboard('{Delete}')
    await expect(canvas.queryByRole('tab', { name: 'Document' })).not.toBeInTheDocument()
    await expect(canvas.getByRole('status', { name: '' })).toHaveTextContent('Document tab closed')
  },
}

export const ActiveNotClosable: Story = {
  render: () => <TabState active closable={false} />,
}

export const WithIcon: Story = {
  render: () => <TabState active icon />,
}

export const Disabled: Story = {
  render: () => <TabState disabled />,
}

import { Tabs } from '@base-ui/react/tabs'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { FileText } from 'lucide-react'

import '../../styles/index.css'
import { Tab } from './index'

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
  return (
    <Tabs.Root value={active ? 'document' : 'other'}>
      <Tabs.List className="maximal-tabs__list">
        <Tab
          active={active}
          closable={closable}
          disabled={disabled}
          icon={icon ? <FileText aria-hidden size={16} /> : undefined}
          label="Document"
          onClose={() => undefined}
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

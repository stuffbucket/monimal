import type { Meta, StoryObj } from '@storybook/react-vite'

import '@maximal/maximal-design-system/styles.css'
import { SearchIcon } from '@maximal/maximal-design-system/icons'
import { Icon } from '@maximal/maximal-design-system/components'

const meta = {
  title: 'Components/Icon',
  component: Icon,
  globals: { shell: 'design-system' },
  args: {
    children: <SearchIcon />,
    label: 'Search',
    size: 'standard',
  },
} satisfies Meta<typeof Icon>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Decorative: Story = {
  render: () => (
    <Icon size="standard">
      <SearchIcon />
    </Icon>
  ),
}

export const Compact: Story = {
  args: {
    label: 'Compact search',
    size: 'compact',
  },
}

export const Standard: Story = {
  args: {
    label: 'Standard search',
    size: 'standard',
  },
}

export const Prominent: Story = {
  args: {
    label: 'Prominent search',
    size: 'prominent',
  },
}

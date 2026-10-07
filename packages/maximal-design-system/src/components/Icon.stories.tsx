import type { Meta, StoryObj } from '@storybook/react-vite'

import '../styles/index.css'
import { SearchIcon } from '../icons'
import { Icon } from './icon'

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

export const Sizes: Story = {
  render: () => (
    <div className="maximal-icon-story">
      <Icon label="Compact search" size="compact"><SearchIcon /></Icon>
      <Icon label="Standard search"><SearchIcon /></Icon>
      <Icon label="Prominent search" size="prominent"><SearchIcon /></Icon>
    </div>
  ),
}

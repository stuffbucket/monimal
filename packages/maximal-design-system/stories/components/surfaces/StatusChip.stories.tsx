import type { Meta, StoryObj } from '@storybook/react-vite'

import '@maximal/maximal-design-system/styles.css'
import { StatusChip } from '@maximal/maximal-design-system/components'

const meta = {
  title: 'Components/StatusChip',
  component: StatusChip,
  globals: { shell: 'design-system' },
  args: {
    label: 'Ready',
    status: 'ready',
  },
} satisfies Meta<typeof StatusChip>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

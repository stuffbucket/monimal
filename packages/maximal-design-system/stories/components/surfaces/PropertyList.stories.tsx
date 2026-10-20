import type { Meta, StoryObj } from '@storybook/react-vite'

import '@maximal/maximal-design-system/styles.css'
import {
  Property,
  PropertyList,
} from '@maximal/maximal-design-system/components'

const meta = {
  title: 'Components/PropertyList',
  component: PropertyList,
  globals: { shell: 'design-system' },
  args: {
    children: (
      <>
        <Property label="Provider" value="Copilot" />
        <Property label="State" value="Ready" />
      </>
    ),
  },
} satisfies Meta<typeof PropertyList>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

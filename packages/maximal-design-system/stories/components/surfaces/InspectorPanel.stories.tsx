import type { Meta, StoryObj } from '@storybook/react-vite'

import '@maximal/maximal-design-system/styles.css'
import { InspectorPanel } from '@maximal/maximal-design-system/components'

const meta = {
  title: 'Components/InspectorPanel',
  component: InspectorPanel,
  globals: { shell: 'design-system' },
  args: {
    children: 'Inspector content',
    title: 'Inspector',
  },
  render: (args) => (
    <div style={{ height: 'var(--height-window-minimum)', width: 'var(--width-sidebar-right-default)' }}>
      <InspectorPanel {...args} />
    </div>
  ),
} satisfies Meta<typeof InspectorPanel>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

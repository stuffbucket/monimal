import type { Meta, StoryObj } from '@storybook/react-vite'

import '@maximal/maximal-design-system/styles.css'
import { WorkspaceShellSpike } from '@maximal/maximal-design-system/compositions'

const meta = {
  title: 'Spikes/Base UI/Workspace Shell',
  component: WorkspaceShellSpike,
  globals: {
    shell: 'design-system',
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'An isolated shell, tab bar, and terminal spike. Base UI supplies interaction behavior; maximal-design-system supplies every token and style.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="maximal-workspace-shell-story-frame">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof WorkspaceShellSpike>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const CompactCanvas: Story = {
  args: {
    defaultMode: 'compact',
  },
}

export const WithoutNotification: Story = {
  args: {
    showNotification: false,
  },
}

export const WithoutSecondaryToolbar: Story = {
  args: {
    showSecondaryToolbar: false,
  },
}

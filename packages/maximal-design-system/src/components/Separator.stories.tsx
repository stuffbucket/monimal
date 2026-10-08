import type { Meta, StoryObj } from '@storybook/react-vite'

import '../styles/index.css'
import { Separator } from './surfaces'

const meta = {
  title: 'Components/Separator',
  component: Separator,
  globals: { shell: 'design-system' },
} satisfies Meta<typeof Separator>

export default meta
type Story = StoryObj<typeof meta>

export const Horizontal: Story = {
  render: () => (
    <div style={{ width: 'var(--width-content-standard)' }}>
      <Separator orientation="horizontal" />
    </div>
  ),
}

export const Vertical: Story = {
  render: () => (
    <div style={{ height: 'var(--height-row-heading)' }}>
      <Separator orientation="vertical" />
    </div>
  ),
}

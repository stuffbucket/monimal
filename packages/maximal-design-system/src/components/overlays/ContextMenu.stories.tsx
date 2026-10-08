import type { Meta, StoryObj } from '@storybook/react-vite'

import '../../styles/index.css'
import { ContextMenu } from './index'

const meta = {
  title: 'Components/ContextMenu',
  component: ContextMenu,
  globals: { shell: 'design-system' },
} satisfies Meta<typeof ContextMenu>

export default meta
type Story = StoryObj<typeof meta>

const surface = (
  <div
    style={{
      border: 'var(--border-width-thin) solid var(--maximal-color-border-default)',
      borderRadius: 'var(--radius-large)',
      padding: 'var(--spacer-5)',
    }}
  >
    Right-click this surface
  </div>
)

export const Default: Story = {
  args: {
    children: surface,
    items: [
      { label: 'Open' },
      { label: 'Duplicate' },
      { label: 'Delete' },
    ],
  },
}

export const Open: Story = {
  args: {
    children: surface,
    defaultOpen: true,
    items: [
      { label: 'Open' },
      { label: 'Duplicate' },
      { label: 'Delete' },
    ],
  },
}

export const DisabledItem: Story = {
  args: {
    children: surface,
    defaultOpen: true,
    items: [
      { label: 'Cut' },
      { label: 'Copy' },
      { label: 'Paste', disabled: true },
    ],
  },
}

export const ContentVariations: Story = {
  args: {
    children: surface,
    defaultOpen: true,
    items: [
      { label: 'Plain text' },
      {
        label: (
          <span style={{ display: 'flex', gap: 'var(--spacer-3)' }}>
            With shortcut
            <span style={{ color: 'var(--maximal-color-text-secondary)' }}>⌘K</span>
          </span>
        ),
      },
    ],
  },
}

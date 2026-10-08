import type { Meta, StoryObj } from '@storybook/react-vite'
import { Bold, Italic, Redo, Undo } from 'lucide-react'

import '../styles/index.css'
import {
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
} from './navigation-controls'

const meta = {
  title: 'Components/Toolbar',
  component: Toolbar,
  globals: { shell: 'design-system' },
  args: {
    'aria-label': 'Text tools',
    children: (
      <>
        <ToolbarButton aria-label="Undo">
          <Undo aria-hidden size={16} />
        </ToolbarButton>
        <ToolbarButton aria-label="Redo">
          <Redo aria-hidden size={16} />
        </ToolbarButton>
      </>
    ),
  },
} satisfies Meta<typeof Toolbar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Grouped: Story = {
  args: {
    children: (
      <>
        <ToolbarGroup aria-label="History">
          <ToolbarButton aria-label="Undo">
            <Undo aria-hidden size={16} />
          </ToolbarButton>
          <ToolbarButton aria-label="Redo">
            <Redo aria-hidden size={16} />
          </ToolbarButton>
        </ToolbarGroup>
        <ToolbarGroup aria-label="Formatting">
          <ToolbarButton aria-label="Bold">
            <Bold aria-hidden size={16} />
          </ToolbarButton>
          <ToolbarButton aria-label="Italic">
            <Italic aria-hidden size={16} />
          </ToolbarButton>
        </ToolbarGroup>
      </>
    ),
  },
}

export const DisabledButton: Story = {
  args: {
    children: (
      <>
        <ToolbarButton aria-label="Undo">
          <Undo aria-hidden size={16} />
        </ToolbarButton>
        <ToolbarButton aria-label="Redo" disabled>
          <Redo aria-hidden size={16} />
        </ToolbarButton>
      </>
    ),
  },
}

export const Vertical: Story = {
  args: {
    orientation: 'vertical',
  },
}

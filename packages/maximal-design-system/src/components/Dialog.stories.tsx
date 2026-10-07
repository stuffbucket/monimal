import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState, type ReactNode } from 'react'

import { Button } from '../primitives/button'
import '../styles/index.css'
import { Dialog } from './dialog'

const meta = {
  title: 'Components/Dialog',
  component: Dialog,
  args: {
    open: false,
    title: 'Delete this project',
    children: null,
  },
  globals: {
    shell: 'design-system',
  },
  argTypes: {
    children: { table: { disable: true } },
    open: { table: { disable: true } },
  },
} satisfies Meta<typeof Dialog>

export default meta
type Story = StoryObj<typeof meta>

function ConfirmDialog({ title }: { title: ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)} variant="primary">
        Open dialog
      </Button>
      <Dialog
        description="This removes the project and everything in it. There is no undo."
        onOpenChange={setOpen}
        open={open}
        showDescription
        showTitle
        title={title}
      >
        <div style={{ display: 'flex', gap: 'var(--spacer-2)', justifyContent: 'flex-end' }}>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => setOpen(false)} variant="danger">
            Delete
          </Button>
        </div>
      </Dialog>
    </>
  )
}

export const Default: Story = {
  render: ({ title }) => <ConfirmDialog title={title} />,
}

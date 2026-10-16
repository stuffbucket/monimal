import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState, type ReactNode } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { Button } from '@maximal/maximal-design-system/primitives'
import '@maximal/maximal-design-system/styles.css'
import { Dialog } from '@maximal/maximal-design-system/components'

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

function ConfirmDialog({
  title,
  modal = true,
  disablePointerDismissal = false,
  showDescription = true,
  showTitle = true,
}: {
  title: ReactNode
  modal?: boolean
  disablePointerDismissal?: boolean
  showDescription?: boolean
  showTitle?: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)} variant="primary">
        Open dialog
      </Button>
      <Dialog
        description="This removes the project and everything in it. There is no undo."
        disablePointerDismissal={disablePointerDismissal}
        modal={modal}
        onOpenChange={setOpen}
        open={open}
        showDescription={showDescription}
        showTitle={showTitle}
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

export const Closed: Story = {
  render: ({ title }) => <ConfirmDialog title={title} />,
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', { name: 'Open dialog' })

    await userEvent.click(trigger)
    const body = within(canvasElement.ownerDocument.body)
    await expect(await body.findByRole('dialog', { name: 'Delete this project' })).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => {
      expect(body.queryByRole('dialog', { name: 'Delete this project' })).not.toBeInTheDocument()
    })
    await expect(trigger).toHaveFocus()
  },
}

function OpenDialog({
  modal = true,
  disablePointerDismissal = false,
  showDescription = true,
  showTitle = true,
}: {
  modal?: boolean
  disablePointerDismissal?: boolean
  showDescription?: boolean
  showTitle?: boolean
}) {
  return (
    <Dialog
      description="This removes the project and everything in it. There is no undo."
      disablePointerDismissal={disablePointerDismissal}
      modal={modal}
      onOpenChange={() => undefined}
      open
      showDescription={showDescription}
      showTitle={showTitle}
      title="Delete this project"
    >
      <div style={{ display: 'flex', gap: 'var(--spacer-2)', justifyContent: 'flex-end' }}>
        <Button>Cancel</Button>
        <Button variant="danger">Delete</Button>
      </div>
    </Dialog>
  )
}

export const ModalOpen: Story = {
  render: () => <OpenDialog />,
}

export const HiddenAccessibleNaming: Story = {
  render: () => (
    <OpenDialog
      showDescription={false}
      showTitle={false}
    />
  ),
}

export const NonModal: Story = {
  render: () => <OpenDialog modal={false} />,
}

export const PointerDismissDisabled: Story = {
  render: () => <OpenDialog disablePointerDismissal />,
}

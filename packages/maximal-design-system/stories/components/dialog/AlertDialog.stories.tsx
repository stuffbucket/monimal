import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'

import { Button } from '@maximal/maximal-design-system/primitives'
import '@maximal/maximal-design-system/styles.css'
import { AlertDialog } from '@maximal/maximal-design-system/components'

const DELETE_TITLE = 'Delete this project?'
const SAVE_TITLE = 'Save changes before leaving?'
const ACKNOWLEDGE_TITLE = 'Project no longer exists'
const ACKNOWLEDGE_DESCRIPTION = 'Another window removed this project while you were editing it.'
const DELETE_DESCRIPTION = 'This removes the project and everything in it. There is no undo.'
const SAVE_DESCRIPTION = 'You have unsaved changes. Save them now, or discard them and continue.'

const meta = {
  title: 'Components/AlertDialog',
  component: AlertDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    title: DELETE_TITLE,
    description: DELETE_DESCRIPTION,
    action: <Button variant="danger">Delete</Button>,
  },
  globals: {
    shell: 'design-system',
  },
  parameters: {
    // A modal portals to the document and makes the rest of it inert, so each
    // docs example needs its own frame or one open story covers the page.
    docs: {
      story: { inline: false, height: '320px' },
    },
  },
  argTypes: {
    action: { control: false },
    tertiaryActions: { control: false },
    children: { control: false },
    container: { control: false },
    finalFocus: { control: false },
    popupProps: { control: false },
    onOpenChange: { control: false },
  },
} satisfies Meta<typeof AlertDialog>

export default meta
type Story = StoryObj<typeof meta>

function DeleteProject({ onDelete }: { onDelete: () => void }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)} variant="danger">
        Delete project
      </Button>
      <AlertDialog
        action={(
          <Button
            onClick={() => {
              onDelete()
              setOpen(false)
            }}
            variant="danger"
          >
            Delete
          </Button>
        )}
        description={DELETE_DESCRIPTION}
        onOpenChange={setOpen}
        open={open}
        title={DELETE_TITLE}
      />
    </>
  )
}

const onDelete = fn()

/* Trigger stories render inline in docs so their play functions only run when opened directly. */
const triggerParameters = {
  controls: { disable: true },
  docs: { story: { inline: true } },
}

export const Closed: Story = {
  args: { open: false },
  parameters: triggerParameters,
  render: () => <DeleteProject onDelete={onDelete} />,
  play: async ({ canvasElement }) => {
    onDelete.mockClear()
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    const trigger = canvas.getByRole('button', { name: 'Delete project' })

    await userEvent.click(trigger)
    const alert = await body.findByRole('alertdialog', { name: 'Delete this project?' })
    await waitFor(() => expect(within(alert).getByRole('button', { name: 'Cancel' })).toHaveFocus())
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(body.queryByRole('alertdialog')).not.toBeInTheDocument())
    await expect(trigger).toHaveFocus()
    await expect(onDelete).not.toHaveBeenCalled()

    await userEvent.click(trigger)
    await userEvent.click(
      within(await body.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    )
    await waitFor(() => expect(body.queryByRole('alertdialog')).not.toBeInTheDocument())
    await expect(onDelete).toHaveBeenCalledOnce()
    await expect(trigger).toHaveFocus()
  },
}

export const Open: Story = {}

export const MultipleResponses: Story = {
  args: {
    title: SAVE_TITLE,
    description: SAVE_DESCRIPTION,
    action: <Button variant="primary">Save changes</Button>,
    tertiaryActions: <Button variant="secondary-danger">Discard changes</Button>,
  },
}

export const Pending: Story = {
  args: {
    title: SAVE_TITLE,
    description: SAVE_DESCRIPTION,
    pending: true,
    action: <Button disabled variant="primary">Saving…</Button>,
    tertiaryActions: <Button disabled variant="secondary-danger">Discard changes</Button>,
  },
}

export const Failed: Story = {
  args: {
    title: SAVE_TITLE,
    description: SAVE_DESCRIPTION,
    error: 'Your changes could not be saved.',
    action: <Button variant="primary">Try again</Button>,
  },
}

function ProjectRemoved({ onAcknowledge }: { onAcknowledge: () => void }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)}>Open project</Button>
      <AlertDialog
        description={ACKNOWLEDGE_DESCRIPTION}
        onAcknowledge={onAcknowledge}
        onOpenChange={setOpen}
        open={open}
        title={ACKNOWLEDGE_TITLE}
      />
    </>
  )
}

const onAcknowledge = fn()

export const AcknowledgementClosed: Story = {
  args: { open: false },
  parameters: triggerParameters,
  render: () => <ProjectRemoved onAcknowledge={onAcknowledge} />,
  play: async ({ canvasElement }) => {
    onAcknowledge.mockClear()
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    const trigger = canvas.getByRole('button', { name: 'Open project' })

    await userEvent.click(trigger)
    const alert = await body.findByRole('alertdialog', { name: ACKNOWLEDGE_TITLE })
    await expect(within(alert).queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    await waitFor(() => expect(within(alert).getByRole('button', { name: 'OK' })).toHaveFocus())
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(body.queryByRole('alertdialog')).not.toBeInTheDocument())
    await expect(onAcknowledge).toHaveBeenCalledOnce()
    await expect(trigger).toHaveFocus()
  },
}

export const Acknowledgement: Story = {
  args: {
    title: ACKNOWLEDGE_TITLE,
    description: ACKNOWLEDGE_DESCRIPTION,
    action: undefined,
  },
}

import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import '@maximal/maximal-design-system/styles.css'
import { Menubar } from '@maximal/maximal-design-system/components'

const meta = {
  title: 'Components/Menubar',
  component: Menubar,
  globals: { shell: 'design-system' },
} satisfies Meta<typeof Menubar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    'aria-label': 'Application menu',
    menus: [
      {
        label: 'File',
        items: [
          { label: 'New' },
          { label: 'Open' },
          { label: 'Save' },
        ],
      },
      {
        label: 'Edit',
        items: [
          { label: 'Undo' },
          { label: 'Redo' },
        ],
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const file = canvas.getByRole('menuitem', { name: 'File' })

    await userEvent.click(file)
    const body = within(canvasElement.ownerDocument.body)
    const firstItem = await body.findByRole('menuitem', { name: 'New' })
    await userEvent.keyboard('{ArrowDown}')
    await waitFor(() => expect(firstItem).toHaveFocus())
    await userEvent.keyboard('{ArrowDown}')
    await waitFor(() => expect(body.getByRole('menuitem', { name: 'Open' })).toHaveFocus())
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(body.queryByRole('menu')).not.toBeInTheDocument())
    await waitFor(() => expect(file).toHaveFocus())
  },
}

export const DisabledItem: Story = {
  args: {
    'aria-label': 'Application menu with unavailable actions',
    menus: [
      {
        label: 'File',
        items: [
          { label: 'Save' },
          { label: 'Save as…', disabled: true },
        ],
      },
      {
        label: 'Edit',
        items: [
          { label: 'Undo', disabled: true },
          { label: 'Select all' },
        ],
      },
    ],
  },
}

export const ContentVariations: Story = {
  args: {
    'aria-label': 'Application menu with varied content',
    menus: [
      {
        label: <span>File</span>,
        items: [
          { label: 'Short label' },
          {
            label: (
              <span style={{ display: 'flex', gap: 'var(--spacer-3)' }}>
                Export project
                <span style={{ color: 'var(--maximal-color-text-secondary)' }}>⇧⌘E</span>
              </span>
            ),
          },
        ],
      },
      {
        label: <strong>Help</strong>,
        items: [{ label: 'Documentation' }],
      },
    ],
  },
}

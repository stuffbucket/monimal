import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { Button } from '@maximal/maximal-design-system/primitives'
import '@maximal/maximal-design-system/styles.css'
import { Tooltip } from '@maximal/maximal-design-system/components'

const meta = {
  title: 'Components/Tooltip',
  component: Tooltip,
  globals: { shell: 'design-system' },
} satisfies Meta<typeof Tooltip>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    trigger: <Button>Hover for tooltip</Button>,
    children: 'Helpful context',
  },
}

export const Open: Story = {
  args: {
    defaultOpen: true,
    trigger: <Button>Tooltip trigger</Button>,
    children: 'The tooltip is initially open.',
  },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', { name: 'Tooltip trigger' })
    const body = within(canvasElement.ownerDocument.body)

    trigger.focus()
    await expect(trigger).toHaveFocus()
    const tooltip = await body.findByText('The tooltip is initially open.')
    await expect(tooltip).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(tooltip).not.toBeInTheDocument())
    await expect(trigger).toHaveFocus()
  },
}

export const DisabledControl: Story = {
  args: {
    disabled: true,
    trigger: <Button disabled>Unavailable action</Button>,
    children: 'This tooltip is disabled.',
  },
}

export const ContentVariations: Story = {
  args: {
    defaultOpen: true,
    trigger: <Button>Rich tooltip</Button>,
    children: (
      <span style={{ display: 'grid', gap: 'var(--spacer-1)' }}>
        <strong>Keyboard shortcut</strong>
        <span>Press ⇧⌘P to open commands.</span>
      </span>
    ),
  },
}

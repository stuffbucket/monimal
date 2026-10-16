import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'

import '@maximal/maximal-design-system/styles.css'
import { Collapsible } from '@maximal/maximal-design-system/components'

const meta = {
  title: 'Components/Collapsible',
  component: Collapsible,
  globals: { shell: 'design-system' },
  args: {
    children: 'Content follows Base UI disclosure behavior.',
    title: 'Collapsible details',
  },
} satisfies Meta<typeof Collapsible>

export default meta
type Story = StoryObj<typeof meta>

export const Closed: Story = {
  args: {
    defaultOpen: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole('button', { name: 'Collapsible details' })

    await userEvent.tab()
    await expect(trigger).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await expect(canvas.getByText('Content follows Base UI disclosure behavior.')).toBeVisible()
  },
}

export const Open: Story = {
  args: {
    defaultOpen: true,
  },
}

export const Disabled: Story = {
  args: {
    disabled: true,
  },
}

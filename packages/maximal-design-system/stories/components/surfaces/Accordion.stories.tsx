import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'

import '@maximal/maximal-design-system/styles.css'
import { Accordion } from '@maximal/maximal-design-system/components'

const items = [
  {
    value: 'first',
    title: 'First section',
    content: 'First panel content.',
  },
  {
    value: 'second',
    title: 'Second section',
    content: 'Second panel content.',
  },
] as const

const meta = {
  title: 'Components/Accordion',
  component: Accordion,
  globals: { shell: 'design-system' },
  args: {
    items,
  },
} satisfies Meta<typeof Accordion>

export default meta
type Story = StoryObj<typeof meta>

export const Closed: Story = {
  args: {
    defaultValue: [],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const first = canvas.getByRole('button', { name: 'First section' })
    const second = canvas.getByRole('button', { name: 'Second section' })

    await expect(first).toHaveAttribute('aria-expanded', 'false')
    await expect(second).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(first)
    await expect(first).toHaveAttribute('aria-expanded', 'true')
    await expect(canvas.getByText('First panel content.')).toBeVisible()
    await userEvent.click(second)
    await expect(second).toHaveAttribute('aria-expanded', 'true')
    await expect(first).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(second)
    await expect(second).toHaveAttribute('aria-expanded', 'false')
    await expect(canvas.queryByText('Second panel content.')).not.toBeInTheDocument()
  },
}

export const Open: Story = {
  args: {
    defaultValue: ['first'],
  },
}

export const Disabled: Story = {
  args: {
    items: [
      items[0],
      {
        ...items[1],
        disabled: true,
      },
    ],
  },
}

export const Multiple: Story = {
  args: {
    defaultValue: ['first', 'second'],
    multiple: true,
  },
}

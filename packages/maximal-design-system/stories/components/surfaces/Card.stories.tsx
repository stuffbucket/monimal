import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import '@maximal/maximal-design-system/styles.css'
import { Card } from '@maximal/maximal-design-system/components'

const meta = {
  title: 'Components/Card',
  component: Card,
  globals: { shell: 'design-system' },
  args: {
    children: 'Selectable card option',
    onSelect: fn(),
    selected: false,
  },
  render: (args) => (
    <div
      aria-label="Card options"
      role="listbox"
      style={{ width: 'var(--width-content-standard)' }}
    >
      <Card {...args} />
    </div>
  ),
} satisfies Meta<typeof Card>

export default meta
type Story = StoryObj<typeof meta>

export const Unselected: Story = {
  play: async ({ args, canvasElement }) => {
    const option = within(canvasElement).getByRole('option', { name: 'Selectable card option' })

    await userEvent.tab()
    await expect(option).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect(args.onSelect).toHaveBeenCalledOnce()
  },
}

export const Selected: Story = {
  args: {
    selected: true,
  },
}

export const Disabled: Story = {
  args: {
    disabled: true,
  },
}

import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import '@maximal/maximal-design-system/styles.css'
import { Callout } from '@maximal/maximal-design-system/components'

const meta = {
  title: 'Components/Callout',
  component: Callout,
  globals: { shell: 'design-system' },
  args: {
    children: 'This callout participates in a listbox selection model.',
    onSelect: fn(),
    selected: false,
    title: 'Selectable callout option',
  },
  render: (args) => (
    <div
      aria-label="Callout options"
      role="listbox"
      style={{ width: 'var(--width-content-standard)' }}
    >
      <Callout {...args} />
    </div>
  ),
} satisfies Meta<typeof Callout>

export default meta
type Story = StoryObj<typeof meta>

export const Unselected: Story = {
  play: async ({ args, canvasElement }) => {
    const option = within(canvasElement).getByRole('option', {
      name: /Selectable callout option/,
    })

    await userEvent.tab()
    await expect(option).toHaveFocus()
    await userEvent.keyboard(' ')
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

import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import '@maximal/maximal-design-system/styles.css'
import {
  Button,
  ControlButton,
  IconButton,
  ToggleButton,
} from '@maximal/maximal-design-system/primitives'
import { SearchIcon } from '@maximal/maximal-design-system/icons'

const meta = {
  title: 'Components/Button',
  component: Button,
  globals: { shell: 'design-system' },
  args: {
    children: 'Run',
    onClick: fn(),
  },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

const forwardedRef = fn()

export const Secondary: Story = {}

export const Primary: Story = {
  args: { variant: 'primary' },
}

export const Danger: Story = {
  args: { variant: 'danger' },
}

export const Disabled: Story = {
  args: { disabled: true },
}

export const KeyboardActivation: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const button = canvas.getByRole('button', { name: 'Run' })

    await userEvent.tab()
    await expect(button).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect(args.onClick).toHaveBeenCalledOnce()
  },
}

export const NativeContract: Story = {
  render: () => (
    <Button data-purpose="native-contract" ref={forwardedRef}>
      Run
    </Button>
  ),
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Run' })

    await expect(button).toHaveAttribute('data-purpose', 'native-contract')
    await expect(forwardedRef).toHaveBeenCalledWith(button)
  },
}

export const ControlVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 'var(--spacer-2)' }}>
      <ControlButton>Control</ControlButton>
      <ToggleButton selected>Selected toggle</ToggleButton>
      <IconButton label="Search">
        <SearchIcon />
      </IconButton>
    </div>
  ),
}

import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'

import '@maximal/maximal-design-system/styles.css'
import { Slider } from '@maximal/maximal-design-system/components'

const meta = {
  title: 'Components/Slider',
  component: Slider,
  globals: { shell: 'design-system' },
  args: {
    label: 'Opacity',
    min: 0,
    max: 100,
  },
} satisfies Meta<typeof Slider>

export default meta
type Story = StoryObj<typeof meta>

export const Uncontrolled: Story = {
  args: { defaultValue: 40 },
  play: async ({ canvasElement }) => {
    const slider = within(canvasElement).getByRole('slider', { name: 'Opacity' })

    await userEvent.click(slider)
    await userEvent.keyboard('{ArrowRight}')
    await expect(slider).toHaveAttribute('aria-valuenow', '41')
  },
}

function ControlledSlider() {
  const [value, setValue] = useState(60)
  return <Slider label="Opacity" max={100} min={0} value={value} onValueChange={setValue} />
}

export const Controlled: Story = {
  render: () => <ControlledSlider />,
}

export const Minimum: Story = {
  args: { defaultValue: 0 },
}

export const Maximum: Story = {
  args: { defaultValue: 100 },
}

export const Disabled: Story = {
  args: { defaultValue: 40, disabled: true },
}

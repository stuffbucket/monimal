import { RadioGroup as BaseRadioGroup } from '@base-ui/react/radio-group'
import type { Meta, StoryObj } from '@storybook/react-vite'

import '../styles/index.css'
import { Radio } from './form-controls'

function RadioState({
  disabled = false,
  readOnly = false,
  required = false,
  selected = false,
}: {
  disabled?: boolean
  readOnly?: boolean
  required?: boolean
  selected?: boolean
}) {
  return (
    <BaseRadioGroup value={selected ? 'comfortable' : 'compact'}>
      <Radio
        disabled={disabled}
        label="Comfortable"
        readOnly={readOnly}
        required={required}
        value="comfortable"
      />
    </BaseRadioGroup>
  )
}

const meta = {
  title: 'Components/Radio',
  component: Radio,
  globals: { shell: 'design-system' },
  args: {
    label: 'Comfortable',
    value: 'comfortable',
  },
  render: () => <RadioState />,
} satisfies Meta<typeof Radio>

export default meta
type Story = StoryObj<typeof meta>

export const Unselected: Story = {}

export const Selected: Story = {
  render: () => <RadioState selected />,
}

export const Disabled: Story = {
  render: () => <RadioState disabled />,
}

export const DisabledSelected: Story = {
  render: () => <RadioState disabled selected />,
}

export const Required: Story = {
  render: () => <RadioState required />,
}

export const ReadOnly: Story = {
  render: () => <RadioState readOnly selected />,
}

import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

import '../styles/index.css'
import { UnitValueInput } from './form-controls'

const units = [
  {
    value: 'px',
    label: 'px',
    step: 1,
    fromCanonical: (value: number) => value,
    toCanonical: (value: number) => value,
  },
  {
    value: 'rem',
    label: 'rem',
    step: 0.25,
    fromCanonical: (value: number) => value / 16,
    toCanonical: (value: number) => value * 16,
  },
] as const

function UnitValueState({
  defaultUnit = 'px',
  disabled = false,
  initialValue = 16,
  maximum,
  minimum,
}: {
  defaultUnit?: 'px' | 'rem'
  disabled?: boolean
  initialValue?: number
  maximum?: number
  minimum?: number
}) {
  const [value, setValue] = useState(initialValue)
  return (
    <UnitValueInput
      defaultUnit={defaultUnit}
      disabled={disabled}
      label="Spacing"
      maximum={maximum}
      minimum={minimum}
      onCommit={setValue}
      units={units}
      value={value}
    />
  )
}

const meta = {
  title: 'Components/UnitValueInput',
  component: UnitValueInput,
  globals: { shell: 'design-system' },
  args: {
    defaultUnit: 'px',
    label: 'Spacing',
    onCommit: () => undefined,
    units,
    value: 16,
  },
  render: () => <UnitValueState />,
} satisfies Meta<typeof UnitValueInput>

export default meta
type Story = StoryObj<typeof meta>

export const DefaultUnit: Story = {}

export const AlternateUnit: Story = {
  render: () => <UnitValueState defaultUnit="rem" />,
}

export const Zero: Story = {
  render: () => <UnitValueState initialValue={0} />,
}

export const Bounded: Story = {
  render: () => <UnitValueState initialValue={24} maximum={32} minimum={8} />,
}

export const Disabled: Story = {
  render: () => <UnitValueState disabled />,
}

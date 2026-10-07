import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

import '../styles/index.css'
import {
  Autocomplete,
  Checkbox,
  Field,
  Fieldset,
  NumberInput,
  RadioGroup,
  Select,
  Slider,
  Switch,
  UnitValueInput,
} from './form-controls'

const meta = {
  title: 'Components/Form controls',
  globals: { shell: 'design-system' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

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

function FormControlsShowcase() {
  const [select, setSelect] = useState('canvas')
  const [checked, setChecked] = useState(true)
  const [radio, setRadio] = useState('comfortable')
  const [switched, setSwitched] = useState(true)
  const [slider, setSlider] = useState(40)
  const [number, setNumber] = useState<number | null>(8)
  const [unitValue, setUnitValue] = useState(16)
  const [query, setQuery] = useState('')

  return (
    <div style={{ display: 'grid', gap: 'var(--spacer-4)', maxWidth: 'var(--width-content-standard)' }}>
      <Select
        label="Surface"
        value={select}
        onValueChange={setSelect}
        options={[
          { value: 'canvas', label: 'Canvas' },
          { value: 'terminal', label: 'Terminal' },
          { value: 'settings', label: 'Settings' },
        ]}
      />
      <Checkbox
        checked={checked}
        label="Show grid"
        onCheckedChange={setChecked}
      />
      <RadioGroup
        aria-label="Density"
        value={radio}
        onValueChange={setRadio}
        options={[
          { value: 'compact', label: 'Compact' },
          { value: 'comfortable', label: 'Comfortable' },
        ]}
      />
      <Switch
        checked={switched}
        label="Live updates"
        onCheckedChange={setSwitched}
      />
      <Slider
        label="Opacity"
        value={slider}
        onValueChange={setSlider}
      />
      <NumberInput
        label="Columns"
        value={number}
        min={1}
        max={24}
        onValueChange={setNumber}
      />
      <UnitValueInput
        label="Spacing"
        value={unitValue}
        units={units}
        defaultUnit="px"
        minimum={0}
        onCommit={setUnitValue}
      />
      <Autocomplete
        label="Command"
        items={['Open project', 'Open settings', 'Open terminal']}
        placeholder="Search commands"
        value={query}
        onValueChange={setQuery}
      />
      <Fieldset legend="Notes">
        <Field
          label="Description"
          description="Shown to everyone with access to this project."
          textareaProps={{ defaultValue: 'A reusable Base UI field.', rows: 4 }}
        />
      </Fieldset>
    </div>
  )
}

export const AllControls: Story = {
  render: () => <FormControlsShowcase />,
}

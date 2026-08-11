import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  Checkbox,
  Field,
  FormField,
  RadioGroup,
  Select,
  Switch,
  TextInput,
  Textarea,
} from './Fields.js';

/**
 * `FormField` owns the wiring — `aria-describedby`, `aria-invalid`, and the
 * label's `htmlFor` — and hands it to whatever control it wraps. So the
 * interesting states are the field's, not the input's.
 */
const meta = {
  title: 'Controls/FormField',
  component: FormField,
  args: {
    label: 'Working directory',
    hint: undefined,
    error: undefined,
    // Supplied by `render`; declared here because the prop is required.
    children: () => null,
  },
  argTypes: {
    hint: { control: 'text' },
    error: { control: 'text' },
    children: { table: { disable: true } },
  },
  render: (args) => (
    <div style={{ width: 380 }}>
      <FormField {...args}>
        {(field) => <TextInput {...field} value="~/github" onChange={() => undefined} />}
      </FormField>
    </div>
  ),
} satisfies Meta<typeof FormField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithHint: Story = {
  args: { hint: 'Where the agent runs commands.' },
};

/**
 * The error is announced, not just coloured. `role="alert"` on the message and
 * `aria-invalid` on the control; both come from the field, so a caller cannot
 * forget one.
 */
export const Invalid: Story = {
  args: { error: 'That path does not exist.' },
};

export const HintAndError: Story = {
  args: {
    hint: 'Where the agent runs commands.',
    error: 'That path does not exist.',
  },
};

/* ------------------------------------------------------------- the controls */

const APPROVAL = [
  { value: 'writes' as const, label: 'Anything that changes files' },
  { value: 'all' as const, label: 'Every tool' },
  { value: 'none' as const, label: 'Never ask' },
];

/** Every control a field can wrap, in one place, so the sizes can be compared. */
export const AllControls: StoryObj = {
  name: 'All controls',
  render: function AllControlsStory() {
    const [text, setText] = useState('');
    const [long, setLong] = useState('');
    const [choice, setChoice] = useState<'writes' | 'all' | 'none'>('writes');
    const [radio, setRadio] = useState<'a' | 'b'>('a');
    const [checked, setChecked] = useState(true);
    const [on, setOn] = useState(true);

    return (
      <div style={{ width: 380, display: 'grid', gap: 'var(--space-4)' }}>
        <FormField label="Name">
          {(field) => (
            <TextInput {...field} value={text} onChange={setText} placeholder="Untitled" />
          )}
        </FormField>

        <FormField label="Prompt">
          {(field) => (
            <Textarea {...field} value={long} onChange={setLong} placeholder="Ask anything…" />
          )}
        </FormField>

        <FormField label="Ask before running">
          {(field) => (
            <Select {...field} value={choice} onChange={setChoice} options={APPROVAL} />
          )}
        </FormField>

        <FormField label="Disabled">
          {(field) => (
            <Select {...field} value={choice} onChange={setChoice} options={APPROVAL} disabled />
          )}
        </FormField>

        <FormField label="Toolset">
          {(field) => (
            <RadioGroup
              {...field}
              value={radio}
              onChange={setRadio}
              options={[
                { value: 'a', label: 'Application' },
                { value: 'b', label: 'Everything' },
              ]}
            />
          )}
        </FormField>

        <Checkbox label="Follow the system theme" checked={checked} onChange={setChecked} />
        <Checkbox label="Disabled" checked={false} onChange={() => undefined} disabled />

        <Switch label="Dock badge" checked={on} onChange={setOn} />

        {/* Not a form control despite the name it has always had: it renders
            what something is, not somewhere to change it. */}
        <div>
          <Field label="Kind" value="component" />
          <Field label="Edited" value="4 minutes ago" />
        </div>
      </div>
    );
  },
};

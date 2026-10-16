import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'

import '@maximal/maximal-design-system/styles.css'
import { Field, Fieldset } from '@maximal/maximal-design-system/components'

const fields = (
  <>
    <Field label="Name" textareaProps={{ defaultValue: 'Canvas project', rows: 2 }} />
    <Field
      description="Shown to project collaborators."
      label="Description"
      textareaProps={{ defaultValue: 'Workspace notes', rows: 3 }}
    />
  </>
)

const meta = {
  title: 'Components/Fieldset',
  component: Fieldset,
  globals: { shell: 'design-system' },
  args: {
    children: fields,
    legend: 'Project details',
  },
} satisfies Meta<typeof Fieldset>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const name = canvas.getByRole('textbox', { name: 'Name' })
    const description = canvas.getByRole('textbox', { name: 'Description' })

    await userEvent.click(name)
    await userEvent.tab()
    await expect(description).toHaveFocus()
    await userEvent.clear(description)
    await userEvent.type(description, 'Updated workspace notes')
    await expect(description).toHaveValue('Updated workspace notes')
  },
}

export const Disabled: Story = {
  args: { disabled: true },
}

export const RequiredField: Story = {
  args: {
    children: (
      <Field
        label="Description"
        textareaProps={{ placeholder: 'Required', required: true, rows: 3 }}
      />
    ),
  },
}

export const ReadOnlyField: Story = {
  args: {
    children: (
      <Field
        label="Description"
        textareaProps={{ defaultValue: 'Read-only project notes', readOnly: true, rows: 3 }}
      />
    ),
  },
}

export const InvalidField: Story = {
  args: {
    children: (
      <Field
        error="Description is required."
        label="Description"
        textareaProps={{ rows: 3 }}
      />
    ),
  },
}

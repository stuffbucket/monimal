import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'

import '@maximal/maximal-design-system/styles.css'
import { Field } from '@maximal/maximal-design-system/components'

const meta = {
  title: 'Components/Field',
  component: Field,
  globals: { shell: 'design-system' },
  args: {
    label: 'Description',
  },
} satisfies Meta<typeof Field>

export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {
  args: { textareaProps: { placeholder: 'Describe this project', rows: 4 } },
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole('textbox', { name: 'Description' })

    await userEvent.click(field)
    await userEvent.type(field, 'Keyboard-authored project notes')
    await expect(field).toHaveValue('Keyboard-authored project notes')
  },
}

export const WithValue: Story = {
  args: { textareaProps: { defaultValue: 'A reusable Base UI field.', rows: 4 } },
}

export const WithDescription: Story = {
  args: {
    description: 'Shown to everyone with access to this project.',
    textareaProps: { defaultValue: 'Project notes', rows: 4 },
  },
}

export const Required: Story = {
  args: {
    textareaProps: { placeholder: 'Required', required: true, rows: 4 },
  },
}

export const ReadOnly: Story = {
  args: {
    textareaProps: { defaultValue: 'Read-only description', readOnly: true, rows: 4 },
  },
}

export const Disabled: Story = {
  args: {
    disabled: true,
    textareaProps: { defaultValue: 'Disabled description', rows: 4 },
  },
}

export const Invalid: Story = {
  args: {
    error: 'Description is required.',
    textareaProps: { rows: 4 },
  },
}

import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from './Button.js';
import { UnsavedChangesDialog } from './UnsavedChangesDialog.js';

const meta = {
  title: 'Controls/UnsavedChangesDialog',
  component: UnsavedChangesDialog,
  args: {
    open: false,
    onSave: () => undefined,
    onDiscard: () => undefined,
    onCancel: () => undefined,
  },
  argTypes: { open: { table: { disable: true } } },
} satisfies Meta<typeof UnsavedChangesDialog>;

export default meta;

function Example() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>Leave page</Button>
      <UnsavedChangesDialog
        open={open}
        onSave={() => setOpen(false)}
        onDiscard={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

export const Default: StoryObj<typeof meta> = {
  render: () => <Example />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Leave page' }));
    const dialog = await within(document.body).findByTestId('unsaved-changes-dialog');
    await expect(dialog).toHaveAccessibleName('Save changes before leaving?');
    await expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    await expect(within(dialog).getByRole('button', { name: 'Discard changes' })).toBeInTheDocument();
    await expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  },
};
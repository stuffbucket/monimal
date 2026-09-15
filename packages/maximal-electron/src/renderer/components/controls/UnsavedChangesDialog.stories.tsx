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

function Example({
  saving = false,
}: {
  saving?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>Leave page</Button>
      <UnsavedChangesDialog
        open={open}
        saving={saving}
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
    const leave = within(canvasElement).getByRole('button', { name: 'Leave page' });
    await userEvent.click(leave);
    const dialog = await within(document.body).findByTestId('unsaved-changes-dialog');
    await expect(dialog).toHaveAccessibleName('Save changes before leaving?');
    await expect(dialog).toHaveAccessibleDescription(
      'You have unsaved changes. Save them now, or discard them and continue.',
    );
    await expect(
      within(dialog).getAllByRole('heading', { name: 'Save changes before leaving?' }),
    ).toHaveLength(1);
    await expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    await expect(within(dialog).getByRole('button', { name: 'Discard changes' })).toBeInTheDocument();
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    await expect(cancel).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await expect(within(document.body).queryByTestId('unsaved-changes-dialog')).not.toBeInTheDocument();
    await expect(leave).toHaveFocus();

    await userEvent.click(leave);
    const reopened = await within(document.body).findByTestId('unsaved-changes-dialog');
    await userEvent.click(within(reopened).getByRole('button', { name: 'Cancel' }));
    await expect(leave).toHaveFocus();
  },
};

export const Saving: StoryObj<typeof meta> = {
  render: () => <Example saving />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Leave page' }));
    const dialog = await within(document.body).findByTestId('unsaved-changes-dialog');
    await expect(within(dialog).getByRole('button', { name: 'Saving…' })).toBeDisabled();
    await expect(within(dialog).getByRole('button', { name: 'Discard changes' })).toBeDisabled();
    await expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    await expect(dialog).toBeInTheDocument();
    const scrim = document.querySelector<HTMLElement>('.dialog__scrim');
    if (scrim === null) throw new Error('Dialog scrim was not rendered');
    await userEvent.click(scrim);
    await expect(dialog).toBeInTheDocument();
  },
};
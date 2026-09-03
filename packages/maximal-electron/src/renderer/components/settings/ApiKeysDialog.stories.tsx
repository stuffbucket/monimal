import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { LOREM_CONTENT } from '../../lib/content-lorem.js';
import { ShellContentProvider } from '../../lib/content.js';
import { SAMPLE_CLIENTS, SAMPLE_ENDPOINT } from '../../lib/sample-settings.js';
import type { ApiClient } from '../../lib/settings.js';

import { ApiKeysDialog } from './ApiKeysDialog.js';

/**
 * The keys dialog.
 *
 * Every value here says what it is. There is no credential in this repository
 * and there must not be one in a story either.
 */
function KeysStory({
  clients: initial,
  withEndpoint,
}: {
  clients: ApiClient[];
  withEndpoint: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [clients, setClients] = useState(initial);

  return (
    <ApiKeysDialog
      open={open}
      onOpenChange={setOpen}
      endpoint={withEndpoint ? SAMPLE_ENDPOINT : undefined}
      clients={clients}
      onAddClient={(label) => {
        setClients((prev) => [
          ...prev,
          {
            id: `client-${String(prev.length + 1)}`,
            label,
            key: 'example-not-a-real-key',
            enabled: true,
          },
        ]);
      }}
      onRemoveClient={(id) => {
        setClients((prev) => prev.filter((client) => client.id !== id));
      }}
      onToggleClient={(id, enabled) => {
        setClients((prev) =>
          prev.map((client) => (client.id === id ? { ...client, enabled } : client)),
        );
      }}
    />
  );
}

const meta = {
  title: 'Settings/ApiKeysDialog',
  component: KeysStory,
  args: { clients: SAMPLE_CLIENTS, withEndpoint: true },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof KeysStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const NoClients: Story = {
  name: 'No connections yet',
  args: { clients: [] },
};

export const NoEndpoint: Story = {
  name: 'No endpoint to state',
  args: { withEndpoint: false },
};

/** A key is bullets until somebody asks for it. */
export const Revealed: Story = {
  play: async () => {
    const dialog = within(await within(document.body).findByTestId('settings-api-keys'));
    const value = dialog.getByTestId('client-client-1-key');

    await expect(value).toHaveTextContent(/^•+$/);
    await userEvent.click(
      dialog.getByRole('button', { name: 'Reveal the Claude Code key' }),
    );
    await expect(value).toHaveTextContent('example-not-a-real-key');
  },
};

/** An empty name is refused, and says why. */
export const EmptyLabelRefused: Story = {
  name: 'Empty name refused',
  play: async () => {
    const dialog = within(await within(document.body).findByTestId('settings-api-keys'));

    await userEvent.click(dialog.getByTestId('client-add'));
    await expect(dialog.getByRole('alert')).toHaveTextContent(
      'Give this connection a name.',
    );
  },
};

/**
 * The dialog with no copy decided yet.
 *
 * The stub half of the catalogue, and the one place it can be seen for a
 * dialog: `tests/content-seam.test.ts` renders the other surfaces from it and
 * fails on English that reaches the DOM, but Radix portals this one and the
 * test environment has no document to portal into. `eslint/shell.mjs` reads
 * the source instead, and this is the eye on it.
 */
export const StubContent: Story = {
  name: 'Stub content',
  render: (args) => (
    <ShellContentProvider content={LOREM_CONTENT}>
      <KeysStory {...args} />
    </ShellContentProvider>
  ),
};

import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { Status, StatusProvider, StatusViewport } from './Status.js';

function StatusSurface() {
  return (
    <StatusProvider>
      <div
        className="sb-shell"
        style={{ display: 'grid', minHeight: 160, padding: 24, placeItems: 'end stretch' }}
      >
        <footer className="statusbar">
          <StatusViewport />
        </footer>
        <Status id="sync" order={20}>
          Synchronizing workspace
        </Status>
        <Status id="account" order={10} dismissible={false}>
          Connected as Octocat
        </Status>
      </div>
    </StatusProvider>
  );
}

const meta = {
  title: 'Shell/Status',
  component: StatusViewport,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof StatusViewport>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Paginated: Story = {
  render: () => <StatusSurface />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Connected as Octocat')).toBeVisible();
    await expect(canvas.getByLabelText('Status 1 of 2')).toHaveTextContent('1 / 2');
    await expect(canvas.queryByRole('button', { name: 'Dismiss status' })).toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: 'Next status' }));
    await expect(canvas.getByText('Synchronizing workspace')).toBeVisible();
    await expect(canvas.getByLabelText('Status 2 of 2')).toHaveTextContent('2 / 2');

    await userEvent.click(canvas.getByRole('button', { name: 'Dismiss status' }));
    await expect(canvas.getByText('Connected as Octocat')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Next status' })).toBeNull();
    await expect(canvas.queryByRole('button', { name: 'Dismiss status' })).toBeNull();
  },
};

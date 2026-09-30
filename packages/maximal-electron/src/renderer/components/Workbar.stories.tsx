import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { Workbar, type WorkbarItem } from './Workbar.js';

const ITEMS: WorkbarItem<string>[] = [
  { id: 'map', label: 'Workspace map', icon: 'map' },
  { id: 'overview', label: 'Overview', icon: 'document' },
  { id: 'traffic', label: 'Traffic', icon: 'folder' },
  { id: 'terminal:one', label: 'Terminal', icon: 'terminal' },
  { id: 'browser:one', label: 'Browser', icon: 'browser' },
];

function Example() {
  const [current, setCurrent] = useState('overview');
  return (
    <div className="sb-shell" style={{ width: 'var(--shell-workbar-width)', height: '100vh' }}>
      <Workbar
        items={ITEMS}
        current={current}
        onSelect={setCurrent}
        account={{ id: 'octocat', displayName: 'Octocat', handle: '@octocat' }}
        onOpenProfileSurface={() => undefined}
        onSignOut={() => undefined}
        settingsOpen={false}
        onToggleSettings={() => undefined}
      />
    </div>
  );
}

const meta = {
  title: 'Layout/Workbar',
  component: Example,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Example>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const terminal = canvas.getByRole('button', { name: 'Terminal' });
    await userEvent.click(terminal);
    await expect(terminal).toHaveAttribute('aria-current', 'true');
  },
};

import { useState } from 'react';
import type { Meta, StoryObj } from '@maximal/maximal-storybook';
import { expect, userEvent, within } from '@maximal/maximal-storybook/test';

import { Workbar, type WorkbarItem } from './Workbar.js';

const ITEMS: WorkbarItem<string>[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'projects', label: 'Projects', icon: 'folder' },
  { id: 'overview', label: 'Overview', icon: 'overview' },
  { id: 'traffic', label: 'Traffic', icon: 'traffic' },
  { id: 'terminal:one', label: 'Terminal', icon: 'terminal' },
  { id: 'browser:one', label: 'Browser', icon: 'browser' },
];

function Example() {
  const [current, setCurrent] = useState('overview');
  return (
    <div className="sb-shell" style={{ display: 'flex', height: '100vh' }}>
      <aside className="activity-rail">
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
      </aside>
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
    await expect(canvas.getByRole('navigation', { name: 'Workspace views' })).toHaveStyle({
      width: '48px',
      padding: '8px',
    });
    await expect(canvasElement.querySelector('.activity-rail')).toHaveStyle({
      width: '48px',
      minWidth: '48px',
    });
    await expect(terminal).toHaveStyle({
      width: '32px',
      height: '32px',
    });
    await expect(terminal.querySelector('svg')).toHaveStyle({
      width: '24px',
      height: '24px',
      transform: 'matrix(1.11111, 0, 0, 1.11111, 0, 0)',
    });
    await expect(canvas.getByRole('button', { name: 'Traffic' }).querySelector('svg')).toHaveStyle({
      transform: 'none',
    });
    await expect(canvas.getByRole('button', { name: 'Home' }).querySelector('svg')).toHaveAttribute('data-shell-icon', 'home');
    await expect(canvas.getByRole('button', { name: 'Overview' }).querySelector('svg')).toHaveAttribute('data-shell-icon', 'overview');
    await expect(canvas.getByRole('button', { name: 'Traffic' }).querySelector('svg')).toHaveAttribute('data-shell-icon', 'traffic');
    await expect(canvas.getByTestId('profile')).toHaveStyle({
      width: '32px',
      height: '32px',
    });
    await expect(canvas.getByTestId('toggle-settings')).toHaveStyle({
      width: '32px',
      height: '32px',
    });
  },
};

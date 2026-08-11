import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { SAMPLE_APPS } from '../../lib/sample-settings.js';
import type { AppIntegration } from '../../lib/settings.js';

import { AppTogglesDialog } from './AppTogglesDialog.js';

function AppsStory({ apps: initial }: { apps: AppIntegration[] }) {
  const [open, setOpen] = useState(true);
  const [apps, setApps] = useState(initial);

  return (
    <AppTogglesDialog
      open={open}
      onOpenChange={setOpen}
      apps={apps}
      onToggle={(id, enabled) => {
        setApps((prev) => prev.map((app) => (app.id === id ? { ...app, enabled } : app)));
      }}
      onRescan={() => undefined}
    />
  );
}

const meta = {
  title: 'Settings/AppTogglesDialog',
  component: AppsStory,
  args: { apps: SAMPLE_APPS },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AppsStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Ready, needs installing, and not built yet — the three states at once. */
export const Open: Story = {};

/**
 * Enabling refused rather than overwriting.
 *
 * The application already carries a setting somebody else put there, so the
 * card says what was left alone and what to do about it.
 */
export const Conflict: Story = {
  args: {
    apps: [
      {
        id: 'claude-code',
        name: 'Claude Code',
        status: 'ready',
        enabled: false,
        path: '~/.claude/settings.json',
        conflict:
          'Claude Code already has a base URL set by you or another tool. Remove that line, then switch this on again.',
      },
    ],
  },
};

export const Empty: Story = {
  args: { apps: [] },
};

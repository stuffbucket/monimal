import type { Meta, StoryObj } from '@storybook/react-vite';

import { SAMPLE_DIAGNOSTICS } from '../../lib/sample-settings.js';

import { Diagnostics } from './Diagnostics.js';

const RUNTIME = {
  id: 'runtime',
  label: 'Runtime',
  entries: [
    { label: 'Application', value: '0.0.0' },
    { label: 'Electron', value: '43.2.0' },
    { label: 'Platform', value: 'darwin arm64' },
    { label: 'Packaged', value: 'false' },
  ],
};

const meta = {
  title: 'Settings/Diagnostics',
  component: Diagnostics,
  args: {
    groups: [RUNTIME, ...SAMPLE_DIAGNOSTICS],
    logs: { path: '~/.local/share/stuffbucket/logs', retentionDays: 7 },
    onRevealLogs: () => undefined,
    onRevealConfig: () => undefined,
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Diagnostics>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Report: Story = {};

/** A failure colours its own value rather than adding a badge beside it. */
export const WithFailure: Story = {
  name: 'A failing check',
  args: {
    groups: [
      {
        id: 'connection',
        label: 'Connection',
        entries: [
          { label: 'Provider', value: 'Unreachable', status: 'failed' },
          { label: 'Last attempt', value: '2 minutes ago' },
        ],
      },
    ],
  },
};

/** No host to reveal a folder with, so neither button is offered. */
export const NoHostActions: Story = {
  name: 'No host actions',
  args: { logs: undefined, onRevealLogs: undefined, onRevealConfig: undefined },
};

export const Empty: Story = {
  args: { groups: [], logs: undefined },
};

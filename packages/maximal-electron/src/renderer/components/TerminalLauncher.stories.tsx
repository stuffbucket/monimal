import type { Meta, StoryObj } from '@storybook/react-vite';

import { TerminalLauncher } from './TerminalLauncher.js';

const meta = {
  title: 'Terminal/TerminalLauncher',
  component: TerminalLauncher,
  args: {
    open: true,
    onOpenChange: () => undefined,
    profiles: async () => [{ id: 'local', label: 'Local', kind: 'local' }],
    discover: async () => ({
      generation: 1,
      targets: [{ id: 'local', profileId: 'local', label: 'This computer', state: 'available' }],
    }),
    launch: async () => ({ sessionId: 'story-session', label: 'Local' }),
    onLaunched: () => undefined,
  },
} satisfies Meta<typeof TerminalLauncher>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
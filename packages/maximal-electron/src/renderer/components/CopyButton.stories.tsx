import type { Meta, StoryObj } from '@storybook/react-vite';

import { CopyButton } from './CopyButton.js';

const meta = {
  title: 'Components/CopyButton',
  component: CopyButton,
  args: {
    text: 'https://example.com/logs',
    about: 'log path',
  },
} satisfies Meta<typeof CopyButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
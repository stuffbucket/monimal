import type { Meta, StoryObj } from '@storybook/react-vite';

import { WindowChrome } from './WindowChrome.js';

const meta = {
  title: 'Shell/WindowChrome',
  component: WindowChrome,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof WindowChrome>;

export default meta;

export const Default: StoryObj = {
  render: () => (
    <div style={{ height: 560 }}>
      <WindowChrome
        layoutId="welcome-story"
        tab={{ id: 'welcome', title: 'Welcome' }}
        tabsLabel="Welcome"
      >
        <main style={{ padding: 24 }}>Single-document content</main>
      </WindowChrome>
    </div>
  ),
};
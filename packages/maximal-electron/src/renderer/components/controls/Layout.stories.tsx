import { FolderOpen } from 'lucide-react';
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from './Button.js';
import { Field } from './Fields.js';
import {
  Banner,
  EmptyState,
  InspectorPanel,
  StatusChip,
  Toolbar,
  ViewModeSwitch,
  type ViewMode,
} from './Layout.js';

const meta = {
  title: 'Controls/Banner',
  component: Banner,
  args: { children: 'An update is available.', status: undefined },
  argTypes: {
    status: {
      control: 'inline-radio',
      options: [undefined, 'running', 'blocked', 'done', 'failed'],
    },
    children: { control: 'text' },
    action: { table: { disable: true } },
  },
  render: (args) => (
    <div style={{ width: 560 }}>
      <Banner {...args} />
    </div>
  ),
} satisfies Meta<typeof Banner>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The usual occupant of `ShellLayout`'s `top` slot: something addressing the
 * whole window rather than one panel.
 */
export const Default: Story = {};

export const Warning: Story = {
  args: {
    status: 'blocked',
    children: 'No local model is running.',
    onDismiss: () => undefined,
  },
};

export const Failed: Story = {
  args: {
    status: 'failed',
    children: 'The last save failed.',
    action: <Button size="sm">Retry</Button>,
  },
};

/* -------------------------------------------------------------- the others */

export const Chips: StoryObj = {
  name: 'StatusChip',
  render: () => (
    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
      <StatusChip status="running" label="Running" />
      <StatusChip status="blocked" label="Needs approval" />
      <StatusChip status="done" label="Done" />
      <StatusChip status="failed" label="Failed" />
      <StatusChip status="none" label="No status" />
    </div>
  ),
};

export const Empty: StoryObj = {
  name: 'EmptyState',
  render: () => (
    <div
      style={{
        width: 420,
        height: 160,
        display: 'grid',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <EmptyState icon={FolderOpen} message="Nothing here yet." />
    </div>
  ),
};

export const ToolbarStory: StoryObj = {
  name: 'Toolbar',
  render: function ToolbarRender() {
    const [mode, setMode] = useState<ViewMode>('grid');
    return (
      <div style={{ width: 520, border: '1px solid var(--border-subtle)' }}>
        {/* h2 rather than h1: a page has one, and this is not the page. */}
        <Toolbar title="Library" mode={mode} onModeChange={setMode} as="h2" />
      </div>
    );
  },
};

export const ModeSwitch: StoryObj = {
  name: 'ViewModeSwitch',
  render: function ModeSwitchRender() {
    const [mode, setMode] = useState<ViewMode>('grid');
    return <ViewModeSwitch mode={mode} onChange={setMode} />;
  },
};

export const Inspector: StoryObj = {
  name: 'InspectorPanel',
  render: () => (
    <div
      style={{
        width: 320,
        height: 220,
        display: 'flex',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <InspectorPanel title="Properties">
        <Field label="Name" value="Design system" />
        <Field label="Author" value="brian" />
      </InspectorPanel>
    </div>
  ),
};

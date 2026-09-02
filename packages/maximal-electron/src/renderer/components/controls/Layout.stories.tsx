import { FolderOpen } from 'lucide-react';
import { useState } from 'react';
import { expect, within } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from './Button.js';
import { Field } from './Fields.js';
import {
  Banner,
  EmptyState,
  InspectorPanel,
  Note,
  StatusChip,
  Toolbar,
  ViewModeSwitch,
  type ViewMode,
} from './Layout.js';

/**
 * The host's half of the status contract, as `e2e/fixtures/demo-shell/demo.css`
 * writes it.
 *
 * Each state takes the token `controls.css` maps it to, so a mapped story
 * measures one colour under either stylesheet.
 */
const HOST_CSS = `
  [data-status='running'] { --shell-status: var(--accent); --shell-status-muted: var(--accent-soft); }
  [data-status='blocked'] { --shell-status: var(--warning); --shell-status-muted: var(--warning-soft); }
  [data-status='done'] { --shell-status: var(--success); --shell-status-muted: var(--success-soft); }
  [data-status='failed'] { --shell-status: var(--danger); --shell-status-muted: var(--danger-soft); }
`;

function HostStyles() {
  return <style>{HOST_CSS}</style>;
}

/** A token's computed value, resolved rather than transcribed. */
function resolveToken(root: HTMLElement, token: string): string {
  const probe = document.createElement('span');
  probe.style.color = `var(${token})`;
  root.append(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value;
}

const meta = {
  title: 'Controls/Banner',
  component: Banner,
  args: { children: 'An update is available.', status: undefined },
  argTypes: {
    status: {
      description:
        'Reaches the markup as `data-status`. The shipped stylesheet maps no value of it — a status vocabulary is the host\'s — so it draws the same neutral notice whatever you pass, until a host rule sets `--shell-status` and `--shell-status-muted`.',
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

/**
 * A dismissible notice carrying `blocked`. The amber comes from `controls.css`,
 * not the package: switch the Stylesheet toolbar to Package and it goes.
 */
export const Warning: Story = {
  args: {
    status: 'blocked',
    children: 'No local model is running.',
    onDismiss: () => undefined,
  },
};

/** The same shape with an action, and the same caveat about the colour. */
export const Failed: Story = {
  args: {
    status: 'failed',
    children: 'The last save failed.',
    action: <Button size="sm">Retry</Button>,
  },
};

/* -------------------------------------------------------------- the others */

/**
 * Five states with no rule mapping any of them.
 *
 * Under the Application stylesheet `controls.css` colours these. Under Package,
 * the only stylesheet a consumer installs, all five draw one neutral fill.
 * `Host mapping` below is the rule that parts them. Issue #182.
 */
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

/**
 * The same states with the host rule behind them, on both components that carry
 * one. The `play` resolves each token rather than transcribing it, so a palette
 * change cannot leave it passing against a colour nothing draws.
 */
export const HostMapping: StoryObj = {
  name: 'Host mapping',
  render: () => (
    <div style={{ width: 560, display: 'grid', gap: 'var(--space-3)' }}>
      <HostStyles />
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <StatusChip status="running" label="Running" />
        <StatusChip status="blocked" label="Needs approval" />
        <StatusChip status="done" label="Done" />
        <StatusChip status="failed" label="Failed" />
      </div>
      <Banner status="failed" testId="mapped-banner">
        The last save failed.
      </Banner>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const danger = resolveToken(canvasElement, '--danger');
    const success = resolveToken(canvasElement, '--success');

    await expect(danger).not.toBe('');
    await expect(danger).not.toBe(success);

    // The notice takes the mapped text colour.
    const banner = getComputedStyle(canvas.getByTestId('mapped-banner'));
    await expect(banner.color).toBe(danger);

    // And the pills part rather than sharing one fill.
    const done = getComputedStyle(canvas.getByText('Done'));
    const failed = getComputedStyle(canvas.getByText('Failed'));
    await expect(done.color).toBe(success);
    await expect(failed.color).toBe(danger);
    await expect(done.backgroundColor).not.toBe(failed.backgroundColor);
  },
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

export const Notes: StoryObj = {
  name: 'Note',
  render: () => (
    <div style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
      <Note>Point OpenAI-compatible clients at this address.</Note>
      <Note status="blocked" live="assertive">
        Could not reach the proxy. Check that it is running.
      </Note>
      <Note status="running" live="polite">
        Signing in…
      </Note>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // The failing note interrupts; the progress note waits. Passing the intent
    // rather than the attributes is the reason this is a component: the client
    // that hand-rolled it set `role="alert"` on every error and `aria-live` on
    // only half the polite ones.
    await expect(canvas.getByRole('alert')).toHaveTextContent('Could not reach the proxy');
    await expect(canvas.getByText('Signing in…')).toHaveAttribute('aria-live', 'polite');
  },
};

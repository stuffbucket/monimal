import { expect, within } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from './Button.js';
import { Callout } from './Callout.js';

/**
 * The shape three consumers built by hand rather than found here: a bordered
 * box that asks for a decision.
 *
 * The `play` on `Approval` measures the two things they each wrote CSS for —
 * an outline that takes the status colour, and two buttons side by side —
 * rather than asserting that they ought to work.
 */
const meta = {
  title: 'Controls/Callout',
  component: Callout,
  args: {
    title: 'Approval needed',
    status: undefined,
    children: 'The agent wants to run a command outside the workspace.',
  },
  argTypes: {
    status: {
      description:
        'Reaches the markup as `data-status`. The shipped stylesheet maps no value of it, so a host writes the rule that sets `--shell-status` and `--shell-status-muted`.',
      control: 'inline-radio',
      options: [undefined, 'running', 'blocked', 'done', 'failed'],
    },
    as: {
      description:
        'The heading level. Visible in the accessibility tree rather than in the pixels: the two draw identically.',
      control: 'inline-radio',
      options: ['h2', 'h3'],
    },
    children: { control: 'text' },
    actions: { table: { disable: true } },
  },
  render: (args) => (
    <div style={{ width: 460 }}>
      <Callout {...args} />
    </div>
  ),
} satisfies Meta<typeof Callout>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No status, which is a plain outlined box. */
export const Default: Story = {};

/**
 * The approval shape, with the command in the body and the decision at the
 * foot. The command chip is the caller's markup: the container models the
 * region, not the domain.
 */
export const Approval: Story = {
  args: {
    status: 'blocked',
    title: 'Approval needed',
    children: (
      <>
        <span>The agent wants to run a command outside the workspace.</span>
        <code className="field__value">rm -rf ./build && npm run package</code>
      </>
    ),
    actions: (
      <>
        <Button size="sm">Deny</Button>
        <Button size="sm" variant="primary" testId="callout-allow">
          Allow once
        </Button>
      </>
    ),
    testId: 'story-callout',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const callout = canvas.getByTestId('story-callout');

    // A named region, not a div with a bold line at the top.
    await expect(callout.tagName).toBe('SECTION');
    await expect(callout).toHaveAccessibleName('Approval needed');

    /*
     * The outline is what separates a callout from the surface under it, so it
     * is measured rather than assumed. The colour is not: it comes from the
     * status pair, which the shipped stylesheet maps nothing onto, and
     * `Host mapping` below measures that half.
     */
    const box = getComputedStyle(callout);
    await expect(box.borderTopWidth).toBe('1px');
    await expect(box.borderTopStyle).toBe('solid');
    await expect(box.borderTopColor).not.toBe('rgba(0, 0, 0, 0)');
    await expect(box.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');

    // Side by side, and the primary action last.
    const deny = canvas.getByRole('button', { name: 'Deny' }).getBoundingClientRect();
    const allow = canvas.getByTestId('callout-allow').getBoundingClientRect();
    await expect(allow.top).toBe(deny.top);
    await expect(allow.left).toBeGreaterThan(deny.right);

    // Inside the box, which a floated or absolutely positioned row would not be.
    const region = callout.getBoundingClientRect();
    await expect(allow.right).toBeLessThan(region.right);
    await expect(allow.bottom).toBeLessThan(region.bottom);
  },
};

/**
 * The host's half, which is where the colour comes from.
 *
 * The shipped stylesheet maps no status to a colour, so a callout with a status
 * and no rule behind it is the same box as one without. This story writes the
 * rule — one selector, the pair, exactly as `README.md` and
 * `e2e/fixtures/demo-shell/demo.css` write it — and the `play` measures that the
 * outline took it.
 */
export const HostMapping: Story = {
  name: 'Host mapping',
  args: {
    status: 'blocked',
    title: 'Approval needed',
    children: 'The outline here is a colour this story mapped, not one the package chose.',
    testId: 'mapped-callout',
  },
  render: (args) => (
    <div style={{ width: 460 }}>
      <style>{"[data-status='blocked'] { --shell-status: var(--warning); --shell-status-muted: var(--warning-soft); }"}</style>
      <Callout {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const border = getComputedStyle(canvas.getByTestId('mapped-callout')).borderTopColor;

    // Resolved from the token rather than transcribed, so a palette change
    // cannot leave this passing against a colour nothing draws any more.
    const probe = document.createElement('span');
    probe.style.color = 'var(--warning)';
    canvasElement.append(probe);
    const warning = getComputedStyle(probe).color;
    probe.remove();

    await expect(border).toBe(warning);
  },
};

/**
 * `as="h3"` for a callout under a heading of its own, such as an
 * `InspectorPanel` title. Nothing about the drawing changes.
 */
export const InAPanel: Story = {
  name: 'Inside a titled region',
  args: {
    as: 'h3',
    status: 'failed',
    title: 'Push rejected',
    children: 'The remote has commits this branch does not.',
    actions: <Button size="sm">Pull and retry</Button>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Push rejected' }).tagName).toBe('H3');
  },
};

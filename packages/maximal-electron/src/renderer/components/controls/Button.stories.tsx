import { PanelLeft, Trash2 } from 'lucide-react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button, IconButton } from './Button.js';

const meta = {
  title: 'Controls/Button',
  component: Button,
  args: {
    children: 'Check for updates',
    variant: 'default',
    size: 'md',
    disabled: false,
    block: false,
  },
  argTypes: {
    variant: { control: 'inline-radio', options: ['default', 'primary', 'danger'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    children: { control: 'text' },
    onClick: { action: 'clicked' },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The one affirmative action in a group. There should only be one. */
export const Primary: Story = { args: { variant: 'primary', children: 'Allow' } };

/** Destructive, and irreversible. Not merely "no". */
export const Danger: Story = { args: { variant: 'danger', children: 'Delete' } };

/**
 * Disabled is styled on the control class, not on a blanket attribute
 * selector. A global `[disabled]` rule was written and removed: it matched
 * nothing, and its presence still moved a captured layout.
 */
export const Disabled: Story = { args: { disabled: true } };

/** Fills its container. What the inspector's actions use. */
export const Block: Story = { args: { block: true } };

/** The three heights, from `--control-sm`, `--control-md` and `--control-lg`. */
export const Sizes: Story = {
  render: (args) => (
    <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
      <Button {...args} size="sm">
        Small
      </Button>
      <Button {...args} size="md">
        Medium
      </Button>
      <Button {...args} size="lg">
        Large
      </Button>
    </div>
  ),
};

/**
 * An icon button carries its label in a tooltip rather than on screen.
 *
 * It needs a `Tooltip.Provider` above it, which `.storybook/preview.ts`
 * supplies globally and `ShellLayout` supplies in the application. Rendered in
 * the overlay document, which has neither, it renders nothing at all — use
 * `Button` there.
 */
export const Icons: StoryObj<typeof IconButton> = {
  render: () => (
    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
      <IconButton label="Toggle panel" onClick={() => undefined}>
        <PanelLeft size={15} />
      </IconButton>
      <IconButton label="Active" onClick={() => undefined} active>
        <PanelLeft size={15} />
      </IconButton>
      <IconButton label="Delete" onClick={() => undefined} danger>
        <Trash2 size={15} />
      </IconButton>
      <IconButton label="Unavailable" onClick={() => undefined} disabled>
        <Trash2 size={15} />
      </IconButton>
    </div>
  ),
};

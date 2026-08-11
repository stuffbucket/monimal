import { FileText, FolderOpen } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { expect, within } from 'storybook/test';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Card, Row } from './Tile.js';

/**
 * Both are `role="option"` underneath.
 *
 * An option is only meaningful inside a listbox, which `Canvas` supplies in the
 * application, so these stories supply one too. A story that renders a
 * component outside the context it requires reports problems the product does
 * not have, and hides the ones it does.
 */

function Listbox({ children }: { children: ReactNode }) {
  return (
    <div role="listbox" aria-label="Items">
      {children}
    </div>
  );
}

/**
 * The caller's half of both seams, which is where a tile's colour comes from.
 *
 * No stylesheet in this repository maps `.card[data-status]` to anything, so
 * the `status` control moved nothing at all until this existed. The mapping
 * below is the one `e2e/fixtures/demo-shell/demo.css` writes for the same
 * props, and `.story-card` is a caller's modifier class reading the pair the
 * mapping publishes — a run card, in the smallest form that shows the seam.
 *
 * A story has no stylesheet of its own, so it renders one. Both selectors,
 * because an unscoped `.story-card` loses to `.sb-shell .card` on specificity
 * under the shipped stylesheet; `demo.css` carries the same note.
 */
const HOST_CSS = `
  [data-status='running'] { --shell-status: var(--accent); --shell-status-muted: var(--accent-soft); }
  [data-status='blocked'] { --shell-status: var(--warning); --shell-status-muted: var(--warning-soft); }
  [data-status='done'] { --shell-status: var(--success); --shell-status-muted: var(--success-soft); }
  [data-status='failed'] { --shell-status: var(--danger); --shell-status-muted: var(--danger-soft); }

  .story-card,
  .sb-shell .story-card {
    border-color: var(--shell-status, var(--border-subtle));
    background: var(--shell-status-muted, var(--bg-raised));
  }
`;

function HostStyles() {
  return <style>{HOST_CSS}</style>;
}

const meta = {
  title: 'Controls/Tile',
  component: Card,
  args: {
    selected: false,
    status: 'running',
    modifier: 'story-card',
    // Supplied by `render`; declared because the props are required.
    children: null,
    onSelect: () => undefined,
  },
  argTypes: {
    status: {
      description:
        'Reaches the markup as `data-status`. No stylesheet here maps a value of it — a status vocabulary is the host\'s — so it publishes `--shell-status` and `--shell-status-muted` to the subtree and draws nothing on its own. These stories map it the way the capture fixture does.',
      control: 'inline-radio',
      options: [undefined, 'running', 'blocked', 'done', 'failed'],
    },
    modifier: {
      description:
        'A class of yours beside `card`, and the seam that lays a tile out. `.story-card` here reads the status pair for its border and fill; clear this field and the tile falls back to the plain one.',
      control: 'text',
    },
    children: { table: { disable: true } },
  },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CardTile: Story = {
  name: 'Card',
  render: (args) => (
    <>
      <HostStyles />
      <Listbox>
        <Card {...args} onSelect={() => undefined}>
          <span className="card__thumb">
            <FolderOpen size={28} />
          </span>
          <span className="card__meta">
            <span className="card__name">Design system</span>
            <span className="card__sub">Edited today</span>
          </span>
        </Card>
      </Listbox>
    </>
  ),
};

export const Selected: Story = {
  ...CardTile,
  args: { ...meta.args, selected: true },
};

/**
 * The same tile with no modifier, which is what the package draws unaided.
 *
 * The `play` measures both seams at once: the plain tile and the modified one
 * differ in border colour, and the modified one takes the colour the host
 * mapped the status to. Without the modifier a status changes nothing, which
 * is the thing the docs page used to imply otherwise.
 */
export const Modifier: Story = {
  name: 'Modifier',
  args: { ...meta.args, status: 'blocked' },
  render: (args) => (
    <>
      <HostStyles />
      <div role="listbox" aria-label="Items" style={{ display: 'flex', gap: 12 }}>
        <Card {...args} modifier={undefined} testId="plain" onSelect={() => undefined}>
          <span className="card__meta">
            <span className="card__name">No modifier</span>
            <span className="card__sub">Plain border</span>
          </span>
        </Card>
        <Card {...args} testId="modified" onSelect={() => undefined}>
          <span className="card__meta">
            <span className="card__name">story-card</span>
            <span className="card__sub">Border from the status pair</span>
          </span>
        </Card>
      </div>
    </>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const plain = getComputedStyle(canvas.getByTestId('plain'));
    const modified = getComputedStyle(canvas.getByTestId('modified'));

    // Both carry the status. Only the one with the modifier draws from it.
    await expect(canvas.getByTestId('plain')).toHaveAttribute('data-status', 'blocked');
    await expect(modified.borderTopColor).not.toBe(plain.borderTopColor);

    // The mapped colour, resolved rather than asserted from the token name.
    const probe = document.createElement('span');
    probe.style.color = 'var(--warning)';
    canvasElement.append(probe);
    const warning = getComputedStyle(probe).color;
    probe.remove();

    await expect(warning).not.toBe('');
    await expect(modified.borderTopColor).toBe(warning);
  },
};

export const RowTile: StoryObj = {
  name: 'Row',
  render: function RowRender() {
    const [picked, setPicked] = useState('a');
    return (
      <div style={{ width: 420 }} role="listbox" aria-label="Items">
        <Row selected={picked === 'a'} onSelect={() => setPicked('a')}>
          <FileText size={14} />
          <span className="row__name">Marketing site</span>
          <span className="row__sub">2 days ago</span>
        </Row>
        <Row selected={picked === 'b'} onSelect={() => setPicked('b')}>
          <FileText size={14} />
          <span className="row__name">Icon set</span>
          <span className="row__sub">Last week</span>
        </Row>
      </div>
    );
  },
};

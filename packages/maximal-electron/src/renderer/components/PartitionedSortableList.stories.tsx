import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import {
  PartitionedSortableList,
  type PartitionedSortableItem,
} from './PartitionedSortableList.js';

const INITIAL_ENABLED = [
  { id: 'local', label: 'Local index', description: 'Search a local project index.' },
  { id: 'remote', label: 'Remote search', description: 'Search through a hosted provider.' },
];
const INITIAL_DISABLED = [
  { id: 'fallback', label: 'Public fallback', description: 'No-key public search.' },
];

function SortableExample() {
  const [enabled, setEnabled] = useState<PartitionedSortableItem[]>(INITIAL_ENABLED);
  const [disabled, setDisabled] = useState<PartitionedSortableItem[]>(INITIAL_DISABLED);
  return (
    <PartitionedSortableList
      enabledItems={enabled}
      disabledItems={disabled}
      renderDetails={(item) => <p>{item.label} settings</p>}
      onChange={(nextEnabled, nextDisabled) => {
        setEnabled(nextEnabled);
        setDisabled(nextDisabled);
      }}
    />
  );
}

const meta = {
  title: 'Controls/PartitionedSortableList',
  component: PartitionedSortableList,
  args: {
    enabledItems: INITIAL_ENABLED,
    disabledItems: INITIAL_DISABLED,
    onChange: () => undefined,
  },
  render: () => <SortableExample />,
  decorators: [(Story) => <div style={{ width: 720 }}><Story /></div>],
} satisfies Meta<typeof PartitionedSortableList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const list = canvas.getByRole('list', { name: 'Provider order' });
    await expect(list).toBeVisible();
    await expect(within(list).getAllByRole('listitem')[2]).toHaveTextContent('Public fallback');
    await expect(within(list).getAllByRole('listitem')[2]).toHaveAttribute('data-enabled', 'false');

    const moveUp = canvas.getByRole('button', { name: 'Move Remote search up' });
    await userEvent.hover(moveUp);
    await expect(await body.findByText('Move up', { selector: '.tooltip' })).toBeVisible();
    await userEvent.unhover(moveUp);
    await userEvent.click(moveUp);
    await expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Remote search');

    const enabledToggle = canvas.getByRole('switch', { name: 'Disable Remote search' });
    await userEvent.hover(enabledToggle);
    await expect(await body.findByText('Enabled', { selector: '.tooltip' })).toBeVisible();
    await userEvent.unhover(enabledToggle);
    await userEvent.click(enabledToggle);
    const rows = within(list).getAllByRole('listitem');
    await expect(rows[2]).toHaveTextContent('Remote search');
    const disabledToggle = canvas.getByRole('switch', { name: 'Enable Remote search' });
    await expect(disabledToggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.unhover(disabledToggle);
    await userEvent.hover(disabledToggle);
    await expect(await body.findByText('Disabled', { selector: '.tooltip' })).toBeVisible();
    await userEvent.unhover(disabledToggle);

    await userEvent.click(canvas.getByRole('button', { name: 'Configure Local index' }));
    await expect(canvas.getByText('Local index settings')).toBeVisible();
  },
};

export const AttentionRequired: Story = {
  render: () => (
    <PartitionedSortableList
      enabledItems={[]}
      disabledItems={[
        {
          id: 'remote',
          label: 'Remote search',
          description: 'Search through a hosted provider.',
          toggleBlocked: true,
          toggleTooltip: 'Unavailable until required settings are complete.',
        },
      ]}
      renderDetails={() => <p>API key is required.</p>}
      onChange={() => undefined}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('switch', { name: 'Enable Remote search' }));
    await expect(await canvas.findByText('API key is required.')).toBeVisible();
    await expect(
      canvas.getByRole('switch', { name: 'Enable Remote search' }),
    ).toHaveAttribute('aria-checked', 'false');
    await expect(
      canvas.getByRole('button', { name: 'Collapse Remote search' }),
    ).toHaveAttribute('aria-expanded', 'true');
  },
};
import type { Meta, StoryObj } from '@maximal/maximal-storybook';

import { RetainedTabPanels } from './RetainedTabPanels.js';

type Item = { id: string; body: string };

const meta = {
  title: 'Components/RetainedTabPanels',
  component: RetainedTabPanels<Item>,
  args: {
    items: [{ id: 'one', body: 'First panel' }, { id: 'two', body: 'Second panel' }],
    activeId: 'one',
    renderPanel: (item: Item) => <p>{item.body}</p>,
  },
} satisfies Meta<typeof RetainedTabPanels<Item>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SecondActive: Story = { args: { activeId: 'two' } };

import type { Meta, StoryObj } from '@storybook/react-vite';

import { SplitTree } from './SplitTree.js';

type Leaf = { label: string };

const meta = {
  title: 'Components/SplitTree',
  component: SplitTree<Leaf>,
  args: {
    id: 'story',
    node: {
      direction: 'right',
      first: { label: 'Left' },
      second: { direction: 'down', first: { label: 'Top right' }, second: { label: 'Bottom right' } },
    },
    renderLeaf: (leaf: Leaf) => <div style={{ padding: 12 }}>{leaf.label}</div>,
  },
  decorators: [(Story) => <div style={{ height: 320 }}><Story /></div>],
} satisfies Meta<typeof SplitTree<Leaf>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Leaf: Story = { args: { node: { label: 'Only pane' } } };

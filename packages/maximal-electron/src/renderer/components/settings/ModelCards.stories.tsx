import type { Meta, StoryObj } from '@maximal/maximal-storybook';

import { SAMPLE_MODELS } from '../../../../.storybook/sample-settings.js';

import { ModelCardGrid } from './ModelCards.js';

const meta = {
  title: 'Settings/ModelCardGrid',
  component: ModelCardGrid,
  args: {
    models: SAMPLE_MODELS,
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ModelCardGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {};

export const Empty: Story = {
  args: { models: [] },
};
